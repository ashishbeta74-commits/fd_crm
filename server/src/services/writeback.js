// Two-way sync: write CRM state back into linked Google Sheets.
//
// For every contact that came from a linked sheet the CRM fills a block of "CRM ..." columns on the
// contact's row (Stage, Priority, Tags, Follow-up, Booking, Last call, Status, Notes, Link, Updated).
// The columns are created at the right end of the tab when missing and are ignored by the import, so
// the team's own columns are never touched. Optionally (per sheet) the mapped Stage / Next follow-up /
// Booking / Priority / Tags columns are updated too.
//
// Rows are matched by the row number remembered at import time (verified against the row's email /
// name) and otherwise by email, name + company or name + phone, so inserted or sorted rows still work.
//
// Pushes happen: on demand (POST /api/sheets/:id/push, all contacts of the sheet) and automatically
// a few seconds after contacts change in the CRM (only the changed contacts).
import { Contact } from '../models/Contact.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { LinkedSheet } from '../models/LinkedSheet.js';
import { events } from '../lib/events.js';
import { HttpError } from '../lib/errors.js';
import { isoDate } from '../lib/dates.js';
import { normalizeHeader } from '../lib/mapping.js';
import { isCrmColumn, priorityLabel, stageLabel } from '../fields.js';
import { googleAuthInfo, googleFetch, isGoogleConfigured } from './googleAuth.js';
import { formatZoned } from '../config/timezone.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const DEBOUNCE_MS = Math.max(5, Number(process.env.SHEET_WRITEBACK_SECONDS) || 20) * 1000;
const MAX_RANGES_PER_REQUEST = 400;

const fmtDateTime = (d) => formatZoned(d); // New York time in the sheet, like everywhere else

/** The block of columns the CRM owns in a linked tab, in this order. */
export const CRM_COLUMNS = [
  { header: 'CRM Stage', value: (c) => stageLabel(c.stage) },
  { header: 'CRM Priority', value: (c) => priorityLabel(c.priority) },
  { header: 'CRM Tags', value: (c) => (c.tags || []).join(', ') },
  { header: 'CRM Follow-up', value: (c) => isoDate(c.followUp) },
  { header: 'CRM Follow-up Note', value: (c) => c.followUpNote || '' },
  { header: 'CRM Booking', value: (c) => (c.booking?.date ? `${isoDate(c.booking.date)}${c.booking.time ? ` ${c.booking.time}` : ''}${c.booking.note ? ` - ${c.booking.note}` : ''}` : '') },
  { header: 'CRM Last Call', value: (c) => isoDate(c.lastContactedAt) },
  { header: 'CRM Status', value: (c) => c.status || '' },
  { header: 'CRM Notes', value: (c) => c.notes || '' },
  { header: 'CRM Link', value: (c) => `${APP_URL}/contacts/${c._id}` },
  { header: 'CRM Updated', value: (c) => fmtDateTime(c.updatedAt) },
];

// Mapped sheet columns that may be updated in place (never the calling rounds / remarks / status text).
const MAPPED_WRITERS = {
  stage: (c) => stageLabel(c.stage),
  // Mappings saved before call outcomes became stages: the old "Started (call outcome)" column shows the stage too.
  callOutcome: (c) => stageLabel(c.stage),
  followUp: (c) => isoDate(c.followUp),
  bookingDate: (c) => isoDate(c.booking?.date),
  bookingTime: (c) => c.booking?.time || '',
  priority: (c) => priorityLabel(c.priority),
  tags: (c) => (c.tags || []).join(', '),
};

const CONTACT_FIELDS = 'name email primaryEmail secondaryEmail companyName contactMain companyNo stage priority tags followUp followUpNote booking lastContactedAt status notes updatedAt source importBatchIds';

export function columnLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

const quoteTab = (title) => `'${String(title).replace(/'/g, "''")}'`;

