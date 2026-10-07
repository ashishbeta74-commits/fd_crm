// Sheet workspaces - /api/workspaces/:key (see workspaces.js for the per-sheet configs)
// list with search / filters, meta (filter values, tiles, linked sheet), export, add / edit / delete rows, sync.
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { HttpError } from '../lib/errors.js';
import { requireAdmin } from '../lib/auth.js';
import { isoDate, parseDate } from '../lib/dates.js';
import { escapeRegex } from '../lib/pool.js';
import { SheetRow } from '../models/SheetRow.js';
import { WORKSPACES, getWorkspace, publicWorkspace } from '../workspaces.js';
import { autoSyncInfo } from '../services/sync.js';
import { cleanCell, getSettings, mapHeaders, nextAutoId, nextRowKey, setSheet, syncWorkspace, typedValue } from '../services/workspaces.js';
import { appendSheetRow, readTabHeaders } from '../services/sheetAppend.js';

export const workspacesRouter = Router();

const PAGE_SIZES = [25, 50, 100, 200];
const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const who = (req) => req.user?.displayName || req.user?.username || '';

// The configs, for the sidebar / pages.
workspacesRouter.get('/', (req, res) => {
  res.json({ items: WORKSPACES.map(publicWorkspace) });
});

workspacesRouter.param('key', (req, res, next, key) => {
  req.ws = getWorkspace(key);
  if (!req.ws) return next(new HttpError(404, `No such workspace: ${key}`));
  return next();
});

const baseQuery = z.object({
  q: z.string().trim().max(200).default(''),
  from: z.string().max(20).default(''),
  to: z.string().max(20).default(''),
  missing: z.enum(['', 'yes']).default(''),
  tab: z.string().max(500).default(''),
  sort: z.string().max(60).default(''),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().default(50),
});

