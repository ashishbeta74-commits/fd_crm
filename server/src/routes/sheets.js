import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { parseDate, utcDate } from '../lib/dates.js';
import { LinkedSheet } from '../models/LinkedSheet.js';
import { parseSheetUrl, sheetUrl } from '../services/sheetLink.js';
import { listSources } from '../services/sync.js';
import { renameList } from '../services/lists.js';
import { pushSheet, writebackInfo } from '../services/writeback.js';

export const sheetsRouter = Router();

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "July 30,2026", "August 17,19,2026" (first day wins), "01/09/2026" (d/m/y), "2026-09-01" -> UTC date or null. */
export function parseSheetDate(label) {
  const s = String(label || '').trim();
  if (!s) return null;
  const m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*(?:,|&|and)\s*\d{1,2})*\s*,?\s*(\d{4})$/);
  if (m) {
    const month = MONTHS.findIndex((n) => n.startsWith(m[1].toLowerCase().slice(0, 3)));
    if (month >= 0) return utcDate(+m[3], month + 1, +m[2]);
  }
  return parseDate(s);
}

const sheetInput = z.object({
  url: z.string().trim().min(1),
  name: z.string().trim().max(120).default(''),
  date: z.string().trim().max(60).default(''),
  tabs: z.array(z.string().trim().min(1)).optional(),
  note: z.string().trim().max(500).optional(),
  // two-way sync settings (see services/writeback.js)
  writeBack: z.object({ enabled: z.boolean().optional(), updateMappedColumns: z.boolean().optional() }).optional(),
});

/** Insert or update (by spreadsheet id) one entry; empty fields never overwrite stored values. */
export async function upsertSheet(input) {
  const body = sheetInput.parse(input);
  const parsed = parseSheetUrl(body.url);
  if (!parsed) throw new HttpError(400, `Not a Google Sheets link: ${body.url}`);
  const set = { url: sheetUrl(parsed.spreadsheetId, parsed.gid) };
  if (parsed.gid) set.gid = parsed.gid;
  if (body.name) set.name = body.name;
  if (body.date) {
    set.dateLabel = body.date;
    set.date = parseSheetDate(body.date);
  }
  if (body.tabs) set.tabs = body.tabs;
  if (body.note !== undefined) set.note = body.note;
  if (body.writeBack?.enabled !== undefined) set['writeBack.enabled'] = body.writeBack.enabled;
  if (body.writeBack?.updateMappedColumns !== undefined) set['writeBack.updateMappedColumns'] = body.writeBack.updateMappedColumns;
  return LinkedSheet.findOneAndUpdate({ spreadsheetId: parsed.spreadsheetId }, { $set: set }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
}

// The saved sheet list merged with the import history (same rows as GET /imports/sources).
sheetsRouter.get('/', async (req, res) => {
  res.json({ items: await listSources() });
});

sheetsRouter.post('/', async (req, res) => {
  const item = await upsertSheet(req.body);
  res.status(201).json(item);
});

// Add or update many at once: { items: [{ url, name, date, tabs, note }] }
sheetsRouter.post('/bulk', async (req, res) => {
  const { items } = z.object({ items: z.array(z.any()).min(1).max(200) }).parse(req.body);
  const saved = [];
  for (const it of items) saved.push(await upsertSheet(it));
  res.json({ items: saved });
});

sheetsRouter.patch('/:id', async (req, res) => {
  const existing = await LinkedSheet.findById(req.params.id).lean();
  if (!existing) throw new HttpError(404, 'Sheet not found');
  const item = await upsertSheet({ ...req.body, url: req.body?.url || existing.url });
  res.json(item);
});

// Rename a list everywhere (contacts, import batches, saved sheet entry, saved views): { from, to, sheetId? }
sheetsRouter.post('/rename', async (req, res) => {
  const body = z.object({ from: z.string().trim().min(1).max(200), to: z.string().trim().min(1).max(120), sheetId: z.string().optional() }).parse(req.body);
  res.json(await renameList(body.from, body.to, { sheetId: body.sheetId || null }));
});

// Two-way sync status: whether a service account is configured and which columns the CRM writes.
sheetsRouter.get('/writeback', async (req, res) => {
  res.json(writebackInfo());
});

// Write the CRM state of every contact of this sheet into the sheet now ("Push to sheet").
sheetsRouter.post('/:id/push', async (req, res) => {
  const entry = await LinkedSheet.findById(req.params.id).lean();
  if (!entry) throw new HttpError(404, 'Sheet not found');
  const result = await pushSheet(entry);
  res.json(result);
});

// Removes the entry from the saved list only; imported contacts and import history stay.
sheetsRouter.delete('/:id', async (req, res) => {
  const r = await LinkedSheet.findByIdAndDelete(req.params.id);
  if (!r) throw new HttpError(404, 'Sheet not found');
  res.json({ ok: true });
});