/** Same header naming as excel.js parseSheet: blanks become "Column C", duplicates get " (2)", " (3)"... */
export function nameHeaders(cells) {
  const headers = [];
  const seen = new Set();
  cells.forEach((raw, i) => {
    let h = String(raw ?? '').trim();
    if (!h) h = `Column ${columnLetter(i + 1)}`;
    const base = h;
    let n = 2;
    while (seen.has(h)) h = `${base} (${n++})`;
    seen.add(h);
    headers.push(h);
  });
  return headers;
}

/** Digits without a leading US country code, last 10 kept ("+1 (212) 555-0100" == "212-555-0100"). */
const digits = (s) => {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
};

/** Matching keys of a contact, most reliable first. */
export function contactKeys(c) {
  const keys = [];
  for (const k of ['email', 'primaryEmail', 'secondaryEmail']) {
    const e = String(c[k] || '').trim().toLowerCase();
    if (e.includes('@')) keys.push(`e:${e}`);
  }
  const n = normalizeHeader(c.name || '');
  const co = normalizeHeader(c.companyName || '');
  if (n && co) keys.push(`nc:${n}|${co}`);
  for (const k of ['contactMain', 'companyNo']) {
    const p = digits(c[k]);
    if (n && p.length >= 6) keys.push(`np:${n}|${p.slice(-10)}`);
  }
  return keys;
}

/** Keys of one sheet row, using the columns the import mapping says are emails / name / company / phones. */
export function rowKeys(row, cols) {
  const keys = [];
  const cell = (i) => (i == null ? '' : String(row[i] ?? '').trim());
  for (const i of cols.emails) {
    const e = cell(i).toLowerCase();
    if (e.includes('@')) keys.push(`e:${e}`);
  }
  const n = normalizeHeader(cell(cols.name));
  const co = normalizeHeader(cell(cols.company));
  if (n && co) keys.push(`nc:${n}|${co}`);
  for (const i of cols.phones) {
    const p = digits(cell(i));
    if (n && p.length >= 6) keys.push(`np:${n}|${p.slice(-10)}`);
  }
  return keys;
}

async function sheetMeta(spreadsheetId) {
  const meta = await googleFetch(`${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`);
  return (meta.sheets || []).map((s) => s.properties);
}

async function readTab(spreadsheetId, title) {
  const data = await googleFetch(`${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(quoteTab(title))}?majorDimension=ROWS`);
  return data.values || [];
}

async function writeValues(spreadsheetId, data) {
  for (let i = 0; i < data.length; i += MAX_RANGES_PER_REQUEST) {
    await googleFetch(`${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: { valueInputOption: 'USER_ENTERED', data: data.slice(i, i + MAX_RANGES_PER_REQUEST) },
    });
  }
}

async function appendColumns(spreadsheetId, sheetId, length) {
  await googleFetch(`${SHEETS}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests: [{ appendDimension: { sheetId, dimension: 'COLUMNS', length } }] },
  });
}

/** Turn {row -> {col -> value}} into A1 ranges, one per run of adjacent columns. */
export function cellsToRanges(title, cells) {
  const data = [];
  for (const [row, byCol] of cells) {
    const cols = [...byCol.keys()].sort((a, b) => a - b);
    let start = 0;
    while (start < cols.length) {
      let end = start;
      while (end + 1 < cols.length && cols[end + 1] === cols[end] + 1) end += 1;
      const values = cols.slice(start, end + 1).map((c) => byCol.get(c));
      data.push({ range: `${quoteTab(title)}!${columnLetter(cols[start] + 1)}${row}:${columnLetter(cols[end] + 1)}${row}`, values: [values] });
      start = end + 1;
    }
  }
  return data;
}


/**
 * Read one tab and work out where things are: the header row, the row index by contact key, where the
 * CRM columns sit (or will be appended) and which mapped columns may be updated in place.
 */
