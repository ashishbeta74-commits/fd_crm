// Import (or re-sync) every Google Sheet listed in server/sheets.json through the running API.
// Usage (from server/):  node scripts/import-links.js            -> import new sheets, re-sync already linked ones
//                        node scripts/import-links.js --dry      -> only preview: rows, mapped columns, unmapped headers
//                        node scripts/import-links.js --only 3   -> only the 3rd entry
// Env: API_URL (default http://localhost:4000/api)
import fs from 'node:fs';
import path from 'node:path';

const API = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.includes('--only') ? Number(args[args.indexOf('--only') + 1]) : 0;
const sheets = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'sheets.json'), 'utf8'));

async function call(method, p, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.API_TOKEN) headers.Authorization = `Bearer ${process.env.API_TOKEN}`;
  const res = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || res.statusText}`);
  return data;
}

const idOf = (url) => (url.match(/\/d\/([a-zA-Z0-9-_]+)/) || [])[1] || '';
// The list itself (name, date, link, tabs, note) is saved in the database first, so it survives restarts
// and shows on the Import page even for sheets that cannot be imported yet (private, empty).
if (!dry) {
  const items = sheets.map((e) => ({ url: e.url, name: e.name, date: e.date || '', tabs: e.tabs || (e.tab ? [e.tab] : undefined), note: e.note || '' }));
  const saved = await call('POST', '/sheets/bulk', { items });
  console.log(`saved ${saved.items.length} sheets in the database`);
}
const sources = (await call('GET', '/imports/sources')).items;
let i = 0;
for (const entry of sheets) {
  i += 1;
  if (only && i !== only) continue;
  const label = `${i}. ${entry.name}`;
  try {
    const existing = sources.find((s) => s.spreadsheetId === idOf(entry.url));
    if (existing && !dry) {
      const t = Date.now();
      const b = await call('POST', `/imports/${existing.lastBatchId}/resync`, {});
      console.log(`${label}: re-synced "${existing.listName}" in ${Math.round((Date.now() - t) / 1000)}s -> ${JSON.stringify(b.totals)}`);
      continue;
    }
    const t = Date.now();
    const p = await call('POST', '/imports/link/preview', { url: entry.url });
    // Optional "tab" (or "tabs": [...]) in sheets.json overrides which workbook tab(s) to import.
    const wantedTabs = entry.tabs || (entry.tab ? [entry.tab] : null);
    if (wantedTabs) {
      const missing = wantedTabs.filter((t) => !p.sheets.some((s) => s.name === t));
      if (missing.length) throw new Error(`tab(s) not found: ${missing.join(', ')} (tabs: ${p.sheets.map((s) => s.name).join(', ')})`);
      for (const s of p.sheets) s.include = wantedTabs.includes(s.name);
    }
    const linked = p.sheets.find((s) => s.include) || p.sheets[0];
    const mapped = Object.entries(linked.suggestedMapping).filter(([, k]) => k);
    const unmapped = Object.entries(linked.suggestedMapping).filter(([, k]) => !k).map(([h]) => h);
    console.log(`${label}: "${p.source.title}" tab "${linked.name}" ${linked.rowCount} rows, ${mapped.length}/${linked.headers.length} columns mapped (${Math.round((Date.now() - t) / 1000)}s)`);
    if (unmapped.length) console.log(`     not imported: ${unmapped.join(' | ')}`);
    const needed = ['name', 'contactMain'];
    const missing = needed.filter((k) => !mapped.some(([, v]) => v === k));
    if (missing.length) console.log(`     WARNING: no column mapped to ${missing.join(', ')}`);
    if (dry) {
      console.log(`     mapping: ${mapped.map(([h, k]) => `${h}->${k}`).join(', ')}`);
      continue;
    }
    const t2 = Date.now();
    const b = await call('POST', '/imports/commit', {
      uploadId: p.uploadId,
      duplicateStrategy: 'skip',
      updateStage: false,
      requirePhone: true,
      listName: entry.name,
      sheets: p.sheets.map((s) => ({ name: s.name, include: s.include, mapping: s.suggestedMapping })),
    });
    console.log(`     imported as "${b.source.listName}" in ${Math.round((Date.now() - t2) / 1000)}s -> ${JSON.stringify(b.totals)}`);
  } catch (err) {
    console.log(`${label}: FAILED - ${err.message}`);
  }
}
