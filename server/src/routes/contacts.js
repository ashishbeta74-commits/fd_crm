import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { Contact, isImportActivity, normalizeTags } from '../models/Contact.js';
import { Reminder } from '../models/Reminder.js';
import { CATEGORY_KEYS, PRIORITY_KEYS, STAGE_KEYS, TEXT_FIELDS, categoryLabel, priorityLabel, stageLabel } from '../fields.js';
import { addDays, isoDate, parseDate, todayUtc } from '../lib/dates.js';
import { HttpError } from '../lib/errors.js';
import { escapeRegex, runPool } from '../lib/pool.js';
import { computeDedupeKey } from '../lib/mapping.js';
import { composeLocation } from '../lib/geo.js';
import { LI_STEPS } from '../linkedin.js';
import { formatZoned } from '../config/timezone.js';

export const contactsRouter = Router();

const SEARCH_FIELDS = ['name', 'email', 'primaryEmail', 'secondaryEmail', 'companyName', 'title', 'location', 'city', 'state', 'country', 'contactMain', 'contactL1', 'companyNo', 'website', 'status', 'notes'];
const SORT_FIELDS = ['updatedAt', 'createdAt', 'name', 'companyName', 'stage', 'category', 'followUp', 'booking.date', 'lastContactedAt', 'location', 'title', 'priorityRank'];

export const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  stage: z.string().optional(),
  sheet: z.string().optional(),
  batch: z.string().optional(),
  // comma list of tag names (any of them); "none" = untagged
  tag: z.string().optional(),
  // comma list of priority keys; "none" = no priority set
  priority: z.string().optional(),
  // comma list of contact types (travel_advisor, executive_assistant, other); "none" = not set
  category: z.string().optional(),
  // comma lists of place names (exact, case-insensitive); "none" = not set
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  followUp: z.enum(['any', 'overdue', 'today', 'week', 'none']).optional(),
  booking: z.enum(['any', 'upcoming', 'none']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  sort: z.enum(SORT_FIELDS).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

const csv = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);

export function buildFilter(q) {
  const filter = {};
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = SEARCH_FIELDS.map((f) => ({ [f]: rx }));
  }
  if (q.stage) filter.stage = { $in: csv(q.stage) };
  if (q.sheet) filter['source.sheetName'] = q.sheet;
  // Contacts created before tags / priority existed have no such field at all, so "none" must match missing too.
  if (q.tag) {
    const tags = csv(q.tag);
    const named = tags.filter((t) => t !== 'none').map((t) => new RegExp(`^${escapeRegex(t)}$`, 'i'));
    const clauses = [];
    if (tags.includes('none')) clauses.push({ tags: { $exists: false } }, { tags: { $size: 0 } });
    if (named.length) clauses.push({ tags: { $in: named } });
    filter.$and = [...(filter.$and || []), { $or: clauses }];
  }
  if (q.priority) filter.priority = { $in: csv(q.priority).flatMap((v) => (v === 'none' ? ['', null] : [v])) };
  if (q.category) filter.category = { $in: csv(q.category).flatMap((v) => (v === 'none' ? ['', null] : [v])) };
  for (const k of ['country', 'state', 'city']) {
    if (!q[k]) continue;
    const values = csv(q[k]);
    const named = values.filter((v) => v !== 'none').map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i'));
    const clauses = [];
    if (values.includes('none')) clauses.push({ [k]: { $in: ['', null] } }, { [k]: { $exists: false } });
    if (named.length) clauses.push({ [k]: { $in: named } });
    filter.$and = [...(filter.$and || []), { $or: clauses }];
  }
  if (q.batch) {
    // every contact an import created OR updated (re-syncs only update, so source.batchId alone would show nothing)
    if (!mongoose.isValidObjectId(q.batch)) filter._id = null;
    else filter.$and = [...(filter.$and || []), { $or: [{ importBatchIds: q.batch }, { 'source.batchId': q.batch }] }];
  }
  const today = todayUtc();
  if (q.followUp) {
    const ranges = {
      any: { $ne: null },
      none: null,
      overdue: { $lt: today },
      today: { $gte: today, $lt: addDays(today, 1) },
      week: { $gte: today, $lt: addDays(today, 7) },
    };
    filter.followUp = ranges[q.followUp];
  }
  if (q.booking) {
    const ranges = { any: { $ne: null }, none: null, upcoming: { $gte: today } };
    filter['booking.date'] = ranges[q.booking];
  }
  return filter;
}

