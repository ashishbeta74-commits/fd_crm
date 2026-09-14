import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { PRIORITY_KEYS, priorityLabel } from '../fields.js';
import { Contact } from '../models/Contact.js';
import { Reminder } from '../models/Reminder.js';
import { formatZoned } from '../config/timezone.js';

export const remindersRouter = Router();

const CONTACT_SUMMARY = 'name companyName email primaryEmail contactMain companyNo contactL1 stage priority priorityRank tags followUp';

/** "2026-09-15" -> that day 09:00 local; anything else -> Date.parse. */
export function parseWhen(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 9, 0, 0, 0);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

const whenField = z.union([z.string(), z.number(), z.date()]);

const reminderInput = z
  .object({
    contactId: z.string().min(1),
    at: whenField,
    note: z.string().trim().max(500).default(''),
    // omitted -> the contact's own priority
    priority: z.enum(['', ...PRIORITY_KEYS]).optional(),
  })
  .strict();

const patchInput = z
  .object({
    at: whenField.optional(),
    note: z.string().trim().max(500).optional(),
    priority: z.enum(['', ...PRIORITY_KEYS]).optional(),
    done: z.boolean().optional(),
  })
  .strict();

// Most urgent first, then soonest.
const byPriorityThenTime = { priorityRank: -1, at: 1, _id: 1 };

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

async function withContacts(reminders) {
  const ids = [...new Set(reminders.map((r) => String(r.contactId)))];
  const contacts = await Contact.find({ _id: { $in: ids } }).select(CONTACT_SUMMARY).lean();
  const byId = new Map(contacts.map((c) => [String(c._id), c]));
  return reminders.map((r) => ({ ...r, contact: byId.get(String(r.contactId)) || null })).filter((r) => r.contact);
}

async function loadReminder(id) {
  const r = await Reminder.findById(id);
  if (!r) throw new HttpError(404, 'Reminder not found');
  return r;
}

async function logOnContact(contactId, message) {
  await Contact.updateOne({ _id: contactId }, { $push: { activities: { type: 'reminder', message, at: new Date() } } });
}

// Everything open, grouped for the Follow-ups page / reminders list: overdue, today, week, later (+ recent done).
remindersRouter.get('/', async (req, res) => {
  const { scope } = z.object({ scope: z.enum(['open', 'done', 'all']).default('open') }).parse(req.query);
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  const groups = { overdue: [], today: [], week: [], later: [], done: [] };
  if (scope !== 'done') {
    const open = await withContacts(await Reminder.find({ done: false }).sort(byPriorityThenTime).limit(3000).lean());
    for (const r of open) {
      const at = new Date(r.at);
      const entry = { ...r, overdue: at < now };
      if (at < today) groups.overdue.push(entry);
      else if (at < tomorrow) groups.today.push(entry);
      else if (at < week) groups.week.push(entry);
      else groups.later.push(entry);
    }
  }
  if (scope !== 'open') groups.done = await withContacts(await Reminder.find({ done: true }).sort({ doneAt: -1 }).limit(100).lean());
  res.json(groups);
});

// What the bell shows: counts + the most urgent due items, and the ones that still need a browser notification.
remindersRouter.get('/due', async (req, res) => {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const [overdue, dueToday, items, unnotified] = await Promise.all([
    Reminder.countDocuments({ done: false, at: { $lt: now } }),
    Reminder.countDocuments({ done: false, at: { $gte: now, $lt: tomorrow } }),
    withContacts(await Reminder.find({ done: false, at: { $lt: tomorrow } }).sort(byPriorityThenTime).limit(25).lean()),
    withContacts(await Reminder.find({ done: false, at: { $lte: now }, notifiedAt: null }).sort(byPriorityThenTime).limit(10).lean()),
  ]);
  const byPriority = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
  for (const r of items) if (new Date(r.at) < now) byPriority[r.priority || 'none'] += 1;
  res.json({ overdue, today: dueToday, byPriority, items: items.map((r) => ({ ...r, overdue: new Date(r.at) < now })), unnotified, now: now.toISOString() });
});

// The browser showed a notification for these reminders; do not notify again.
remindersRouter.post('/notified', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(100) }).parse(req.body);
  const r = await Reminder.updateMany({ _id: { $in: ids }, notifiedAt: null }, { $set: { notifiedAt: new Date() } });
  res.json({ updated: r.modifiedCount });
});

remindersRouter.post('/', async (req, res) => {
  const body = reminderInput.parse(req.body);
  const contact = await Contact.findById(body.contactId).select('priority name').lean();
  if (!contact) throw new HttpError(404, 'Contact not found');
  const at = parseWhen(body.at);
  if (!at) throw new HttpError(400, 'Invalid reminder date/time');
  const priority = body.priority ?? contact.priority ?? '';
  const item = await Reminder.create({ contactId: contact._id, at, note: body.note, priority, createdBy: req.user?._id || null });
  await logOnContact(contact._id, `Reminder set for ${formatZoned(at)}${priority ? ` (${priorityLabel(priority)})` : ''}${body.note ? `: ${body.note}` : ''}`);
  res.status(201).json(item);
});

remindersRouter.patch('/:id', async (req, res) => {
  const body = patchInput.parse(req.body);
  const item = await loadReminder(req.params.id);
  if (body.at !== undefined) {
    const at = parseWhen(body.at);
    if (!at) throw new HttpError(400, 'Invalid reminder date/time');
    item.at = at;
    item.notifiedAt = null; // a rescheduled reminder rings again
  }
  if (body.note !== undefined) item.note = body.note;
  if (body.priority !== undefined) item.priority = body.priority;
  if (body.done !== undefined && body.done !== item.done) {
    item.done = body.done;
    item.doneAt = body.done ? new Date() : null;
    if (body.done) await logOnContact(item.contactId, `Reminder done${item.note ? `: ${item.note}` : ''}`);
  }
  await item.save();
  res.json(item);
});

// Push a reminder forward: { minutes } from now, or { until } (date / date-time).
remindersRouter.post('/:id/snooze', async (req, res) => {
  const body = z.object({ minutes: z.number().int().min(1).max(60 * 24 * 365).optional(), until: whenField.optional() }).parse(req.body || {});
  const item = await loadReminder(req.params.id);
  const at = body.until !== undefined ? parseWhen(body.until) : new Date(Date.now() + (body.minutes || 60) * 60_000);
  if (!at) throw new HttpError(400, 'Invalid snooze time');
  item.at = at;
  item.done = false;
  item.doneAt = null;
  item.notifiedAt = null;
  await item.save();
  res.json(item);
});

remindersRouter.delete('/:id', async (req, res) => {
  const r = await Reminder.findByIdAndDelete(req.params.id);
  if (!r) throw new HttpError(404, 'Reminder not found');
  res.json({ ok: true });
});
