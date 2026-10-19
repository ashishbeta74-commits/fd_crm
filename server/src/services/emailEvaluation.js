// Email Evaluation CRM: rows synced from the team's "EMAIL EVALUATION" Google Sheet.
//
// Every tab of the workbook with a CLIENT NAME / PRIMARY EMAIL column is read (or only the tabs saved
// in the settings). Columns are matched by name, so the tabs may order them differently; the second
// STATUS column ("STATUS 2", "STATUS (2)") is ignored on purpose. Rows are identified by their email
// (or name) within a tab, so inserting / sorting rows in the sheet does not duplicate them here.
//
// Three-way merge: each row remembers the sheet values it last saw (`sheet`). On the next sync a cell
// that changed in the sheet overwrites the field; a field edited in the CRM is kept unless the sheet
// cell changed too. Rows that vanished from the sheet are dropped, unless they were edited here.
import { createHash } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { isoDate, parseDate, utcDate } from '../lib/dates.js';
import { EVAL_FIELDS, EmailEvaluation } from '../models/EmailEvaluation.js';
import { Setting } from '../models/User.js';
import { valueToText } from './excel.js';
import { loadSheetByLink, parseSheetUrl, sheetEditCheck, sheetUrl } from './sheetLink.js';

export const SETTING_KEY = 'emailEvaluation';
// The sheet the team keeps its email evaluations in (changed from the page by an admin).
const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1HQ5fUNwEUzdUW9MXuX6E2vOD2aaC-l24uZh8XvfsL6g/edit?gid=0#gid=0';

// Header -> field, on the header with everything but letters and digits removed ("Phone no" -> "phoneno").
// The first STATUS column is the status; "status2" (STATUS 2 / STATUS (2)) is deliberately absent.
const HEADER_FIELDS = {
  date: 'date',
  dataevaluatedfor: 'evaluatedFor',
  dateevaluatedfor: 'evaluatedFor',
  evaluatedfor: 'evaluatedFor',
  clientname: 'clientName',
  client: 'clientName',
  name: 'clientName',
  companyname: 'company',
  company: 'company',
  status: 'status',
  primaryemail: 'primaryEmail',
  email: 'primaryEmail',
  emailids: 'primaryEmail',
  emailid: 'primaryEmail',
  secondaryemail: 'secondaryEmail',
  secondemail: 'secondaryEmail',
  phoneno: 'phone',
  phone: 'phone',
  phonenumber: 'phone',
  contactno: 'phone',
  notes: 'notes',
  note: 'notes',
  remarks: 'notes',
  followup: 'followUp',
  dateoffollowup: 'followUpDate',
  followupdate: 'followUpDate',
};

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// A "—" / "-" cell means empty in these sheets.
const EMPTY_MARK = /^[-—–_.]+$/;

