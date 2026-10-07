// Email Evaluation CRM - /api/email-evaluation
// The rows of the team's "EMAIL EVALUATION" sheet (synced by services/emailEvaluation.js), with
// search / filters, inline edits, rows added here, and "Sync now".
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { HttpError } from '../lib/errors.js';
import { requireAdmin } from '../lib/auth.js';
import { isoDate, parseDate } from '../lib/dates.js';
import { escapeRegex } from '../lib/pool.js';
import { EVAL_FIELDS, EmailEvaluation } from '../models/EmailEvaluation.js';
import { autoSyncInfo } from '../services/sync.js';
import { cleanEmail, cleanPhone, cleanText, getSettings, mapHeaders, nextRowKey, setSheet, syncEmailEvaluations } from '../services/emailEvaluation.js';
import { appendSheetRow, readTabHeaders } from '../services/sheetAppend.js';

export const emailEvaluationRouter = Router();

const SORTS = { date: -1, clientName: 1, company: 1, evaluatedFor: -1, status: 1, primaryEmail: 1, followUpDate: 1, updatedAt: -1, tab: 1 };
const PAGE_SIZES = [25, 50, 100, 200];
const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const who = (req) => req.user?.displayName || req.user?.username || '';

const listQuery = z.object({
  q: z.string().trim().max(200).default(''),
  tab: z.string().max(500).default(''),
  evaluatedFor: z.string().max(200).default(''),
  // 'yes' = a follow-up was written down, 'no' = none yet
  followUp: z.enum(['', 'yes', 'no']).default(''),
  from: z.string().max(20).default(''),
  to: z.string().max(20).default(''),
  // rows that were edited here but are no longer in the sheet
  missing: z.enum(['', 'yes']).default(''),
  sort: z.string().default('date'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().default(25),
});

/** The Mongo filter for the list / export query string. */
function buildFilter(p) {
  const and = [];
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i');
    and.push({ $or: ['clientName', 'company', 'primaryEmail', 'secondaryEmail', 'phone', 'notes', 'status', 'followUp', 'followUpDate', 'evaluatedFor', 'dateLabel'].map((f) => ({ [f]: rx })) });
  }
  const tabs = csv(p.tab);
  if (tabs.length) and.push({ tab: { $in: tabs.map((t) => (t === 'none' ? '' : t)) } });
  const years = csv(p.evaluatedFor);
  if (years.length) and.push({ evaluatedFor: { $in: years.map((y) => (y === 'none' ? '' : y)) } });
  if (p.followUp === 'yes') and.push({ $or: [{ followUp: { $nin: ['', null] } }, { followUpDate: { $nin: ['', null] } }] });
  if (p.followUp === 'no') and.push({ followUp: { $in: ['', null] }, followUpDate: { $in: ['', null] } });
  const from = parseDate(p.from);
  const to = parseDate(p.to);
  if (from || to) and.push({ date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  if (p.missing === 'yes') and.push({ missingSince: { $ne: null } });
  return and.length ? { $and: and } : {};
}

function sortSpec(p) {
  const key = SORTS[p.sort] ? p.sort : 'date';
  const dir = p.dir ? (p.dir === 'asc' ? 1 : -1) : SORTS[key];
  return { [key]: dir, _id: -1 };
}

// ---------- list ----------
emailEvaluationRouter.get('/', async (req, res) => {
  const p = listQuery.parse(req.query);
  const limit = PAGE_SIZES.includes(p.limit) ? p.limit : 25;
  const filter = buildFilter(p);
  const [total, items] = await Promise.all([
    EmailEvaluation.countDocuments(filter),
    EmailEvaluation.find(filter)
      .sort(sortSpec(p))
      .skip((p.page - 1) * limit)
      .limit(limit)
      .select('-sheet')
      .lean(),
  ]);
  res.json({ items, total, page: p.page, pages: Math.max(1, Math.ceil(total / limit)), limit });
});

// Filter lists + headline counts + the linked sheet and its last sync.
emailEvaluationRouter.get('/meta', async (req, res) => {
  const [settings, facet] = await Promise.all([
    getSettings(),
    EmailEvaluation.aggregate([
      {
        $facet: {
          tabs: [{ $group: { _id: '$tab', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
          years: [{ $group: { _id: '$evaluatedFor', count: { $sum: 1 } } }, { $sort: { _id: -1 } }],
          counts: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                withEmail: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$primaryEmail', ''] } }, 0] }, 1, 0] } },
                withPhone: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$phone', ''] } }, 0] }, 1, 0] } },
                withStatus: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$status', ''] } }, 0] }, 1, 0] } },
                followedUp: { $sum: { $cond: [{ $or: [{ $gt: [{ $strLenCP: { $ifNull: ['$followUp', ''] } }, 0] }, { $gt: [{ $strLenCP: { $ifNull: ['$followUpDate', ''] } }, 0] }] }, 1, 0] } },
                addedHere: { $sum: { $cond: [{ $eq: ['$source', 'crm'] }, 1, 0] } },
                missing: { $sum: { $cond: [{ $ne: ['$missingSince', null] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ]).then((r) => r[0]),
  ]);
  const counts = facet?.counts?.[0] || { total: 0, withEmail: 0, withPhone: 0, withStatus: 0, followedUp: 0, addedHere: 0, missing: 0 };
  delete counts._id;
  res.json({
    tabs: (facet?.tabs || []).map((t) => ({ tab: t._id || '', count: t.count })),
    years: (facet?.years || []).map((y) => ({ year: y._id || '', count: y.count })),
    counts,
    sheet: settings,
    autoSync: autoSyncInfo(),
  });
});

// ---------- export ----------
emailEvaluationRouter.get('/export', async (req, res) => {
  const p = listQuery.parse(req.query);
  const items = await EmailEvaluation.find(buildFilter(p)).sort(sortSpec(p)).limit(20000).select('-sheet').lean();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Email evaluation');
  ws.columns = [
    { header: 'DATE', key: 'date', width: 12 },
    { header: 'DATA EVALUATED FOR', key: 'evaluatedFor', width: 12 },
    { header: 'CLIENT NAME', key: 'clientName', width: 26 },
    { header: 'COMPANY NAME', key: 'company', width: 26 },
    { header: 'STATUS', key: 'status', width: 24 },
    { header: 'PRIMARY EMAIL', key: 'primaryEmail', width: 30 },
    { header: 'SECONDARY EMAIL', key: 'secondaryEmail', width: 24 },
    { header: 'Phone no', key: 'phone', width: 18 },
    { header: 'NOTES', key: 'notes', width: 40 },
    { header: 'FOLLOW UP', key: 'followUp', width: 16 },
    { header: 'DATE OF FOLLOW UP', key: 'followUpDate', width: 20 },
    { header: 'Tab', key: 'tab', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const it of items) ws.addRow({ ...it, date: it.date ? isoDate(it.date) : it.dateLabel });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="email-evaluation-${isoDate(new Date())}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ---------- rows ----------
const text = (max) => z.string().trim().max(max);
const rowInput = z
  .object({
    // ISO date, '' / null to clear; anything else a person would type is parsed too ("9/1/2026")
    date: z.string().trim().max(40).nullable().optional(),
    evaluatedFor: text(40).optional(),
    clientName: text(200).optional(),
    company: text(200).optional(),
    status: text(300).optional(),
    primaryEmail: text(300).optional(),
    secondaryEmail: text(300).optional(),
    phone: text(80).optional(),
    notes: text(5000).optional(),
    followUp: text(300).optional(),
    followUpDate: text(120).optional(),
  })
  .strict();

/** Validated body -> the fields to store (emails / phones cleaned the way the sync cleans them). */
function toFields(body) {
  const set = {};
  for (const f of EVAL_FIELDS) {
    if (body[f] === undefined) continue;
    if (f === 'date') {
      const raw = body.date == null ? '' : body.date;
      const d = parseDate(raw);
      if (raw && !d) throw new HttpError(400, 'Date not recognised (use YYYY-MM-DD)');
      set.date = d;
      set.dateLabel = d ? isoDate(d) : '';
    } else if (f === 'primaryEmail' || f === 'secondaryEmail') set[f] = cleanEmail(body[f]);
    else if (f === 'phone') set[f] = cleanPhone(body[f]);
    else set[f] = cleanText(body[f]);
  }
  return set;
}

// Create a row. With `tab` (a tab of the linked sheet) the row is also appended to that tab when the
// Google service account is configured; otherwise it stays in the CRM under that tab and `sheetWrite`
// says why. The response is the row plus `sheetWrite: { ok, tab, rowNumber | error }`.
emailEvaluationRouter.post('/', async (req, res) => {
  const { tab, ...rest } = z.object({ tab: z.string().max(100).optional() }).passthrough().parse(req.body);
  const body = rowInput.parse(rest);
  const fields = toFields(body);
  if (!fields.clientName && !fields.primaryEmail && !fields.company) throw new HttpError(400, 'Give the row a client name, company or email');
  const settings = await getSettings();
  const doc = new EmailEvaluation({ source: 'crm', spreadsheetId: settings.spreadsheetId, tab: '', rowNumber: 0, ...fields, editedAt: new Date(), updatedBy: who(req) });
  doc.key = `crm:${doc._id}`;
  const sheetWrite = tab ? await fileIntoTab(doc, tab, settings) : null;
  await doc.save();
  res.status(201).json({ ...doc.toObject(), sheetWrite });
});

/**
 * File a CRM-only row under a tab and append it to that tab in the sheet. On success the row becomes a
 * sheet row (keyed like the sync keys it, with the written cells as its sheet snapshot); otherwise it
 * stays a CRM row under the tab. Returns the `sheetWrite` outcome; the caller saves the document.
 */
async function fileIntoTab(doc, tab, settings) {
  doc.tab = tab;
  // The sheet's text for each field, as the sync would read it back (so the next sync sees no change).
  const text = Object.fromEntries(EVAL_FIELDS.map((f) => [f, f === 'date' ? doc.dateLabel || '' : doc[f] || '']));
  try {
    const { headers } = await readTabHeaders(settings.spreadsheetId, tab);
    const mapping = mapHeaders(headers);
    if (!mapping) throw new HttpError(400, `Tab "${tab}" has no CLIENT NAME / PRIMARY EMAIL column`);
    const cells = {};
    for (const [header, field] of Object.entries(mapping)) cells[header] = text[field];
    const { rowNumber } = await appendSheetRow(settings.spreadsheetId, tab, cells);
    doc.source = 'sheet';
    doc.spreadsheetId = settings.spreadsheetId;
    doc.rowNumber = rowNumber;
    doc.key = await nextRowKey(settings.spreadsheetId, tab, rowNumber, text);
    doc.sheet = text;
    doc.syncedAt = new Date();
    doc.missingSince = null;
    return { ok: true, tab, rowNumber };
  } catch (err) {
    return { ok: false, tab, error: err.message };
  }
}

// Edit fields. `tab` on a row that is not in the sheet yet (added here) moves it under that tab and
// appends it to the sheet, like adding it there; the response then carries `sheetWrite`.
emailEvaluationRouter.patch('/:id', async (req, res) => {
  const { tab, ...rest } = z.object({ tab: z.string().max(100).optional() }).passthrough().parse(req.body);
  const body = rowInput.parse(rest);
  const fields = toFields(body);
  const doc = await EmailEvaluation.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Row not found');
  Object.assign(doc, fields, { editedAt: new Date(), updatedBy: who(req) });
  let sheetWrite = null;
  if (tab && tab !== doc.tab && doc.source === 'sheet') throw new HttpError(400, 'This row is already in the sheet; move it there, the next sync follows');
  if (tab && doc.source !== 'sheet') sheetWrite = await fileIntoTab(doc, tab, await getSettings());
  await doc.save();
  const out = doc.toObject();
  delete out.sheet;
  res.json({ ...out, sheetWrite });
});

// Removes the row here only; a row still in the sheet comes back on the next sync.
emailEvaluationRouter.delete('/:id', async (req, res) => {
  const r = await EmailEvaluation.findByIdAndDelete(req.params.id);
  if (!r) throw new HttpError(404, 'Row not found');
  res.json({ ok: true });
});

// ---------- sheet ----------
// Re-read the sheet now (always runs, even when nothing changed).
emailEvaluationRouter.post('/sync', async (req, res) => {
  const result = await syncEmailEvaluations({ force: true });
  res.json({ ...result, sheet: await getSettings() });
});

// Link another sheet / limit to some tabs (admin): { url, tabs? }. Rows of the old sheet stay until the next sync.
emailEvaluationRouter.put('/sheet', requireAdmin, async (req, res) => {
  const body = z.object({ url: z.string().trim().min(1), tabs: z.array(z.string().trim().min(1)).max(50).optional() }).parse(req.body);
  res.json(await setSheet(body));
});
