// Sheet workspaces: sync a Google Sheet into SheetRow documents following a workspace config
// (workspaces.js). Same rules as the Email Evaluation CRM:
//  - the sheet's columns are matched to fields by header name, so the sheet may reorder them;
//  - a row is identified by the workspace's key column (else email / name within the tab, else row number);
//  - three-way merge: a cell that changed in the sheet since the last sync overwrites the field, a field
//    edited in the CRM is otherwise kept; rows gone from the sheet are dropped unless edited here.
import { createHash } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { isoDate, parseDate } from '../lib/dates.js';
import { SheetRow } from '../models/SheetRow.js';
import { Setting } from '../models/User.js';
import { WORKSPACES, getWorkspace } from '../workspaces.js';
import { valueToText } from './excel.js';
import { loadSheetByLink, parseSheetUrl, sheetUrl } from './sheetLink.js';

const settingKey = (ws) => `workspace:${ws.key}`;
// "DATE ( DOUBLE CLICK )" -> "date"; "CLIENT EMAIL ID / Phone No" -> "clientemailidphoneno"
export const normHeader = (h) =>
  String(h || '')
    .replace(/ \(\d+\)$/, '') // the parser's suffix for a repeated header
    .replace(/\([^)]*\)/g, '')
    .replace(/\?/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const EMPTY_MARK = /^[-—–_.]+$/;

/** Cell -> text: trimmed, dashes-as-empty, numbers as digits, dates as YYYY-MM-DD. */
export function cleanText(v) {
  if (v instanceof Date) return isoDate(v);
  const s = valueToText(v).trim();
  return EMPTY_MARK.test(s) ? '' : s;
}
export const cleanEmail = (v) => cleanText(v).replace(/^[<\s]+|[>\s]+$/g, '').replace(/^mailto:/i, '');
export const cleanPhone = (v) => cleanText(v).replace(/^[='"]+/, '').trim();
const cleanByType = { email: cleanEmail, phone: cleanPhone };
export const cleanCell = (field, v) => (cleanByType[field.type] || cleanText)(v);

/**
 * The stored value for a field from its text: Dates for date fields (the text is kept when it is not a
 * date, e.g. "Not specified"), numbers for number fields, text otherwise.
 */
export function typedValue(field, text) {
  if (!text) return field.type === 'number' || field.type === 'date' ? null : '';
  if (field.type === 'date') return parseDate(text) || text;
  if (field.type === 'number') {
    const n = Number(String(text).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && /\d/.test(text) ? n : text;
  }
  return text;
}

/** { header -> field } for one tab; null when the tab has none of the workspace's identifying columns. */
export function mapHeaders(ws, headers) {
  const mapping = {};
  const used = new Set();
  for (const h of headers) {
    const n = normHeader(h);
    const field = ws.fields.find((f) => !used.has(f.key) && f.headers.includes(n));
    if (!field) continue;
    mapping[h] = field.key;
    used.add(field.key);
  }
  const identifying = [ws.keyField, ...ws.fields.filter((f) => f.search).map((f) => f.key)].filter(Boolean);
  return identifying.some((k) => used.has(k)) ? mapping : null;
}

/** One sheet row -> { fieldKey: text } for every field (missing columns are ''). */
export function rowText(ws, row, mapping) {
  const out = Object.fromEntries(ws.fields.map((f) => [f.key, '']));
  for (const [header, key] of Object.entries(mapping)) {
    const v = row.values[header];
    if (v !== undefined && v !== null) out[key] = cleanCell(ws.fields.find((f) => f.key === key), v);
  }
  return out;
}

/** { fieldKey: typed value } from the text of every (or one) field. */
export function typedValues(ws, text, only = null) {
  const out = {};
  for (const f of ws.fields) if (!only || only === f.key) out[f.key] = typedValue(f, text[f.key] ?? '');
  return out;
}

// A row with no id and nothing but dates in it (a half-filled line at the bottom of a tab) is not a row.
const isBlank = (ws, text) => !(ws.keyField && text[ws.keyField]) && ws.fields.every((f) => f.type === 'date' || !text[f.key]);

// ---------- settings ----------

/** The linked sheet (url, spreadsheetId, gid, tabs) + the last sync outcome for one workspace. */
export async function getSettings(ws) {
  const doc = await Setting.findOne({ key: settingKey(ws) }).lean();
  const v = doc?.value || {};
  const url = v.url || ws.sheet.url;
  const parsed = parseSheetUrl(url) || parseSheetUrl(ws.sheet.url);
  return {
    url,
    spreadsheetId: parsed.spreadsheetId,
    gid: parsed.gid,
    tabs: Array.isArray(v.tabs) ? v.tabs : ws.sheet.tabs || [],
    lastSyncedAt: v.lastSyncedAt || null,
    lastResult: v.lastResult || '',
    lastError: v.lastError || '',
    lastCounts: v.lastCounts || null,
    lastTabs: Array.isArray(v.lastTabs) ? v.lastTabs : [],
    contentHash: v.contentHash || '',
  };
}

async function patchSettings(ws, patch) {
  const key = settingKey(ws);
  const doc = await Setting.findOne({ key }).lean();
  await Setting.updateOne({ key }, { $set: { value: { ...(doc?.value || {}), ...patch } } }, { upsert: true });
}

/** Point a workspace at another sheet / some tabs. The next sync reads from it. */
export async function setSheet(ws, { url, tabs }) {
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new HttpError(400, `Not a Google Sheets link: ${url}`);
  await patchSettings(ws, { url: sheetUrl(parsed.spreadsheetId, parsed.gid), tabs: Array.isArray(tabs) ? tabs : [], contentHash: '' });
  return getSettings(ws);
}

// ---------- sync ----------

const emailKey = (s) => cleanEmail(s).toLowerCase().split(/[;,\s]+/)[0] || '';
const nameKey = (s) => cleanText(s).toLowerCase().replace(/\s+/g, ' ');

/** The stable identity of a sheet row within the workspace. */
function rowKey(ws, tab, rowNumber, text) {
  const id = ws.keyField ? cleanText(text[ws.keyField]) : '';
  if (id) return id.toLowerCase();
  const emailField = ws.fields.find((f) => f.type === 'email' || /email|contact/i.test(f.key));
  const nameField = ws.fields.find((f) => /name/i.test(f.key));
  const e = emailField ? emailKey(text[emailField.key]) : '';
  const n = nameField ? nameKey(text[nameField.key]) : '';
  return `${tab}:${e || n || `row${rowNumber}`}`;
}

/**
 * Read the workspace's sheet and bring its rows in step with it.
 * `force: false` skips the database work when the content is the same as at the last sync.
 */
export async function syncWorkspace(ws, { force = true, log = console.log } = {}) {
  const settings = await getSettings(ws);
  let loaded;
  try {
    loaded = await loadSheetByLink(settings.spreadsheetId, settings.gid);
  } catch (err) {
    await patchSettings(ws, { lastSyncedAt: new Date(), lastResult: 'error', lastError: err.message });
    throw err;
  }
  // Named tabs win; else the tab the link points to; else every tab with the identifying columns.
  let wanted = settings.tabs.length ? loaded.sheets.filter((s) => settings.tabs.includes(s.name)) : [];
  if (!wanted.length && !settings.tabs.length && loaded.linkedSheet) wanted = loaded.sheets.filter((s) => s.name === loaded.linkedSheet);
  if (!wanted.length && !settings.tabs.length) wanted = loaded.sheets;
  const tabs = wanted.map((s) => ({ sheet: s, mapping: mapHeaders(ws, s.headers) })).filter((t) => t.mapping);
  if (!tabs.length) {
    const err = new HttpError(400, `No tab of the sheet has the columns this page expects (${ws.fields.slice(0, 3).map((f) => f.label).join(', ')}…)`);
    await patchSettings(ws, { lastSyncedAt: new Date(), lastResult: 'error', lastError: err.message });
    throw err;
  }

  const rows = [];
  const seen = new Set();
  const hash = createHash('sha1');
  for (const { sheet, mapping } of tabs) {
    const counts = new Map();
    for (const row of sheet.rows) {
      const text = rowText(ws, row, mapping);
      if (isBlank(ws, text)) continue;
      const base = rowKey(ws, sheet.name, row.rowNumber, text);
      const n = (counts.get(base) || 0) + 1;
      counts.set(base, n);
      const key = n === 1 ? base : `${base}#${n}`;
      seen.add(key);
      rows.push({ key, tab: sheet.name, rowNumber: row.rowNumber, text });
      hash.update(`\n${key}\t${JSON.stringify(text)}`);
    }
  }
  const contentHash = hash.digest('hex');
  const tabNames = tabs.map((t) => t.sheet.name);
  const now = new Date();
  if (!force && contentHash === settings.contentHash) {
    await patchSettings(ws, { lastSyncedAt: now, lastResult: 'unchanged', lastError: '' });
    return { unchanged: true, tabs: tabNames, total: rows.length };
  }

  const existing = await SheetRow.find({ workspace: ws.key, source: 'sheet' }).lean();
  const byKey = new Map(existing.map((d) => [d.key, d]));
  const ops = [];
  const counts = { created: 0, updated: 0, unchanged: 0, removed: 0, kept: 0 };

  for (const r of rows) {
    const doc = byKey.get(r.key);
    if (!doc) {
      counts.created += 1;
      ops.push({
        insertOne: {
          document: {
            workspace: ws.key,
            source: 'sheet',
            spreadsheetId: settings.spreadsheetId,
            tab: r.tab,
            rowNumber: r.rowNumber,
            key: r.key,
            values: typedValues(ws, r.text),
            sheet: { ...r.text },
            syncedAt: now,
            missingSince: null,
            editedAt: null,
            updatedBy: '',
            createdAt: now,
            updatedAt: now,
          },
        },
      });
      continue;
    }
    const set = { tab: r.tab, rowNumber: r.rowNumber, syncedAt: now, missingSince: null };
    let changed = false;
    for (const f of ws.fields) {
      const next = r.text[f.key];
      const prev = doc.sheet?.[f.key] ?? '';
      if (next === prev) continue;
      changed = true;
      set[`sheet.${f.key}`] = next;
      set[`values.${f.key}`] = typedValue(f, next);
    }
    if (changed) counts.updated += 1;
    else counts.unchanged += 1;
    if (changed || doc.tab !== r.tab || doc.rowNumber !== r.rowNumber || doc.missingSince || doc.spreadsheetId !== settings.spreadsheetId) {
      set.spreadsheetId = settings.spreadsheetId;
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    }
  }
  for (const doc of existing) {
    if (seen.has(doc.key)) continue;
    if (doc.editedAt) {
      counts.kept += 1;
      if (!doc.missingSince) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { missingSince: now } } } });
    } else {
      counts.removed += 1;
      ops.push({ deleteOne: { filter: { _id: doc._id } } });
    }
  }
  if (ops.length) await SheetRow.bulkWrite(ops, { ordered: false });

  await patchSettings(ws, { lastSyncedAt: now, lastResult: 'synced', lastError: '', lastCounts: counts, lastTabs: tabNames, contentHash });
  log(`[workspace:${ws.key}] synced ${tabNames.join(', ')}: ${counts.created} new, ${counts.updated} updated, ${counts.removed} removed, ${counts.kept} kept (edited here, gone from the sheet)`);
  return { unchanged: false, tabs: tabNames, total: rows.length, ...counts };
}