async function loadTabState({ spreadsheetId, tab, plan, updateMapped }) {
  const rows = await readTab(spreadsheetId, tab.title);
  let headerIdx = rows.findIndex((r) => r.filter((v) => String(v ?? '').trim()).length >= 2);
  if (headerIdx === -1) {
    if (!rows.length) headerIdx = 0;
    else throw new Error(`Tab "${tab.title}" has no header row`);
  }
  const headers = nameHeaders(rows[headerIdx] || []);
  const mapping = plan?.mapping || {};
  const colOf = (key) => {
    const i = headers.findIndex((h) => mapping[h] === key);
    return i === -1 ? null : i;
  };
  const colsOf = (keys) => headers.map((h, i) => (keys.includes(mapping[h]) ? i : -1)).filter((i) => i >= 0);
  const keyCols = { emails: colsOf(['email', 'primaryEmail', 'secondaryEmail']), name: colOf('name'), company: colOf('companyName'), phones: colsOf(['contactMain', 'companyNo']) };

  // key -> 1-based row number (first occurrence wins) + per-row keys for the remembered-row check
  const index = new Map();
  const keysByRow = new Map();
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const ks = rowKeys(rows[i], keyCols);
    keysByRow.set(i + 1, ks);
    for (const k of ks) if (!index.has(k)) index.set(k, i + 1);
  }

  // CRM columns: reuse existing ones (any order), append the missing ones after the last used column.
  const upper = headers.map((h) => h.trim().toUpperCase());
  let nextCol = Math.max(headers.length, ...rows.map((r) => r.length));
  const crmCol = new Map();
  const newHeaders = new Map(); // col -> header text (written with the first batch)
  for (const col of CRM_COLUMNS) {
    let i = upper.indexOf(col.header.toUpperCase());
    if (i === -1) {
      i = nextCol++;
      newHeaders.set(i, col.header);
    }
    crmCol.set(col.header, i);
  }
  const mappedCols = updateMapped
    ? Object.entries(MAPPED_WRITERS)
        .map(([key, fn]) => ({ cols: headers.map((h, i) => (mapping[h] === key && !isCrmColumn(h) ? i : -1)).filter((i) => i >= 0), fn }))
        .filter((m) => m.cols.length)
    : [];
  const have = tab.gridProperties?.columnCount || 0;
  if (nextCol > have) await appendColumns(spreadsheetId, tab.sheetId, nextCol - have);

  return { title: tab.title, headerIdx, index, keysByRow, crmCol, newHeaders, mappedCols, addedColumns: [...newHeaders.values()] };
}

/** Write the CRM block for each contact that can be located in the tab. Returns the contacts that could not. */
async function writeContacts(spreadsheetId, state, contacts) {
  const cells = new Map(); // row -> Map(col -> value)
  const put = (row, col, value) => {
    if (!cells.has(row)) cells.set(row, new Map());
    cells.get(row).set(col, value);
  };
  if (state.newHeaders.size) {
    for (const [col, text] of state.newHeaders) put(state.headerIdx + 1, col, text);
    state.newHeaders.clear();
  }
  const unmatched = [];
  let matched = 0;
  for (const c of contacts) {
    const keys = contactKeys(c);
    let row = null;
    // 1. the row remembered at import time, if it still holds this contact
    if (c.source?.tabName === state.title && c.source?.row && state.keysByRow.has(c.source.row)) {
      const rk = state.keysByRow.get(c.source.row);
      if (rk.some((k) => keys.includes(k)) || (!rk.length && !keys.length)) row = c.source.row;
    }
    // 2. any key match (email first, then name + company, then name + phone)
    if (!row) {
      for (const k of keys) {
        if (state.index.has(k)) {
          row = state.index.get(k);
          break;
        }
      }
    }
    if (!row) {
      unmatched.push(c);
      continue;
    }
    matched += 1;
    for (const col of CRM_COLUMNS) put(row, state.crmCol.get(col.header), col.value(c));
    for (const m of state.mappedCols) {
      const v = m.fn(c);
      if (v) for (const col of m.cols) put(row, col, v);
    }
  }
  if (cells.size) await writeValues(spreadsheetId, cellsToRanges(state.title, cells));
  return { matched, unmatched };
}