const textField = z.string().trim().max(5000).optional();
const dateField = z.union([z.string(), z.null()]).optional();
const contactInput = z
  .object({
    ...Object.fromEntries(TEXT_FIELDS.filter((k) => k !== 'notes').map((k) => [k, textField])),
    notes: z.string().max(50000).optional(),
    followUp: dateField,
    // follow-up rounds done; the Follow-ups page lets the team pick the round directly
    followUpCount: z.number().int().min(0).max(999).optional(),
    stage: z.enum(STAGE_KEYS).optional(),
    booking: z
      .object({
        date: dateField,
        time: z.string().trim().max(20).optional(),
        note: z.string().max(5000).optional(),
      })
      .optional(),
    extra: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.string().trim().max(40)).max(30).optional(),
    priority: z.enum(['', ...PRIORITY_KEYS]).optional(),
    category: z.enum(['', ...CATEGORY_KEYS]).optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .strict();

const describeBooking = (b) => {
  if (!b?.date) return 'Booking cleared';
  return `Booked for ${isoDate(b.date)}${b.time ? ` at ${b.time}` : ''}${b.note ? ` - ${b.note}` : ''}`;
};

/** Latest logged call / email on the contact (null when there is none). */
const lastLoggedTouch = (doc, except = null) => {
  const touches = doc.activities.filter((a) => a !== except && (a.type === 'call' || a.type === 'email' || a.type === 'followup'));
  return touches.length ? new Date(Math.max(...touches.map((a) => new Date(a.at).getTime()))) : null;
};

/** Apply validated input to a document, logging stage/booking changes as activities. */
export function applyInput(doc, input) {
  const activities = [];
  for (const k of TEXT_FIELDS) if (input[k] !== undefined) doc[k] = input[k];
  // Editing the place parts refreshes the display line unless the line itself was edited too.
  if (input.location === undefined && ['city', 'state', 'country'].some((k) => input[k] !== undefined)) {
    const line = composeLocation(doc);
    if (line || !doc.city && !doc.state && !doc.country) doc.location = line;
  }
  if (input.followUp !== undefined) doc.followUp = parseDate(input.followUp);
  if (input.followUpCount !== undefined && input.followUpCount !== (doc.followUpCount || 0)) {
    const from = doc.followUpCount || 0;
    doc.followUpCount = input.followUpCount;
    activities.push({ type: 'edit', message: `Follow-ups done set to ${input.followUpCount} (was ${from}) - next is follow-up ${input.followUpCount + 1}` });
  }
  if (input.extra !== undefined) {
    doc.extra = input.extra;
    doc.markModified('extra');
  }
  if (input.tags !== undefined) doc.tags = normalizeTags(input.tags);
  if (input.priority !== undefined && input.priority !== (doc.priority || '')) {
    const from = doc.priority;
    doc.priority = input.priority;
    activities.push({ type: 'edit', message: input.priority ? `Priority set to ${priorityLabel(input.priority)}${from ? ` (was ${priorityLabel(from)})` : ''}` : `Priority cleared (was ${priorityLabel(from)})` });
  }
  if (input.category !== undefined && input.category !== (doc.category || '')) {
    const from = doc.category;
    doc.category = input.category;
    activities.push({ type: 'edit', message: input.category ? `Type set to ${categoryLabel(input.category)}${from ? ` (was ${categoryLabel(from)})` : ''}` : `Type cleared (was ${categoryLabel(from)})` });
  }
  if (input.booking) {
    const before = JSON.stringify(doc.booking);
    const dateBefore = isoDate(doc.booking.date);
    if (input.booking.date !== undefined) doc.booking.date = parseDate(input.booking.date);
    if (input.booking.time !== undefined) doc.booking.time = input.booking.time;
    if (input.booking.note !== undefined) doc.booking.note = input.booking.note;
    // A new or moved booking date records when it was booked; clearing the date clears it too.
    if (isoDate(doc.booking.date) !== dateBefore) doc.booking.bookedAt = doc.booking.date ? new Date() : null;
    if (JSON.stringify(doc.booking) !== before) activities.push({ type: 'booking', message: describeBooking(doc.booking) });
  }
  if (input.stage !== undefined && input.stage !== doc.stage) {
    activities.push({ type: 'stage', fromStage: doc.stage, toStage: input.stage, message: `Moved from ${stageLabel(doc.stage)} to ${stageLabel(input.stage)}` });
    // Leaving New means the contact was worked on today: it counts as a call on the dashboard.
    // Going back to New takes that back: "last contacted" falls back to the calls / emails actually logged.
    if (doc.stage === 'new') doc.lastContactedAt = new Date();
    else if (input.stage === 'new') doc.lastContactedAt = lastLoggedTouch(doc);
    doc.stage = input.stage;
  }
  for (const a of activities) doc.activities.push(a);
  return activities;
}

async function loadContact(id) {
  const doc = await Contact.findById(id);
  if (!doc) throw new HttpError(404, 'Contact not found');
  return doc;
}

// ---------- list ----------
contactsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter = buildFilter(q);
  const sort = { [q.sort]: q.dir === 'asc' ? 1 : -1, _id: 1 };
  const [items, total] = await Promise.all([
    Contact.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).select('-activities').lean(),
    Contact.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)) });
});