// ---------- automatic sync ----------

const SYNC_MINUTES = Number(process.env.SHEET_SYNC_MINUTES) || 0;
const running = new Set();

async function tick(ws, opts) {
  if (running.has(ws.key)) return;
  running.add(ws.key);
  try {
    await syncWorkspace(ws, opts);
  } catch (err) {
    console.error(`[workspace:${ws.key}] sync failed:`, err.message);
  } finally {
    running.delete(ws.key);
  }
}

/**
 * Every workspace: a first load shortly after start-up when it has no rows yet, then the same cadence
 * as the calling sheets (SHEET_SYNC_MINUTES, writes only when the content changed).
 */
export function startWorkspaceSync() {
  const first = setTimeout(async () => {
    for (const ws of WORKSPACES) {
      try {
        if ((await SheetRow.countDocuments({ workspace: ws.key })) === 0) await tick(ws, { force: true });
      } catch (err) {
        console.error(`[workspace:${ws.key}] first sync failed:`, err.message);
      }
    }
  }, 25_000);
  first.unref?.();
  if (!SYNC_MINUTES) return;
  const timer = setInterval(async () => {
    for (const ws of WORKSPACES) await tick(ws, { force: false });
  }, SYNC_MINUTES * 60 * 1000);
  timer.unref?.();
}

export { getWorkspace };
