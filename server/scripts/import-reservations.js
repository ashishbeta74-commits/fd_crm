// Load Limo Anywhere "Reservations By Customer Summary" exports into the Reservations page (workspace
// `reservations`), one tab per year. Rows are keyed by Conf#, so re-running with a newer export updates
// trips in place and adds new ones; trips edited in the CRM are left alone.
// Usage (from server/):  node --env-file=.env scripts/import-reservations.js <file.xlsx> [more.xlsx ...] [--dry]
import fs from 'node:fs';
import mongoose from 'mongoose';
// exceljs's own dependency; used to repair the export before exceljs reads it
import JSZip from 'jszip';
import { parseWorkbook } from '../src/services/excel.js';
import { mapHeaders, rowText, typedValues } from '../src/services/workspaces.js';
import { getWorkspace } from '../src/workspaces.js';
import { SheetRow } from '../src/models/SheetRow.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');
if (!files.length) {
  console.error('usage: node --env-file=.env scripts/import-reservations.js <file.xlsx> [...] [--dry]');
  process.exit(1);
}
const ws = getWorkspace('reservations');

// Limo Anywhere writes the sheet XML with an "x:" namespace prefix and non-standard document properties,
// both of which exceljs rejects: strip the prefix and drop the properties.
async function readExport(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  zip.remove('docProps/core.xml');
  zip.remove('docProps/app.xml');
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('xl/') || !name.endsWith('.xml')) continue;
    const xml = await zip.file(name).async('string');
    zip.file(name, xml.replace(/<(\/?)x:/g, '<$1').replace('xmlns:x="', 'xmlns="'));
  }
  return parseWorkbook(await zip.generateAsync({ type: 'nodebuffer' }), file);
}

const usDate = (s) => {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
};
const na = (s) => (/^n\/?a$/i.test(String(s).trim()) ? '' : s);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const edited = new Set((await SheetRow.find({ workspace: ws.key, editedAt: { $ne: null } }).select('key').lean()).map((d) => d.key));
const now = new Date();
let total = 0;
for (const file of files) {
  const [sheet] = await readExport(file);
  const mapping = mapHeaders(ws, sheet.headers);
  if (!mapping) throw new Error(`${file}: no Conf# / passenger columns`);
  const rows = [];
  for (const row of sheet.rows) {
    const v = row.values;
    // the export ends with summary lines (counts, date range, totals) that have no Conf#
    if (!/^\d+$/.test(String(v['Conf#'] ?? '').trim())) continue;
    const text = rowText(ws, row, mapping);
    for (const k of Object.keys(text)) text[k] = na(text[k]);
    text.puDate = usDate(v['PU Date']);
    text.passenger = [v['Passenger First Name'], v['Passenger Last Name']].map((x) => na(String(x ?? '')).trim()).filter(Boolean).join(' ');
    // a passenger is the same person across trips by name (the export's email is often the booker's), else by email
    const name = text.passenger.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    text.paxKey = name || (text.passengerEmail || '').toLowerCase().split(/[;,\s]+/)[0] || `conf:${text.confNo}`;
    rows.push({ key: text.confNo.toLowerCase(), rowNumber: row.rowNumber, text });
  }
  // the tab is the year most trips fall in (each export covers one year)
  const years = {};
  for (const r of rows) years[r.text.puDate.slice(0, 4)] = (years[r.text.puDate.slice(0, 4)] || 0) + 1;
  const tab = Object.entries(years).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Reservations';
  const fresh = rows.filter((r) => !edited.has(r.key));
  console.log(`${file.split(/[\\/]/).pop()}: ${rows.length} trips -> tab ${tab}${rows.length - fresh.length ? ` (${rows.length - fresh.length} edited in the CRM, kept)` : ''}`);
  total += rows.length;
  if (dry) continue;
  const ops = fresh.map((r) => ({
    updateOne: {
      filter: { workspace: ws.key, key: r.key },
      update: {
        $set: { source: 'sheet', tab, rowNumber: r.rowNumber, values: typedValues(ws, r.text), sheet: r.text, syncedAt: now, missingSince: null },
        $setOnInsert: { workspace: ws.key, key: r.key, spreadsheetId: '', rank: 0, editedAt: null, updatedBy: '' },
      },
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += 2000) {
    const res = await SheetRow.bulkWrite(ops.slice(i, i + 2000), { ordered: false });
    console.log(`  written: ${res.upsertedCount} new, ${res.modifiedCount} updated`);
  }
}
console.log(`${total} trips${dry ? ' (dry run, nothing written)' : ''}`);
await mongoose.disconnect();