// ---------- export (same filters as list) ----------
contactsRouter.get('/export', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter = buildFilter(q);
  const sort = { [q.sort]: q.dir === 'asc' ? 1 : -1, _id: 1 };
  const items = await Contact.find(filter).sort(sort).limit(20000).select('-activities').lean();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contacts');
  ws.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Title', key: 'title', width: 20 },
    { header: 'Company Name', key: 'companyName', width: 24 },
    { header: 'Website', key: 'website', width: 24 },
    { header: 'Primary Email', key: 'primaryEmail', width: 28 },
    { header: 'Second Email', key: 'secondaryEmail', width: 28 },
    { header: 'Contact L1 Info', key: 'contactL1', width: 18 },
    { header: 'Company Info', key: 'companyInfo', width: 30 },
    { header: 'Company No', key: 'companyNo', width: 18 },
    { header: 'Contact Main', key: 'contactMain', width: 18 },
    { header: 'Location', key: 'location', width: 18 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'State', key: 'state', width: 14 },
    { header: 'Country', key: 'country', width: 14 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Stage', key: 'stage', width: 16 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Type', key: 'category', width: 18 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Follow-up', key: 'followUp', width: 12 },
    { header: 'Follow-up Note', key: 'followUpNote', width: 24 },
    { header: 'Follow-ups Done', key: 'followUpCount', width: 10 },
    { header: 'Booking Date', key: 'bookingDate', width: 12 },
    { header: 'Booking Time', key: 'bookingTime', width: 10 },
    { header: 'Booking Note', key: 'bookingNote', width: 24 },
    { header: 'Booked On', key: 'bookedAt', width: 18 },
    { header: 'Notes', key: 'notes', width: 40 },
    { header: 'Last Contacted', key: 'lastContactedAt', width: 18 },
    { header: 'Source Sheet', key: 'sheet', width: 18 },
    { header: 'Source File', key: 'file', width: 24 },
    { header: 'Created', key: 'createdAt', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of items) {
    ws.addRow({
      ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, c[k] || ''])),
      stage: stageLabel(c.stage),
      priority: priorityLabel(c.priority),
      category: categoryLabel(c.category),
      tags: (c.tags || []).join(', '),
      followUp: isoDate(c.followUp),
      followUpCount: c.followUpCount || 0,
      bookingDate: isoDate(c.booking?.date),
      bookingTime: c.booking?.time || '',
      bookingNote: c.booking?.note || '',
      bookedAt: formatZoned(c.booking?.bookedAt),
      lastContactedAt: formatZoned(c.lastContactedAt),
      sheet: c.source?.sheetName || '',
      file: c.source?.fileName || '',
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '',
    });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${isoDate(new Date())}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ---------- bulk ----------