/** Cell -> stored text: trimmed, dashes-as-empty, numbers as digits, dates as YYYY-MM-DD. */
export function cleanText(v) {
  if (v instanceof Date) return isoDate(v);
  const s = valueToText(v).trim();
  return EMPTY_MARK.test(s) ? '' : s;
}
/** Emails are pasted with angle brackets / a leading "<" now and then. */
export const cleanEmail = (v) => cleanText(v).replace(/^[<\s]+|[>\s]+$/g, '').replace(/^mailto:/i, '');
/** Phones typed as "=+44 ..." (so the sheet keeps the plus) lose the "=". */
export const cleanPhone = (v) => cleanText(v).replace(/^[='"]+/, '').trim();

const CLEANERS = { primaryEmail: cleanEmail, secondaryEmail: cleanEmail, phone: cleanPhone };
export const cleanField = (field, v) => (CLEANERS[field] || cleanText)(v);

/** { header -> field } for one tab; null when the tab has neither a client name nor an email column. */
export function mapHeaders(headers) {
  const mapping = {};
  const used = new Set();
  for (const h of headers) {
    // "(2)" is the parser's suffix for a repeated header; "STATUS 2" is the sheet's own second status.
    const field = HEADER_FIELDS[norm(h.replace(/ \(\d+\)$/, ''))];
    if (!field || used.has(field)) continue;
    mapping[h] = field;
    used.add(field);
  }
  return used.has('clientName') || used.has('primaryEmail') ? mapping : null;
}

/** One sheet row -> the text of every field (missing columns are ''). */
export function rowValues(row, mapping) {
  const out = Object.fromEntries(EVAL_FIELDS.map((f) => [f, '']));
  for (const [header, field] of Object.entries(mapping)) {
    const v = row.values[header];
    if (v !== undefined && v !== null) out[field] = cleanField(field, v);
  }
  return out;
}

// A row with only a date / year and nothing about a client (a half-filled line at the bottom of a tab) is not a row.
const CONTENT_FIELDS = ['clientName', 'company', 'primaryEmail', 'secondaryEmail', 'phone', 'notes', 'status', 'followUp', 'followUpDate'];
const isBlank = (values) => CONTENT_FIELDS.every((f) => !values[f]);

// ---------- settings ----------

/** The linked sheet (url, spreadsheetId, gid, tabs) + the last sync outcome. */
export async function getSettings() {
  const doc = await Setting.findOne({ key: SETTING_KEY }).lean();
  const v = doc?.value || {};
  const parsed = parseSheetUrl(v.url || DEFAULT_URL) || parseSheetUrl(DEFAULT_URL);
  return {
    url: v.url || DEFAULT_URL,
    spreadsheetId: parsed.spreadsheetId,
    gid: parsed.gid,
    tabs: Array.isArray(v.tabs) ? v.tabs : [],
    lastSyncedAt: v.lastSyncedAt || null,
    lastResult: v.lastResult || '', // 'synced' | 'unchanged' | 'error'
    lastError: v.lastError || '',
    lastCounts: v.lastCounts || null,
    lastTabs: Array.isArray(v.lastTabs) ? v.lastTabs : [],
    contentHash: v.contentHash || '',
  };
}

async function patchSettings(patch) {
  const doc = await Setting.findOne({ key: SETTING_KEY }).lean();
  await Setting.updateOne({ key: SETTING_KEY }, { $set: { value: { ...(doc?.value || {}), ...patch } } }, { upsert: true });
}

/** Point the CRM at another sheet (and optionally only some tabs). The next sync reads from it. */
export async function setSheet({ url, tabs }) {
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new HttpError(400, `Not a Google Sheets link: ${url}`);
  await patchSettings({ url: sheetUrl(parsed.spreadsheetId, parsed.gid), tabs: Array.isArray(tabs) ? tabs : [], contentHash: '' });
  return getSettings();
}

// ---------- sync ----------

const emailKey = (s) => cleanEmail(s).toLowerCase().split(/[;,\s]+/)[0] || '';
const nameKey = (s) => cleanText(s).toLowerCase().replace(/\s+/g, ' ');

/** The identity of a sheet row (before the "#n" suffix for repeats): spreadsheet + tab + email, else name, else row number. */
export const rowKeyBase = (spreadsheetId, tab, rowNumber, values) => `${spreadsheetId}:${tab}:${emailKey(values.primaryEmail) || nameKey(values.clientName) || `row${rowNumber}`}`;

/** The key a row added in the CRM gets once it is in the sheet: the base, suffixed when that email / name is already in the tab. */
export async function nextRowKey(spreadsheetId, tab, rowNumber, values) {
  const base = rowKeyBase(spreadsheetId, tab, rowNumber, values);
  const n = await EmailEvaluation.countDocuments({ $or: [{ key: base }, { key: { $regex: `^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#\\d+$` } }] });
  return n === 0 ? base : `${base}#${n + 1}`;
}

/**
 * Read the workbook and bring the collection in step with it.
 * `force: false` skips the database work when the content is the same as at the last sync.
 */
export async function syncEmailEvaluations({ force = true, log = console.log } = {}) {
  const settings = await getSettings();
  const edit = force ? null : await sheetEditCheck('email-evaluation', settings.spreadsheetId);
  if (edit?.unchanged) {
    await patchSettings({ lastSyncedAt: new Date(), lastResult: 'unchanged', lastError: '' });
    return { unchanged: true };
  }
  let loaded;
  try {
    loaded = await loadSheetByLink(settings.spreadsheetId, settings.gid);
  } catch (err) {
    await patchSettings({ lastSyncedAt: new Date(), lastResult: 'error', lastError: err.message });
    throw err;
  }
  const wanted = settings.tabs.length ? loaded.sheets.filter((s) => settings.tabs.includes(s.name)) : loaded.sheets;
  const tabs = wanted.map((s) => ({ sheet: s, mapping: mapHeaders(s.headers) })).filter((t) => t.mapping);
  if (!tabs.length) {
    const err = new HttpError(400, 'No tab of the sheet has a CLIENT NAME or PRIMARY EMAIL column');
    await patchSettings({ lastSyncedAt: new Date(), lastResult: 'error', lastError: err.message });
    throw err;
  }

  // Rows as the CRM will store them, keyed so a re-sorted sheet maps onto the same documents.
  const rows = [];
  const seen = new Set();
  const hash = createHash('sha1');
  for (const { sheet, mapping } of tabs) {
    const counts = new Map();
    for (const row of sheet.rows) {
      const values = rowValues(row, mapping);
      if (isBlank(values)) continue;
      const base = rowKeyBase(settings.spreadsheetId, sheet.name, row.rowNumber, values);
      const n = (counts.get(base) || 0) + 1;
      counts.set(base, n);
      const key = n === 1 ? base : `${base}#${n}`;
      seen.add(key);
      rows.push({ key, tab: sheet.name, rowNumber: row.rowNumber, values });
      hash.update(`\n${key}\t${JSON.stringify(values)}`);
    }
  }
  const contentHash = hash.digest('hex');
  const tabNames = tabs.map((t) => t.sheet.name);
  const now = new Date();
  if (!force && contentHash === settings.contentHash) {
    await patchSettings({ lastSyncedAt: now, lastResult: 'unchanged', lastError: '' });
    edit?.done();
    return { unchanged: true, tabs: tabNames, total: rows.length };
  }

  const existing = await EmailEvaluation.find({ spreadsheetId: settings.spreadsheetId, source: 'sheet' }).lean();
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
            source: 'sheet',
            spreadsheetId: settings.spreadsheetId,
            tab: r.tab,
            rowNumber: r.rowNumber,
            key: r.key,
            ...fieldsFromValues(r.values),
            sheet: { ...r.values },
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
    // Sheet cells that changed since the last sync win; everything else keeps the CRM's value.
    const set = { tab: r.tab, rowNumber: r.rowNumber, syncedAt: now, missingSince: null };
    let changed = false;
    for (const f of EVAL_FIELDS) {
      const next = r.values[f];
      const prev = doc.sheet?.[f] ?? '';
      if (next === prev) continue;
      changed = true;
      set[`sheet.${f}`] = next;
      Object.assign(set, fieldsFromValues({ [f]: next }, f));
    }
    if (changed) counts.updated += 1;
    else counts.unchanged += 1;
    // Untouched rows are left alone (no write, so open tabs do not refetch for nothing) unless they moved in the sheet.
    if (changed || doc.tab !== r.tab || doc.rowNumber !== r.rowNumber || doc.missingSince) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
  }
  // Rows no longer in the sheet: drop them, unless someone edited them here.
  for (const doc of existing) {
    if (seen.has(doc.key) || !tabNames.includes(doc.tab)) continue;
    if (doc.editedAt) {
      counts.kept += 1;
      if (!doc.missingSince) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { missingSince: now } } } });
    } else {
      counts.removed += 1;
      ops.push({ deleteOne: { filter: { _id: doc._id } } });
    }
  }
  if (ops.length) await EmailEvaluation.bulkWrite(ops, { ordered: false });
  await refreshFollowUps({ spreadsheetId: settings.spreadsheetId });

  await patchSettings({ lastSyncedAt: now, lastResult: 'synced', lastError: '', lastCounts: counts, lastTabs: tabNames, contentHash });
  edit?.done();
  log(`[email-evaluation] synced ${tabNames.join(', ')}: ${counts.created} new, ${counts.updated} updated, ${counts.removed} removed, ${counts.kept} kept (edited here, gone from the sheet)`);
  return { unchanged: false, tabs: tabNames, total: rows.length, ...counts };
}

