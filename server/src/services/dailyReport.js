// Daily Progress Report (DPR): what the team did on a given day and where the pipeline stood at the
// end of it. Activity counts come from the contacts' history, so any past day can be reported, even
// days before this feature existed. The end-of-day pipeline snapshot cannot be rebuilt afterwards,
// so today's report is captured every few minutes (see startDailyReports) and the last capture of the
// day is kept as that day's "saved dashboard".
import mongoose from 'mongoose';
import { Contact } from '../models/Contact.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { Reminder } from '../models/Reminder.js';
import { DailyReport } from '../models/DailyReport.js';
import { STAGE_KEYS } from '../fields.js';
import { TIME_ZONE } from '../config/timezone.js';

const TICK_MS = 5 * 60 * 1000;
// Bump when the counting rules in computeMetrics change: saved reports with an older version are recounted.
export const METRICS_VERSION = 2;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" of an instant in the CRM's time zone (the process is pinned to it, so local parts are right). */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-midnight start and end of a "YYYY-MM-DD" day; null for anything that is not a real date. */
export function dayRange(key) {
  if (!ISO_DAY.test(String(key || ''))) return null;
  const [y, m, d] = key.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) return null;
  return { key, start, end: new Date(y, m - 1, d + 1) };
}

/** The day `n` days after `key`. */
export function shiftDay(key, n) {
  const r = dayRange(key);
  if (!r) return key;
  const d = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + n);
  return dayKey(d);
}

// The team also logs calls in the linked Google Sheets; a sync writes those as `call` entries dated to the
// sheet's calling date (noon), so they count as that day's calls, like the hero's "Calls today" does.
// Only the "Imported from …" bookkeeping entries are left out.
const APP_ACTIVITY = { 'activities.type': { $ne: 'import' } };

const emptyStages = () => Object.fromEntries(STAGE_KEYS.map((k) => [k, 0]));

/** Everything the team did on the day: counts per activity type, stage moves, distinct contacts touched. */
export async function computeMetrics(range) {
  const { start, end } = range;
  const inDay = { $gte: start, $lt: end };
  const [rows, created, imports, remindersDone, remindersSet] = await Promise.all([
    Contact.aggregate([
      { $match: { 'activities.at': inDay } },
      { $unwind: '$activities' },
      { $match: { 'activities.at': inDay, ...APP_ACTIVITY } },
      { $group: { _id: { type: '$activities.type', toStage: '$activities.toStage' }, count: { $sum: 1 }, contacts: { $addToSet: '$_id' } } },
    ]),
    Contact.countDocuments({ createdAt: inDay }),
    ImportBatch.find({ createdAt: inDay, undoneAt: null }).select('totals status').lean(),
    Reminder.countDocuments({ done: true, doneAt: inDay }),
    Reminder.countDocuments({ createdAt: inDay }),
  ]);

  const byType = {};
  const stageMoves = emptyStages();
  const calledContacts = new Set();
  const workedContacts = new Set();
  for (const r of rows) {
    const { type, toStage } = r._id;
    byType[type] = (byType[type] || 0) + r.count;
    if (type === 'stage' && toStage) stageMoves[toStage] = (stageMoves[toStage] || 0) + r.count;
    const ids = r.contacts.map(String);
    if (type === 'call') ids.forEach((id) => calledContacts.add(id));
    if (['call', 'email', 'followup', 'stage', 'note', 'booking', 'linkedin'].includes(type)) ids.forEach((id) => workedContacts.add(id));
  }
  // Automatic sheet re-syncs run all day; only imports that brought something in count as work.
  const importsDone = imports.filter((b) => b.status === 'done' && ((b.totals?.created || 0) > 0 || (b.totals?.updated || 0) > 0));
  return {
    calls: byType.call || 0,
    contactsCalled: calledContacts.size,
    contactsWorked: workedContacts.size,
    emails: byType.email || 0,
    followUpsDone: byType.followup || 0,
    notes: byType.note || 0,
    bookings: byType.booking || 0,
    linkedinSteps: byType.linkedin || 0,
    stageChanges: byType.stage || 0,
    // The stages contacts were moved INTO that day (by hand, drag, bulk or a logged call).
    prospects: stageMoves.prospect || 0,
    connected: stageMoves.connected || 0,
    converted: stageMoves.converted || 0,
    stageMoves,
    newContacts: created,
    imports: importsDone.length,
    importedRows: importsDone.reduce((n, b) => n + (b.totals?.created || 0), 0),
    importUpdatedRows: importsDone.reduce((n, b) => n + (b.totals?.updated || 0), 0),
    remindersDone,
    remindersSet,
  };
}

/** Where the pipeline stands right now (the part of the report that cannot be rebuilt later). */
export async function computeSnapshot() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const tomorrowUtc = new Date(todayUtc.getTime() + 86400000);
  const [total, byStage, overdue, dueToday, remindersOpen, remindersOverdue, upcomingBookings] = await Promise.all([
    Contact.countDocuments(),
    Contact.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Contact.countDocuments({ followUp: { $lt: todayUtc } }),
    Contact.countDocuments({ followUp: { $gte: todayUtc, $lt: tomorrowUtc } }),
    Reminder.countDocuments({ done: false }),
    Reminder.countDocuments({ done: false, at: { $lt: now } }),
    Contact.countDocuments({ 'booking.date': { $gte: todayUtc } }),
  ]);
  const stages = emptyStages();
  for (const r of byStage) if (r._id in stages) stages[r._id] = r.count;
  return { total, byStage: stages, followUps: { overdue, today: dueToday }, reminders: { open: remindersOpen, overdue: remindersOverdue }, upcomingBookings };
}