/**
 * Push CRM state for the contacts of a linked sheet into the sheet.
 * @param {object} entry LinkedSheet document (lean or hydrated)
 * @param {{ contactIds?: string[] }} opts only these contacts (default: every contact of the sheet)
 */
export async function pushSheet(entry, { contactIds = null } = {}) {
  if (!isGoogleConfigured()) {
    const info = googleAuthInfo();
    throw new HttpError(400, info.error || 'Two-way sync needs a Google service account: set GOOGLE_SERVICE_ACCOUNT_FILE in server/.env (see README)');
  }
  const spreadsheetId = entry.spreadsheetId;
  const batches = await ImportBatch.find({ 'source.spreadsheetId': spreadsheetId, undoneAt: null, status: 'done', plans: { $ne: null } })
    .sort({ createdAt: -1 })
    .select('_id plans')
    .lean();
  if (!batches.length) throw new HttpError(400, 'This sheet has not been imported yet, so there is nothing to write back');
  const plans = (batches[0].plans || []).filter((p) => p.include);
  const batchIds = batches.map((b) => b._id);
  const filter = { $or: [{ 'source.batchId': { $in: batchIds } }, { importBatchIds: { $in: batchIds } }] };
  if (contactIds) filter._id = { $in: contactIds };
  const contacts = await Contact.find(filter).select(CONTACT_FIELDS).limit(20000).lean();
  const updateMapped = Boolean(entry.writeBack?.updateMappedColumns);

  const result = { spreadsheetId, contacts: contacts.length, matched: 0, unmatched: 0, tabs: [] };
  try {
    const tabs = await sheetMeta(spreadsheetId);
    const states = [];
    for (const plan of plans) {
      const tab = tabs.find((t) => t.title === plan.name);
      if (!tab) {
        result.tabs.push({ name: plan.name, matched: 0, error: 'Tab not found in the spreadsheet' });
        continue;
      }
      states.push({ plan, state: await loadTabState({ spreadsheetId, tab, plan, updateMapped }), summary: { name: plan.name, matched: 0, addedColumns: [] } });
    }
    if (!states.length) throw new Error('None of the imported tabs exist in the spreadsheet any more');
    // Pass 1: each contact against the tab it was imported from. Pass 2: the rest against every tab.
    let leftover = [];
    for (const s of states) {
      s.summary.addedColumns = s.state.addedColumns;
      const mine = states.length === 1 ? contacts : contacts.filter((c) => c.source?.tabName === s.plan.name);
      const r = await writeContacts(spreadsheetId, s.state, mine);
      s.summary.matched += r.matched;
      leftover.push(...r.unmatched);
    }
    if (states.length > 1) {
      const known = new Set(states.map((s) => s.plan.name));
      leftover.push(...contacts.filter((c) => !known.has(c.source?.tabName)));
      for (const s of states) {
        if (!leftover.length) break;
        const r = await writeContacts(spreadsheetId, s.state, leftover);
        s.summary.matched += r.matched;
        leftover = r.unmatched;
      }
    }
    for (const s of states) result.tabs.push(s.summary);
    result.matched = result.tabs.reduce((n, t) => n + (t.matched || 0), 0);
    result.unmatched = contacts.length - result.matched;
    await LinkedSheet.updateOne(
      { spreadsheetId },
      {
        $set: {
          'writeBack.lastPushAt': new Date(),
          'writeBack.lastPushResult': 'ok',
          'writeBack.lastPushError': '',
          'writeBack.lastPushCount': result.matched,
          'writeBack.lastPushUnmatched': result.unmatched,
        },
      },
    );
    return result;
  } catch (err) {
    await LinkedSheet.updateOne({ spreadsheetId }, { $set: { 'writeBack.lastPushAt': new Date(), 'writeBack.lastPushResult': 'error', 'writeBack.lastPushError': err.message } }).catch(() => {});
    if (err instanceof HttpError) throw err;
    throw new HttpError(err.status === 403 ? 403 : 502, err.message);
  }
}