/** Field values for the document from the sheet text (the DATE column is also parsed into a real date). */
function fieldsFromValues(values, only = null) {
  const out = {};
  for (const f of only ? [only] : EVAL_FIELDS) {
    if (f === 'date') {
      out.dateLabel = values.date || '';
      out.date = parseDate(values.date) || null;
    } else {
      out[f] = values[f] ?? '';
    }
  }
  return out;
}

// ---------- follow-up sends ----------
// Sent 1 goes out on the row's DATE; each next send is due 10 working days (Mon-Fri) after the last, up to Sent 5.

export const MAX_SENDS = 5;
export const FOLLOW_UP_WORKDAYS = 10;
export const CHANNELS = ['email', 'text', 'whatsapp', 'call'];
/** Reservations tabs are not followed up. */
export const tracksFollowUps = (tab) => !/reservation/i.test(tab || '');
/** The sheet's tabs (HARRY, INFO, Advisors) are followed up by email only; rows added here by any channel. */
export const channelsFor = (tab) => (!tracksFollowUps(tab) ? [] : tab ? ['email'] : CHANNELS);

/** UTC-midnight date `n` Mon-Fri days after `date`. */
export function addWorkdays(date, n) {
  const d = new Date(date);
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n -= 1;
  }
  return d;
}

