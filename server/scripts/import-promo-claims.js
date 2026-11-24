// Load BookMyCar "promo-code-claims" CSV exports into the BMC Price Checks page (workspace `pricechecks`).
// Each claim is keyed by its promo code (several exports of the same claims: the last file given wins).
// A claimer who already has a price check is merged into it (the price check gets the Promo code column);
// the rest become their own row until a later price-check export brings in their price check (see promo.js).
// Usage (from server/):  node --env-file=.env scripts/import-promo-claims.js <older.csv> [newer.csv ...] [--dry]
import fs from 'node:fs';
import mongoose from 'mongoose';
import { typedValues } from '../src/services/workspaces.js';
import { getWorkspace } from '../src/workspaces.js';
import { SheetRow } from '../src/models/SheetRow.js';
import { mergePromoRows } from './promo.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');
if (!files.length) {
  console.error('usage: node --env-file=.env scripts/import-promo-claims.js <file.csv> [...] [--dry]');
  process.exit(1);
}
const ws = getWorkspace('pricechecks');

/** RFC 4180 CSV -> rows of cells. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), (i += 1);
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const to24 = (h, m, ap) => `${String((+h % 12) + (/pm/i.test(ap) ? 12 : 0)).padStart(2, '0')}:${m}`;

/** One claim -> the price-check text fields. "Claimed (NY)" = "11/23/2026, 3:20:56 PM" becomes Checked on / Time (NY). */
function claimText(c) {
  const code = c['Promo code'].trim();
  const claimed = c['Claimed (NY)'].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}):\d{2} (AM|PM)$/);
  if (!claimed) throw new Error(`${code}: can't read Claimed (NY) "${c['Claimed (NY)']}"`);
  const [pickup = '', dropoff = ''] = c['Price check: trip'].split(' → ');
  const [rideDate = '', rideTime = ''] = c['Price check: date/time'].split(' ');
  const hasRide = /^yes/i.test(c['Has a ride?']);
  const note = [`Claimed promo ${code}`, `code used: ${c['Code used?'] || '?'}`, c.Rides && `rides: ${c.Rides}`, c['Reminder email sent'] && `reminder email: ${c['Reminder email sent']}`].filter(Boolean).join(' · ');
  return {
    ...Object.fromEntries(ws.fields.map((f) => [f.key, ''])),
    ref: code,
    promo: code,
    followUp: hasRide ? 'Booked' : 'New',
    checkDate: `${claimed[3]}-${claimed[1].padStart(2, '0')}-${claimed[2].padStart(2, '0')}`,
    checkTime: to24(claimed[4], claimed[5], claimed[6]),
    phone: c.Mobile,
    email: c.Email,
    pickup,
    dropoff,
    rideDate,
    rideTime,
    prices: c['SUV price quoted'] ? `Luxury SUV ${c['SUV price quoted']}` : '',
    booked: hasRide ? 'Yes' : 'No',
    note,
  };
}

const claims = new Map();
for (const file of files) {
  const [headers, ...lines] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!headers.includes('Promo code')) throw new Error(`${file}: no Promo code column`);
  let n = 0;
  for (const cells of lines) {
    const c = Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? '']));
    if (!c['Promo code'].trim()) continue;
    claims.set(c['Promo code'].trim().toLowerCase(), claimText(c));
    n += 1;
  }
  console.log(`${file.split(/[\\/]/).pop()}: ${n} claims`);
}
console.log(`${claims.size} different claims`);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const edited = new Set((await SheetRow.find({ workspace: ws.key, key: { $in: [...claims.keys()] }, editedAt: { $ne: null } }).select('key').lean()).map((d) => d.key));
const now = new Date();
const fresh = [...claims].filter(([key]) => !edited.has(key));
if (edited.size) console.log(`${edited.size} claim rows already worked in the CRM, kept`);
if (!dry && fresh.length) {
  const res = await SheetRow.bulkWrite(
    fresh.map(([key, text], i) => ({
      updateOne: {
        filter: { workspace: ws.key, key },
        update: {
          $set: { source: 'sheet', tab: 'Promo claims', rowNumber: i + 2, values: typedValues(ws, text), sheet: text, syncedAt: now, missingSince: null },
          $setOnInsert: { workspace: ws.key, key, spreadsheetId: '', rank: 0, editedAt: null, updatedBy: '' },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  console.log(`  written: ${res.upsertedCount} new, ${res.modifiedCount} updated`);
}
// dry: the claims aren't written, so only people already on the page as a claim row show here
console.log('merging claimers who already have a price check:');
const merged = await mergePromoRows(ws, { dry });
console.log(`${merged} merged into their price checks${dry ? ' (dry run, nothing written)' : ''}`);
await mongoose.disconnect();