/**
 * Refresh (or create) the saved report for a day. Today gets fresh metrics and a fresh snapshot.
 * A past day keeps its last snapshot; its metrics are recounted once more and it is marked final,
 * so a day the server slept through still gets correct activity numbers.
 */
export async function saveReport(key) {
  const range = dayRange(key);
  if (!range) return null;
  const isToday = key === dayKey();
  const metrics = await computeMetrics(range);
  const set = { metrics, version: METRICS_VERSION, final: !isToday && range.end <= new Date() };
  if (isToday) {
    set.snapshot = await computeSnapshot();
    set.capturedAt = new Date();
  }
  return DailyReport.findOneAndUpdate({ date: key }, { $set: set, $setOnInsert: { date: key } }, { upsert: true, new: true, lean: true });
}

/** The report for a day: the saved one when it is final, otherwise a fresh count (and today gets saved on the way). */
export async function getReport(key) {
  const range = dayRange(key);
  if (!range) return null;
  const isToday = key === dayKey();
  let doc = await DailyReport.findOne({ date: key }).lean();
  if (!doc || isToday || !doc.final || doc.version !== METRICS_VERSION) doc = await saveReport(key);
  return {
    date: key,
    isToday,
    final: Boolean(doc.final),
    metrics: doc.metrics || {},
    // Days before the reports existed have activity numbers but no end-of-day pipeline.
    snapshot: doc.snapshot || null,
    capturedAt: doc.capturedAt || null,
  };
}

/** Per-day activity totals for the last `days` days (today included), oldest first - the day picker strip. */
export async function history(days = 14) {
  const n = Math.min(Math.max(1, days), 92);
  const todayKey = dayKey();
  return perDay(shiftDay(todayKey, -(n - 1)), todayKey);
}

/** One row per calendar day from `fromKey` to `toKey` (both inclusive, oldest first) with that day's headline counts. */
export async function perDay(fromKey, toKey) {
  const from = dayRange(fromKey);
  const to = dayRange(toKey);
  if (!from || !to || fromKey > toKey) return [];
  const inSpan = { $gte: from.start, $lt: to.end };
  const rows = await Contact.aggregate([
    { $match: { 'activities.at': inSpan } },
    { $unwind: '$activities' },
    { $match: { 'activities.at': inSpan, ...APP_ACTIVITY } },
    {
      $group: {
        _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$activities.at', timezone: TIME_ZONE } }, type: '$activities.type', toStage: '$activities.toStage' },
        count: { $sum: 1 },
        contacts: { $addToSet: '$_id' },
      },
    },
  ]);
  const byDay = new Map();
  for (let key = fromKey; key <= toKey; key = shiftDay(key, 1)) {
    byDay.set(key, { date: key, calls: 0, contactsWorked: new Set(), prospects: 0, connected: 0, followUpsDone: 0, emails: 0, stageChanges: 0, activities: 0 });
  }
  for (const r of rows) {
    const d = byDay.get(r._id.day);
    if (!d) continue;
    const { type, toStage } = r._id;
    d.activities += r.count;
    if (type === 'call') d.calls += r.count;
    if (type === 'email') d.emails += r.count;
    if (type === 'followup') d.followUpsDone += r.count;
    if (type === 'stage') d.stageChanges += r.count;
    if (type === 'stage' && toStage === 'prospect') d.prospects += r.count;
    if (type === 'stage' && toStage === 'connected') d.connected += r.count;
    if (['call', 'email', 'followup', 'stage', 'note', 'booking', 'linkedin'].includes(type)) r.contacts.forEach((id) => d.contactsWorked.add(String(id)));
  }
  return [...byDay.values()].map((d) => ({ ...d, contactsWorked: d.contactsWorked.size }));
}

export const MAX_RANGE_DAYS = 366;

/** Number of calendar days from `fromKey` to `toKey` inclusive. */
export function spanDays(fromKey, toKey) {
  const a = dayRange(fromKey);
  const b = dayRange(toKey);
  if (!a || !b) return 0;
  return Math.round((b.start - a.start) / 86400000) + 1;
}

/**
 * A custom "from - to" report: the same metrics as one day, counted over the whole span (contacts
 * worked / called are distinct across the span, not a sum of days), plus the day-by-day rows.
 */
export async function getRangeReport(fromKey, toKey) {
  const from = dayRange(fromKey);
  const to = dayRange(toKey);
  if (!from || !to) return null;
  const [metrics, days] = await Promise.all([computeMetrics({ start: from.start, end: to.end }), perDay(fromKey, toKey)]);
  return { from: fromKey, to: toKey, days: spanDays(fromKey, toKey), metrics, perDay: days };
}

let timer = null;
/**
 * Every 5 minutes: capture today's report and close any past day still marked open (yesterday after
 * midnight, or days the server slept through). Safe to call once per process.
 */
export function startDailyReports() {
  if (timer) return;
  const tick = async () => {
    if (mongoose.connection.readyState !== 1) return;
    try {
      const today = dayKey();
      const open = await DailyReport.find({ date: { $lt: today }, $or: [{ final: false }, { version: { $ne: METRICS_VERSION } }] }).select('date').lean();
      for (const r of open) await saveReport(r.date);
      await saveReport(today);
    } catch (err) {
      console.error(`[dpr] ${err.message}`);
    }
  };
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  setTimeout(tick, 8000).unref?.();
}