const BOOKED = /(?<!never\s*)booked/i;

/**
 * The team's DATE OF FOLLOW UP text -> { n, date } of the last send, or null.
 * "3rd RE Sent 28/09" (day/month, year of the row), "2nd Re sent 09/29/2026" / "2nd Follow up 10-02-2026"
 * (month/day with a year), "Sent 10-5-2026" (Sent 1), a bare date cell (Sent 1 on that day).
 */
export function parseSent(text, rowDate = null) {
  const s = String(text || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { n: 1, date: parseDate(s) };
  const ord = s.match(/(\d)\s*(?:st|nd|rd|th)/i);
  if (!ord && !/sent|follow/i.test(s)) return null;
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (!m) return null;
  const [a, b] = [+m[1], +m[2]];
  const year = m[3] ? (+m[3] % 100) + 2000 : new Date(rowDate || Date.now()).getUTCFullYear();
  // With a year the team writes month/day, without one day/month; a part over 12 settles it either way.
  const monthFirst = m[3] ? a <= 12 : b > 12;
  const date = monthFirst ? utcDate(year, a, b) : utcDate(year, b, a);
  return date ? { n: Math.min(ord ? +ord[1] : 1, MAX_SENDS), date } : null;
}

/** { sentCount, lastSentAt, nextFollowUpAt } for a row: the later of the last CRM send and the sheet's text, else Sent 1 on DATE. */
export function followUpState(doc) {
  const none = { sentCount: 0, lastSentAt: null, nextFollowUpAt: null };
  if (!tracksFollowUps(doc.tab)) return none;
  const crm = doc.sends?.length ? doc.sends[doc.sends.length - 1] : null;
  const sheet = parseSent(doc.followUpDate, doc.date);
  const last = (crm && (!sheet || crm.n >= sheet.n) ? crm : sheet) || (doc.date ? { n: 1, date: doc.date } : null);
  if (!last) return none;
  const done = last.n >= MAX_SENDS || BOOKED.test(`${doc.followUpDate} ${doc.status}`);
  return { sentCount: last.n, lastSentAt: last.date, nextFollowUpAt: done ? null : addWorkdays(last.date, FOLLOW_UP_WORKDAYS) };
}

/** Recompute the derived follow-up fields of the matching rows; writes only the rows that changed. */
export async function refreshFollowUps(filter = {}) {
  const docs = await EmailEvaluation.find(filter).select('tab date status followUpDate sends sentCount lastSentAt nextFollowUpAt').lean();
  const same = (a, b) => (a ? +new Date(a) : 0) === (b ? +new Date(b) : 0);
  const ops = [];
  for (const d of docs) {
    const s = followUpState(d);
    if (s.sentCount !== d.sentCount || !same(s.lastSentAt, d.lastSentAt) || !same(s.nextFollowUpAt, d.nextFollowUpAt)) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: s } } });
  }
  if (ops.length) await EmailEvaluation.bulkWrite(ops, { ordered: false });
  return ops.length;
}

// ---------- automatic sync ----------

const SYNC_MINUTES = Number(process.env.SHEET_SYNC_MINUTES) || 0;
let running = false;

async function tick(opts) {
  if (running) return;
  running = true;
  try {
    await syncEmailEvaluations(opts);
  } catch (err) {
    console.error('[email-evaluation] sync failed:', err.message);
  } finally {
    running = false;
  }
}

/**
 * First load shortly after start-up when the collection is still empty (so the page is not blank on
 * a fresh database), then the same cadence as the calling sheets (SHEET_SYNC_MINUTES, on change only).
 */
export function startEmailEvaluationSync() {
  const first = setTimeout(async () => {
    try {
      if ((await EmailEvaluation.estimatedDocumentCount()) === 0) await tick({ force: true });
      else await refreshFollowUps(); // rows synced before follow-ups were tracked
    } catch (err) {
      console.error('[email-evaluation] first sync failed:', err.message);
    }
  }, 20_000);
  first.unref?.();
  if (!SYNC_MINUTES) return;
  const timer = setInterval(() => tick({ force: false }), SYNC_MINUTES * 60 * 1000);
  timer.unref?.();
}
