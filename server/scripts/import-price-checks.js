// Load BookMyCar "price checks with phone" CSV exports into the BMC Price Checks page (workspace `pricechecks`).
// Rows are keyed by Ref, so re-running with a newer export updates price checks in place and adds new ones;
// price checks edited in the CRM (follow-up, note, ...) are left alone.
// Usage (from server/):  node --env-file=.env scripts/import-price-checks.js <file.csv> [more.csv ...] [--dry]
import fs from 'node:fs';
import mongoose from 'mongoose';
import { mapHeaders, rowText, typedValues } from '../src/services/workspaces.js';
import { getWorkspace } from '../src/workspaces.js';
import { SheetRow } from '../src/models/SheetRow.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');
if (!files.length) {
  console.error('usage: node --env-file=.env scripts/import-price-checks.js <file.csv> [...] [--dry]');
  process.exit(1);
}
const ws = getWorkspace('pricechecks');

/** RFC 4180 CSV -> rows of cells (quoted fields may hold commas, quotes ("") and line breaks). */
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

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const edited = new Set((await SheetRow.find({ workspace: ws.key, editedAt: { $ne: null } }).select('key').lean()).map((d) => d.key));
const now = new Date();
let total = 0;
for (const file of files) {
  const [headers, ...lines] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const mapping = mapHeaders(ws, headers);
  if (!mapping || !Object.values(mapping).includes('ref')) throw new Error(`${file}: no Ref column`);
  const rows = [];
  lines.forEach((cells, i) => {
    const values = Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? '']));
    const text = rowText(ws, { values }, mapping);
    if (!text.ref) return;
    // "2026-10-29 10:45": the date goes to Checked on, the time to Time (NY)
    const checked = values[headers.find((h) => mapping[h] === 'checkDate')] || '';
    text.checkTime = checked.split(' ')[1] || '';
    text.followUp = /^yes$/i.test(text.booked) ? 'Booked' : 'New';
    rows.push({ key: text.ref.toLowerCase(), rowNumber: i + 2, text });
  });
  const fresh = rows.filter((r) => !edited.has(r.key));
  console.log(`${file.split(/[\\/]/).pop()}: ${rows.length} price checks${rows.length - fresh.length ? ` (${rows.length - fresh.length} edited in the CRM, kept)` : ''}`);
  total += rows.length;
  if (dry) continue;
  const ops = fresh.map((r) => ({
    updateOne: {
      filter: { workspace: ws.key, key: r.key },
      update: {
        $set: { source: 'sheet', tab: 'Price checks', rowNumber: r.rowNumber, values: typedValues(ws, r.text), sheet: r.text, syncedAt: now, missingSince: null },
        $setOnInsert: { workspace: ws.key, key: r.key, spreadsheetId: '', rank: 0, editedAt: null, updatedBy: '' },
      },
      upsert: true,
    },
  }));
  if (ops.length) {
    const res = await SheetRow.bulkWrite(ops, { ordered: false });
    console.log(`  written: ${res.upsertedCount} new, ${res.modifiedCount} updated`);
  }
}
console.log(`${total} price checks${dry ? ' (dry run, nothing written)' : ''}`);
await mongoose.disconnect();
