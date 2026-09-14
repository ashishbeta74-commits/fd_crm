import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { CATEGORY_KEYS, FIELDS, FIELD_KEYS, STAGE_KEYS, isMultiField } from '../fields.js';
import { HttpError } from '../lib/errors.js';
import { suggestMapping } from '../lib/mapping.js';
import { rateLimit } from '../lib/rateLimit.js';
import { Contact } from '../models/Contact.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { Reminder } from '../models/Reminder.js';

// Parsing a workbook / fetching a Google Sheet is the heaviest thing the API does per request.
const previewLimit = rateLimit({ windowMs: 60_000, max: 20, name: 'import previews' });
import { parseWorkbook, valueToText } from '../services/excel.js';
import { runImport } from '../services/importer.js';
import { uploadStore } from '../services/uploadStore.js';
import { loadSheetByLink, parseSheetUrl, sheetUrl } from '../services/sheetLink.js';
import { autoSyncInfo, listSources, resyncBatch, syncChangedSheets } from '../services/sync.js';
import { writebackInfo } from '../services/writeback.js';

export const importsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.xls$/i.test(file.originalname)) {
      return cb(new HttpError(400, 'Legacy .xls files are not supported - open it in Excel and "Save As" .xlsx'));
    }
    if (!/\.(xlsx|xlsm|csv)$/i.test(file.originalname)) {
      return cb(new HttpError(400, 'Only .xlsx, .xlsm or .csv files are supported'));
    }
    return cb(null, true);
  },
});

const previewSheets = (sheets, linkedSheet = null) =>
  sheets.map((s) => ({
    name: s.name,
    headers: s.headers,
    rowCount: s.rowCount,
    headerRow: s.headerRow,
    include: linkedSheet ? s.name === linkedSheet : true,
    sample: s.rows.slice(0, 5).map((r) => Object.fromEntries(s.headers.map((h) => [h, valueToText(r.values[h])]))),
    suggestedMapping: suggestMapping(s.headers),
  }));

// Step 1a: upload a workbook, get sheets + headers + suggested mapping back.
// Optional multipart field `sourceUrl`: a Google Sheets link this file was exported from. The import is then
// recorded as a linked sheet (re-sync works once the sheet is shared "Anyone with the link").
importsRouter.post('/preview', previewLimit, upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded (multipart field name must be "file")');
  let sheets;
  try {
    sheets = await parseWorkbook(req.file.buffer, req.file.originalname);
  } catch (err) {
    throw new HttpError(400, `Could not read the file: ${err.message}`);
  }
  if (!sheets.length) throw new HttpError(400, 'No data found in the file (a header row needs at least two filled cells)');
  let source = { type: 'file' };
  const parsedUrl = req.body?.sourceUrl ? parseSheetUrl(String(req.body.sourceUrl)) : null;
  if (req.body?.sourceUrl && !parsedUrl) throw new HttpError(400, 'sourceUrl is not a Google Sheets link');
  if (parsedUrl) {
    const title = req.file.originalname.replace(/\.(xlsx|xlsm|csv)$/i, '');
    source = { type: 'google-sheet', url: sheetUrl(parsedUrl.spreadsheetId, parsedUrl.gid), spreadsheetId: parsedUrl.spreadsheetId, gid: parsedUrl.gid, title };
  }
  const uploadId = uploadStore.put({ fileName: req.file.originalname, sheets, source });
  res.json({ uploadId, fileName: req.file.originalname, source, sheets: previewSheets(sheets) });
});

// Step 1b: same, but from a Google Sheets link (the sheet must be shared "Anyone with the link").
const linkInput = z.object({ url: z.string().trim().min(1) });

importsRouter.post('/link/preview', previewLimit, async (req, res) => {
  const { url } = linkInput.parse(req.body);
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new HttpError(400, 'That does not look like a Google Sheets link (expected https://docs.google.com/spreadsheets/d/...)');
  const loaded = await loadSheetByLink(parsed.spreadsheetId, parsed.gid);
  const source = { type: 'google-sheet', url: sheetUrl(parsed.spreadsheetId, parsed.gid), spreadsheetId: parsed.spreadsheetId, gid: parsed.gid, title: loaded.title };
  const uploadId = uploadStore.put({ fileName: loaded.fileName, sheets: loaded.sheets, source });
  res.json({ uploadId, fileName: loaded.fileName, source, linkedSheet: loaded.linkedSheet, sheets: previewSheets(loaded.sheets, loaded.linkedSheet) });
});

const commitInput = z.object({
  uploadId: z.string().min(1),
  duplicateStrategy: z.enum(['skip', 'update']).default('skip'),
  updateStage: z.boolean().default(false),
  // Display name of the list in the CRM (defaults to the sheet title / file name; duplicates get " 2", " 3"...)
  listName: z.string().trim().max(120).optional(),
  // Skip rows that have no contact phone (Contact Phone 1)
  requirePhone: z.boolean().default(true),
  sheets: z
    .array(
      z.object({
        name: z.string(),
        include: z.boolean().default(true),
        mapping: z.record(z.string(), z.string()).default({}),
        defaultStage: z.enum(STAGE_KEYS).optional(),
        // Contact type for every row of this sheet ('' / omitted = detect from the list name and job title)
        category: z.enum(['', ...CATEGORY_KEYS]).optional(),
      }),
    )
    .min(1),
});