/** Query string -> Mongo filter: search over the search fields, one `f.<key>=a,b` multi-value filter per filter field, date range on the date field. */
function buildFilter(ws, p, raw) {
  const and = [{ workspace: ws.key }];
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i');
    const fields = ws.fields.filter((f) => f.search || f.filter).map((f) => `values.${f.key}`);
    and.push({ $or: fields.map((f) => ({ [f]: rx })) });
  }
  for (const f of ws.fields.filter((x) => x.filter)) {
    const vals = csv(raw[`f.${f.key}`]);
    if (vals.length) and.push({ [`values.${f.key}`]: { $in: vals.map((v) => (v === 'none' ? '' : v)).flatMap((v) => (v === '' ? ['', null] : [v])) } });
  }
  const tabs = csv(p.tab);
  if (tabs.length) and.push({ tab: { $in: tabs.map((t) => (t === 'none' ? '' : t)) } });
  if (ws.dateField) {
    const from = parseDate(p.from);
    const to = parseDate(p.to);
    if (from || to) and.push({ [`values.${ws.dateField}`]: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  }
  if (p.missing === 'yes') and.push({ missingSince: { $ne: null } });
  return { $and: and };
}

function sortSpec(ws, p) {
  const sortable = new Set(ws.fields.filter((f) => f.sort).map((f) => f.key).concat(['updatedAt', 'tab']));
  const key = sortable.has(p.sort) ? p.sort : ws.defaultSort?.field || 'updatedAt';
  const defaultDir = key === ws.defaultSort?.field ? ws.defaultSort.dir : ws.fields.find((f) => f.key === key)?.type === 'date' ? 'desc' : 'asc';
  const dir = (p.dir || defaultDir) === 'asc' ? 1 : -1;
  const path = key === 'updatedAt' || key === 'tab' ? key : `values.${key}`;
  return { [path]: dir, _id: -1 };
}

const PUBLIC = '-sheet';

// ---------- list ----------
workspacesRouter.get('/:key', async (req, res) => {
  const ws = req.ws;
  const p = baseQuery.parse(req.query);
  const limit = PAGE_SIZES.includes(p.limit) ? p.limit : 50;
  const filter = buildFilter(ws, p, req.query);
  const [total, items] = await Promise.all([
    SheetRow.countDocuments(filter),
    SheetRow.find(filter)
      .sort(sortSpec(ws, p))
      .skip((p.page - 1) * limit)
      .limit(limit)
      .select(PUBLIC)
      .lean(),
  ]);
  res.json({ items, total, page: p.page, pages: Math.max(1, Math.ceil(total / limit)), limit });
});

// Filter values in use (with counts), the status tiles, the linked sheet and its last sync.
workspacesRouter.get('/:key/meta', async (req, res) => {
  const ws = req.ws;
  const filterFields = ws.fields.filter((f) => f.filter);
  const facets = { tabs: [{ $group: { _id: '$tab', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }] };
  for (const f of filterFields) facets[`f_${f.key}`] = [{ $group: { _id: { $ifNull: [`$values.${f.key}`, ''] }, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }];
  if (ws.statusField) facets.status = [{ $group: { _id: { $ifNull: [`$values.${ws.statusField}`, ''] }, count: { $sum: 1 } } }];
  facets.counts = [
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        addedHere: { $sum: { $cond: [{ $eq: ['$source', 'crm'] }, 1, 0] } },
        missing: { $sum: { $cond: [{ $ne: ['$missingSince', null] }, 1, 0] } },
        ...(ws.valueField ? { value: { $sum: { $cond: [{ $isNumber: `$values.${ws.valueField}` }, `$values.${ws.valueField}`, 0] } } } : {}),
      },
    },
  ];
  const [settings, facet] = await Promise.all([getSettings(ws), SheetRow.aggregate([{ $match: { workspace: ws.key } }, { $facet: facets }]).then((r) => r[0] || {})]);
  const counts = facet.counts?.[0] || { total: 0, addedHere: 0, missing: 0, value: 0 };
  delete counts._id;
  const filters = {};
  for (const f of filterFields) filters[f.key] = (facet[`f_${f.key}`] || []).map((x) => ({ value: String(x._id ?? ''), count: x.count }));
  res.json({
    workspace: publicWorkspace(ws),
    tabs: (facet.tabs || []).map((t) => ({ tab: t._id || '', count: t.count })),
    filters,
    status: (facet.status || []).map((s) => ({ value: String(s._id ?? ''), count: s.count })),
    counts,
    sheet: settings,
    autoSync: autoSyncInfo(),
  });
});

// ---------- export ----------
workspacesRouter.get('/:key/export', async (req, res) => {
  const ws = req.ws;
  const p = baseQuery.parse(req.query);
  const items = await SheetRow.find(buildFilter(ws, p, req.query)).sort(sortSpec(ws, p)).limit(20000).select(PUBLIC).lean();
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(ws.label.slice(0, 31));
  sheet.columns = [...ws.fields.map((f) => ({ header: f.label, key: f.key, width: f.type === 'long' ? 40 : f.type === 'date' ? 12 : 20 })), { header: 'Tab', key: '__tab', width: 14 }];
  sheet.getRow(1).font = { bold: true };
  for (const it of items) {
    const row = { __tab: it.tab };
    for (const f of ws.fields) {
      const v = it.values?.[f.key];
      row[f.key] = v instanceof Date ? isoDate(v) : v ?? '';
    }
    sheet.addRow(row);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${ws.key}-${isoDate(new Date())}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ---------- rows ----------
/** Body { fieldKey: text } -> validated typed values (unknown keys are rejected). */
function parseBody(ws, body) {
  const shape = Object.fromEntries(ws.fields.map((f) => [f.key, z.union([z.string(), z.number(), z.null()]).optional()]));
  const parsed = z.object(shape).strict().parse(body);
  const values = {};
  for (const f of ws.fields) {
    if (parsed[f.key] === undefined) continue;
    const text = parsed[f.key] == null ? '' : cleanCell(f, parsed[f.key]);
    if (f.type === 'long' ? text.length > 5000 : text.length > 500) throw new HttpError(400, `${f.label} is too long`);
    values[f.key] = typedValue(f, text);
  }
  return values;
}

// Create a row. With `tab` (a tab of the linked sheet) the row is also appended to that tab when the
// Google service account is configured; otherwise it stays in the CRM under that tab and `sheetWrite`
// says why. A workspace with `autoId` fills an empty id. Response: the row + `sheetWrite: { ok, tab, rowNumber | error }`.
workspacesRouter.post('/:key', async (req, res) => {
  const ws = req.ws;
  // not trimmed: exported tab names can end in a space ("DAILY ENQUIRY SHEET - OWNER (H ") and must match the sync's
  const { tab, ...rest } = z.object({ tab: z.string().max(100).optional() }).passthrough().parse(req.body);
  const values = parseBody(ws, rest);
  if (ws.keyField && !values[ws.keyField]) {
    const id = await nextAutoId(ws);
    if (id) values[ws.keyField] = id;
  }
  const identifying = [ws.keyField, ...ws.fields.filter((f) => f.search).map((f) => f.key)].filter(Boolean);
  if (!identifying.some((k) => values[k])) throw new HttpError(400, `Give the ${ws.rowLabel} a ${ws.fields.find((f) => f.key === identifying[0])?.label || 'name'} first`);
  const settings = await getSettings(ws);
  const full = Object.fromEntries(ws.fields.map((f) => [f.key, values[f.key] ?? typedValue(f, '')]));
  const doc = new SheetRow({ workspace: ws.key, source: 'crm', spreadsheetId: settings.spreadsheetId, tab: tab || '', rowNumber: 0, values: full, editedAt: new Date(), updatedBy: who(req) });
  doc.key = `crm:${doc._id}`;
  let sheetWrite = null;
  if (tab) {
    // The sheet's text per field, as the sync reads it back (dates as YYYY-MM-DD), so the next sync sees no change.
    const text = Object.fromEntries(ws.fields.map((f) => [f.key, full[f.key] instanceof Date ? isoDate(full[f.key]) : full[f.key] == null ? '' : String(full[f.key])]));
    try {
      const { headers } = await readTabHeaders(settings.spreadsheetId, tab);
      const mapping = mapHeaders(ws, headers);
      if (!mapping) throw new HttpError(400, `Tab "${tab}" does not have this page's columns`);
      const cells = {};
      for (const [header, key] of Object.entries(mapping)) cells[header] = text[key];
      const { rowNumber } = await appendSheetRow(settings.spreadsheetId, tab, cells);
      doc.source = 'sheet';
      doc.rowNumber = rowNumber;
      doc.key = await nextRowKey(ws, tab, rowNumber, text);
      doc.sheet = text;
      doc.syncedAt = new Date();
      sheetWrite = { ok: true, tab, rowNumber };
    } catch (err) {
      sheetWrite = { ok: false, tab, error: err.message };
    }
  }
  await doc.save();
  res.status(201).json({ ...doc.toObject(), sheetWrite });
});

workspacesRouter.patch('/:key/:id', async (req, res) => {
  const ws = req.ws;
  const values = parseBody(ws, req.body);
  const set = { editedAt: new Date(), updatedBy: who(req) };
  for (const [k, v] of Object.entries(values)) set[`values.${k}`] = v;
  const doc = await SheetRow.findOneAndUpdate({ _id: req.params.id, workspace: ws.key }, { $set: set }, { new: true }).select(PUBLIC).lean();
  if (!doc) throw new HttpError(404, 'Row not found');
  res.json(doc);
});

workspacesRouter.delete('/:key/:id', async (req, res) => {
  const r = await SheetRow.findOneAndDelete({ _id: req.params.id, workspace: req.ws.key });
  if (!r) throw new HttpError(404, 'Row not found');
  res.json({ ok: true });
});

// ---------- sheet ----------
workspacesRouter.post('/:key/sync', async (req, res) => {
  const result = await syncWorkspace(req.ws, { force: true });
  res.json({ ...result, sheet: await getSettings(req.ws) });
});

workspacesRouter.put('/:key/sheet', requireAdmin, async (req, res) => {
  const body = z.object({ url: z.string().trim().min(1), tabs: z.array(z.string().trim().min(1)).max(50).optional() }).parse(req.body);
  res.json(await setSheet(req.ws, body));
});