// ---------- automatic push of changed contacts ----------
const pending = new Set();
let timer = null;
let flushing = false;
const batchToSheet = new Map(); // batchId -> spreadsheetId ('' when not a Google Sheet)

async function spreadsheetIdOf(batchId) {
  const key = String(batchId);
  if (!batchToSheet.has(key)) {
    const b = await ImportBatch.findById(batchId).select('source.spreadsheetId').lean();
    batchToSheet.set(key, b?.source?.spreadsheetId || '');
  }
  return batchToSheet.get(key);
}

export async function flushWriteback({ log = console.log } = {}) {
  if (flushing || !pending.size) return null;
  flushing = true;
  const ids = [...pending];
  pending.clear();
  try {
    const enabled = await LinkedSheet.find({ 'writeBack.enabled': true }).lean();
    if (!enabled.length) return null;
    const byEntry = new Map(enabled.map((e) => [e.spreadsheetId, e]));
    const contacts = await Contact.find({ _id: { $in: ids } }).select('source.batchId importBatchIds').lean();
    const groups = new Map(); // spreadsheetId -> contact ids
    for (const c of contacts) {
      const batchIds = [c.source?.batchId, ...(c.importBatchIds || [])].filter(Boolean);
      const sheets = new Set();
      for (const b of batchIds) {
        const sid = await spreadsheetIdOf(b);
        if (sid && byEntry.has(sid)) sheets.add(sid);
      }
      for (const sid of sheets) {
        if (!groups.has(sid)) groups.set(sid, []);
        groups.get(sid).push(c._id);
      }
    }
    const summary = [];
    for (const [sid, contactIds] of groups) {
      try {
        const r = await pushSheet(byEntry.get(sid), { contactIds });
        summary.push({ spreadsheetId: sid, ...r });
        log(`[writeback] ${byEntry.get(sid).name || sid}: ${r.matched} row(s) updated${r.unmatched ? `, ${r.unmatched} not found in the sheet` : ''}`);
      } catch (err) {
        summary.push({ spreadsheetId: sid, error: err.message });
        log(`[writeback] ${byEntry.get(sid).name || sid}: ${err.message}`);
      }
    }
    return summary;
  } finally {
    flushing = false;
    if (pending.size) schedule();
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushWriteback().catch((err) => console.error('[writeback] flush failed:', err.message));
  }, DEBOUNCE_MS);
  timer.unref?.();
}

export function queueWriteback(contactId) {
  pending.add(String(contactId));
  schedule();
}

/** Subscribe to contact saves. Cheap when nothing is enabled: the flush checks the sheet list first. */
export function startWriteback() {
  events.on('contact:saved', (doc) => {
    if (!isGoogleConfigured()) return;
    if (!doc?.source?.batchId && !(doc?.importBatchIds || []).length) return;
    queueWriteback(doc._id);
  });
  const info = googleAuthInfo();
  if (info.configured) console.log(`[writeback] two-way sheet sync ready as ${info.email} (changes are pushed ${DEBOUNCE_MS / 1000}s after they happen)`);
  else console.log(`[writeback] two-way sheet sync is off${info.error ? `: ${info.error}` : ' (set GOOGLE_SERVICE_ACCOUNT_FILE to enable)'}`);
}

export const writebackInfo = () => ({ ...googleAuthInfo(), debounceSeconds: DEBOUNCE_MS / 1000, columns: CRM_COLUMNS.map((c) => c.header), appUrl: APP_URL });