export function validatePlans(plans) {
  for (const plan of plans) {
    const seen = new Set();
    for (const [header, key] of Object.entries(plan.mapping)) {
      if (!key) continue;
      if (!FIELD_KEYS.includes(key)) throw new HttpError(400, `Unknown field "${key}" for column "${header}" in sheet "${plan.name}"`);
      if (seen.has(key) && !isMultiField(key)) throw new HttpError(400, `Field "${key}" is mapped to more than one column in sheet "${plan.name}"`);
      seen.add(key);
    }
  }
  const included = plans.filter((s) => s.include);
  if (!included.length) throw new HttpError(400, 'Select at least one sheet to import');
  if (included.some((s) => !Object.values(s.mapping).some(Boolean))) {
    throw new HttpError(400, 'Every included sheet needs at least one mapped column');
  }
}

// Step 2: run the import with the (possibly edited) mapping.
importsRouter.post('/commit', async (req, res) => {
  const body = commitInput.parse(req.body);
  const stored = uploadStore.get(body.uploadId);
  if (!stored) throw new HttpError(410, 'This upload has expired - please upload the file again');
  validatePlans(body.sheets);
  const batch = await runImport({
    upload: stored,
    plans: body.sheets,
    strategy: body.duplicateStrategy,
    updateStage: body.updateStage,
    requirePhone: body.requirePhone,
    listName: body.listName || '',
  });
  uploadStore.delete(body.uploadId);
  res.json(batch);
});

// Names already used by lists (for the "List name" input: duplicates get a number appended on commit).
importsRouter.get('/list-names', async (req, res) => {
  const names = (await Contact.distinct('source.sheetName')).filter(Boolean).sort();
  res.json({ items: names });
});

importsRouter.get('/', async (req, res) => {
  const items = await ImportBatch.find().sort({ createdAt: -1 }).limit(50).select('-plans').lean();
  res.json({ items });
});

// Linked Google Sheets (latest batch per spreadsheet) - what "Sync now" and auto-sync work from.
importsRouter.get('/sources', async (req, res) => {
  res.json({ items: await listSources(), autoSync: autoSyncInfo(), writeBack: writebackInfo() });
});

// Run one auto-sync cycle now: every linked sheet is checked and only changed ones are imported.
importsRouter.post('/sync-changed', async (req, res) => {
  const summary = await syncChangedSheets();
  res.json({ ...summary, items: await listSources() });
});

// A blank workbook with the expected column names, handy as a starting point.
importsRouter.get('/template', async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contacts');
  ws.columns = FIELDS.map((f) => ({ header: f.label, key: f.key, width: Math.max(14, f.label.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow({
    name: 'Jane Doe',
    email: 'jane@example.com',
    title: 'Operations Manager',
    companyName: 'Example Ltd',
    website: 'https://example.com',
    primaryEmail: 'jane@example.com',
    secondaryEmail: 'jane.doe@gmail.com',
    contactL1: 'https://www.linkedin.com/in/jane-doe',
    companyInfo: 'Logistics, 50 staff',
    companyNo: '+1 555 0199',
    contactMain: '+1 555 0100',
    location: 'Austin, Texas',
    status: 'voicemail',
    calledOn: '2026-09-01',
    followUp1: '2026-09-08',
    followUp1Status: 'prospect',
    followUp2: '2026-09-15',
    followUp2Status: '',
    followUp: '',
    stage: '',
    bookingDate: '',
    bookingTime: '',
    notes: 'Interested in a quote for a 14-pax coach',
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="crm-import-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

importsRouter.get('/:id', async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id).lean();
  if (!batch) throw new HttpError(404, 'Import not found');
  res.json(batch);
});

// Re-import a linked Google Sheet with the mapping stored on this batch (defaults: update existing, follow stage changes).
const resyncInput = z.object({
  duplicateStrategy: z.enum(['skip', 'update']).optional(),
  updateStage: z.boolean().optional(),
  requirePhone: z.boolean().optional(),
  // false = only import when the sheet content changed (returns { unchanged: true, batch } otherwise)
  force: z.boolean().default(true),
});

importsRouter.post('/:id/resync', async (req, res) => {
  const opts = resyncInput.parse(req.body || {});
  const result = await resyncBatch(req.params.id, { strategy: opts.duplicateStrategy, updateStage: opts.updateStage, requirePhone: opts.requirePhone, force: opts.force });
  res.json(result);
});

// Undo: delete the contacts this import created (contacts it merely updated are kept).
importsRouter.delete('/:id', async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);
  if (!batch) throw new HttpError(404, 'Import not found');
  if (batch.undoneAt) throw new HttpError(409, 'This import was already undone');
  // Every step is idempotent, so if one fails the request can simply be repeated (undoneAt is set last).
  await Contact.updateMany({ importBatchIds: batch._id }, { $pull: { importBatchIds: batch._id } });
  const created = await Contact.find({ 'source.batchId': batch._id }).select('_id').lean();
  const ids = created.map((c) => c._id);
  await Reminder.deleteMany({ contactId: { $in: ids } }); // no orphaned reminders for deleted contacts
  const r = await Contact.deleteMany({ _id: { $in: ids } });
  batch.undoneAt = new Date();
  batch.deletedOnUndo = r.deletedCount;
  await batch.save();
  res.json({ deleted: r.deletedCount, batch });
});