const bulkInput = z.object({
  ids: z.array(z.string()).min(1).max(2000),
  action: z.enum(['stage', 'delete', 'priority', 'category', 'addTags', 'removeTags']),
  stage: z.enum(STAGE_KEYS).optional(),
  priority: z.enum(['', ...PRIORITY_KEYS]).optional(),
  category: z.enum(['', ...CATEGORY_KEYS]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});

contactsRouter.post('/bulk', async (req, res) => {
  const body = bulkInput.parse(req.body);
  if (body.action === 'delete') {
    const r = await Contact.deleteMany({ _id: { $in: body.ids } });
    await Reminder.deleteMany({ contactId: { $in: body.ids } });
    return res.json({ deleted: r.deletedCount });
  }
  if (body.action === 'stage' && !body.stage) throw new HttpError(400, 'stage is required');
  if (body.action === 'priority' && body.priority === undefined) throw new HttpError(400, 'priority is required');
  if (body.action === 'category' && body.category === undefined) throw new HttpError(400, 'category is required');
  if ((body.action === 'addTags' || body.action === 'removeTags') && !body.tags?.length) throw new HttpError(400, 'tags are required');
  const docs = await Contact.find({ _id: { $in: body.ids } });
  const lower = new Set((body.tags || []).map((t) => t.toLowerCase()));
  const results = await runPool(docs, 8, async (doc) => {
    let input;
    if (body.action === 'stage') input = { stage: body.stage };
    else if (body.action === 'priority') input = { priority: body.priority };
    else if (body.action === 'category') input = { category: body.category };
    else if (body.action === 'addTags') input = { tags: [...doc.tags, ...body.tags] };
    else input = { tags: doc.tags.filter((t) => !lower.has(t.toLowerCase())) };
    const before = JSON.stringify(doc.tags);
    const changes = applyInput(doc, input);
    const tagsChanged = input.tags !== undefined && JSON.stringify(normalizeTags(input.tags)) !== before;
    if (changes.length || tagsChanged) await doc.save();
    return changes.length > 0 || tagsChanged;
  });
  const updated = results.filter((r) => r.ok && r.value).length;
  const errors = results.filter((r) => !r.ok).length;
  return res.json({ matched: docs.length, updated, errors });
});

// ---------- create ----------
contactsRouter.post('/', async (req, res) => {
  const input = contactInput.parse(req.body);
  const doc = new Contact();
  applyInput(doc, input);
  const key = computeDedupeKey(doc);
  if (key && !input.allowDuplicate) {
    const dup = await Contact.findOne({ dedupeKey: key }).select('_id name email companyName').lean();
    if (dup) throw new HttpError(409, 'A contact with the same email (or name + company) already exists', { existing: dup });
  }
  doc.activities.push({ type: 'note', message: 'Contact created manually' });
  await doc.save();
  res.status(201).json(doc);
});

// ---------- single ----------
contactsRouter.get('/:id', async (req, res) => {
  const doc = await Contact.findById(req.params.id).lean();
  if (!doc) throw new HttpError(404, 'Contact not found');
  // newest first; `fromImport` tells the UI which entries came from a sheet (not deletable)
  doc.activities = [...(doc.activities || [])].sort((a, b) => new Date(b.at) - new Date(a.at)).map((a) => ({ ...a, fromImport: isImportActivity(a) }));
  // Open reminders first (soonest first), then the last few completed ones.
  const [open, done] = await Promise.all([
    Reminder.find({ contactId: doc._id, done: false }).sort({ at: 1 }).lean(),
    Reminder.find({ contactId: doc._id, done: true }).sort({ doneAt: -1 }).limit(10).lean(),
  ]);
  doc.reminders = [...open, ...done];
  res.json(doc);
});

contactsRouter.patch('/:id', async (req, res) => {
  const input = contactInput.parse(req.body);
  const doc = await loadContact(req.params.id);
  applyInput(doc, input);
  await doc.save();
  res.json(doc);
});

contactsRouter.delete('/:id', async (req, res) => {
  const r = await Contact.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw new HttpError(404, 'Contact not found');
  await Reminder.deleteMany({ contactId: req.params.id });
  res.json({ ok: true });
});

// ---------- activities: log a call / add a note / add a follow-up ----------
const activityInput = z
  .object({
    type: z.enum(['note', 'call', 'followup']),
    message: z.string().max(5000).optional(),
    // how a follow-up was done
    channel: z.enum(['call', 'message', 'email']).optional(),
    stage: z.enum(STAGE_KEYS).optional(),
    followUp: dateField,
    followUpNote: textField,
    booking: z.object({ date: dateField, time: z.string().max(20).optional(), note: z.string().max(5000).optional() }).optional(),
  })
  .strict();

contactsRouter.post('/:id/activities', async (req, res) => {
  const input = activityInput.parse(req.body);
  const doc = await loadContact(req.params.id);
  if (input.type === 'call') {
    doc.lastContactedAt = new Date();
    doc.activities.push({ type: 'call', message: input.message || (input.stage ? `Call: ${stageLabel(input.stage)}` : 'Call logged') });
    // A call on a New contact moves it to Started unless the caller picked the stage (Connected / Voice Mail / ...).
    const nextStage = input.stage ?? (doc.stage === 'new' ? 'started' : undefined);
    if (nextStage && nextStage !== doc.stage) {
      doc.activities.push({ type: 'stage', fromStage: doc.stage, toStage: nextStage, message: `Moved from ${stageLabel(doc.stage)} to ${stageLabel(nextStage)}` });
      doc.stage = nextStage;
    }
  } else if (input.type === 'followup') {
    // One follow-up round done: bump the counter, count it as today's touch, and schedule the next one
    // (no `followUp` in the body = nothing further planned, so the current date is cleared).
    doc.followUpCount = (doc.followUpCount || 0) + 1;
    doc.lastContactedAt = new Date();
    const next = input.followUp ? parseDate(input.followUp) : null;
    const by = { call: 'by call', message: 'by message', email: 'by email' }[input.channel] || '';
    const summary = `Follow-up #${doc.followUpCount} done${by ? ` ${by}` : ''}${next ? ` - next on ${isoDate(next)}` : ''}`;
    doc.activities.push({ type: 'followup', channel: input.channel || '', message: input.message?.trim() ? `${summary}: ${input.message.trim()}` : summary });
    applyInput(doc, { stage: input.stage, followUp: input.followUp ?? null, followUpNote: input.followUp ? input.followUpNote || '' : '', booking: input.booking });
    await doc.save();
    return res.json(doc);
  } else {
    if (!input.message?.trim()) throw new HttpError(400, 'message is required for a note');
    doc.activities.push({ type: 'note', message: input.message.trim() });
  }
  applyInput(doc, { stage: input.type === 'note' ? input.stage : undefined, followUp: input.followUp, followUpNote: input.followUpNote, booking: input.booking });
  await doc.save();
  res.json(doc);
});

/**
 * Deleting a log entry also takes back what it recorded, so the counters agree with the history:
 * - a logged LinkedIn step ("LinkedIn: Followed the profile …") clears the date it set (the stage and
 *   the Followed / Requests / … counters drop back on save);
 * - a call or email recomputes "last contacted" from what is left.
 */
function undoActivity(doc, act) {
  if (act.type === 'linkedin') {
    const step = LI_STEPS.find((s) => act.message === `LinkedIn: ${s.label}` || act.message?.startsWith(`LinkedIn: ${s.label} `));
    if (!step) return;
    const li = doc.linkedin || {};
    for (const [field, value] of Object.entries(step.sets)) {
      if (value === 'date') li[field] = null;
      else if (li[field] === value) li[field] = '';
    }
    doc.linkedin = li;
    doc.markModified('linkedin');
    return;
  }
  if (act.type === 'followup') doc.followUpCount = Math.max(0, (doc.followUpCount || 0) - 1);
  if (act.type === 'call' || act.type === 'email' || act.type === 'followup') doc.lastContactedAt = lastLoggedTouch(doc, act);
}

// ---------- follow-ups: take the last one back ----------
// Removes the most recent "Add follow-up" (its history entry goes, the counter drops by one and "last
// contacted" is recomputed). A counter that was set by hand / by import with no entry behind it just drops by one.
contactsRouter.delete('/:id/followups/last', async (req, res) => {
  const doc = await loadContact(req.params.id);
  const last = [...doc.activities].filter((a) => a.type === 'followup').sort((a, b) => new Date(b.at) - new Date(a.at))[0];
  if (last) {
    undoActivity(doc, last);
    last.deleteOne();
  } else if ((doc.followUpCount || 0) > 0) {
    doc.followUpCount -= 1;
    doc.activities.push({ type: 'edit', message: `Follow-up removed - ${doc.followUpCount} done, next is follow-up ${doc.followUpCount + 1}` });
  } else {
    throw new HttpError(400, 'This contact has no follow-up to remove');
  }
  await doc.save();
  res.json(doc);
});

contactsRouter.delete('/:id/activities/:activityId', async (req, res) => {
  const doc = await loadContact(req.params.id);
  const act = doc.activities.id(req.params.activityId);
  if (!act) throw new HttpError(404, 'Activity not found');
  // Entries a sheet import wrote are the audit trail of the sheet, not something logged in the app: they stay.
  if (isImportActivity(act)) throw new HttpError(400, 'This entry came from the sheet import and cannot be deleted');
  undoActivity(doc, act);
  act.deleteOne();
  await doc.save();
  res.json(doc);
});
