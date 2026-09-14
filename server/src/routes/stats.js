import { Router } from 'express';
import { Contact } from '../models/Contact.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { Reminder } from '../models/Reminder.js';
import { PRIORITY_KEYS, STAGE_KEYS } from '../fields.js';
import { addDays, todayUtc } from '../lib/dates.js';
import { HttpError } from '../lib/errors.js';
import { memo } from '../lib/cache.js';
import { MAX_RANGE_DAYS, dayKey, dayRange, getRangeReport, getReport, history, shiftDay, spanDays } from '../services/dailyReport.js';

export const statsRouter = Router();

// ---------- Daily Progress Report ----------
// GET /api/stats/daily?date=YYYY-MM-DD  (defaults to today, New York calendar)
statsRouter.get('/daily', async (req, res) => {
  const key = String(req.query.date || dayKey());
  if (!dayRange(key)) throw new HttpError(400, 'date must be YYYY-MM-DD');
  // Today is recounted at most every 20 s however many dashboards are open; a closed day is served from its saved report anyway.
  const report = await memo(`daily:${key}`, key === dayKey() ? DAILY_TTL : HISTORY_TTL, () => getReport(key));
  res.json({ ...report, today: dayKey(), prev: shiftDay(key, -1), next: key < dayKey() ? shiftDay(key, 1) : null });
});

// GET /api/stats/daily/range?from=YYYY-MM-DD&to=YYYY-MM-DD - one report over a custom span (max 366 days), with per-day rows
statsRouter.get('/daily/range', async (req, res) => {
  const today = dayKey();
  const to = String(req.query.to || today);
  const from = String(req.query.from || shiftDay(to, -6));
  if (!dayRange(from) || !dayRange(to)) throw new HttpError(400, 'from and to must be YYYY-MM-DD');
  if (from > to) throw new HttpError(400, 'from must not be after to');
  if (spanDays(from, to) > MAX_RANGE_DAYS) throw new HttpError(400, `the range can cover at most ${MAX_RANGE_DAYS} days`);
  res.json({ ...(await memo(`range:${from}:${to}`, HISTORY_TTL, () => getRangeReport(from, to))), today });
});

// GET /api/stats/daily/history?days=14 - per-day totals for the day picker, oldest first
statsRouter.get('/daily/history', async (req, res) => {
  const days = Number(req.query.days) || 14;
  res.json({ today: dayKey(), days: await memo(`history:${days}`, HISTORY_TTL, () => history(days)) });
});

const toCounts = (rows, keys, nullKey = 'none') => {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  if (nullKey) out[nullKey] = 0;
  for (const r of rows) out[r._id ?? nullKey] = r.count;
  return out;
};

// Read endpoints the whole team polls are memoised briefly (see lib/cache.js): one set of queries per
// window serves every open dashboard. Short enough that a logged call shows within a refresh or two.
const STATS_TTL = 10_000;
const META_TTL = 60_000;
const DAILY_TTL = 20_000;
const HISTORY_TTL = 60_000;

statsRouter.get('/', async (req, res) => {
  res.json(await memo('stats', STATS_TTL, computeStats));
});

async function computeStats() {
  const today = todayUtc();
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);

  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const localTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const [total, byStage, bySheet, overdue, dueToday, dueWeek, upcomingBookings, dueFollowUps, recentActivity, recentImports, contactedToday, prospectsToday, byPriority, remindersOverdue, remindersToday, urgentOpen] =
    await Promise.all([
      Contact.countDocuments(),
      Contact.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      Contact.aggregate([{ $group: { _id: '$source.sheetName', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Contact.countDocuments({ followUp: { $lt: today } }),
      Contact.countDocuments({ followUp: { $gte: today, $lt: tomorrow } }),
      Contact.countDocuments({ followUp: { $gte: today, $lt: week } }),
      Contact.find({ 'booking.date': { $gte: today } })
        .sort({ 'booking.date': 1, 'booking.time': 1 })
        .limit(8)
        .select('name companyName stage booking')
        .lean(),
      Contact.find({ followUp: { $lt: week } })
        .sort({ followUp: 1 })
        .limit(8)
        .select('name companyName stage followUp followUpNote')
        .lean(),
      // Only the most recently touched contacts can hold the newest entries (any logged activity bumps
      // updatedAt), so unwind 150 of them instead of every contact's whole history.
      Contact.aggregate([
        { $sort: { updatedAt: -1 } },
        { $limit: 150 },
        { $match: { activities: { $elemMatch: { type: { $ne: 'import' } } } } },
        { $unwind: '$activities' },
        { $match: { 'activities.type': { $ne: 'import' } } },
        { $sort: { 'activities.at': -1 } },
        { $limit: 12 },
        { $project: { _id: 0, contactId: '$_id', name: 1, companyName: 1, activity: '$activities' } },
      ]),
      ImportBatch.find().sort({ createdAt: -1 }).limit(5).select('fileName totals status createdAt undoneAt').lean(),
      Contact.countDocuments({ lastContactedAt: { $gte: localMidnight } }),
      // Contacts moved into Prospect since midnight (by hand, drag, bulk, a logged call or a sheet sync)
      // and still there: moving one back out takes it off the count again.
      Contact.countDocuments({ stage: 'prospect', activities: { $elemMatch: { type: 'stage', toStage: 'prospect', at: { $gte: localMidnight } } } }),
      Contact.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Reminder.countDocuments({ done: false, at: { $lt: now } }),
      Reminder.countDocuments({ done: false, at: { $gte: now, $lt: localTomorrow } }),
      // High-priority contacts nobody is scheduled to touch: no follow-up, no open reminder.
      Contact.aggregate([
        { $match: { priority: { $in: ['urgent', 'high'] }, followUp: null, stage: { $nin: ['done', 'converted'] } } },
        { $lookup: { from: 'reminders', let: { id: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$contactId', '$$id'] }, { $eq: ['$done', false] }] } } }, { $limit: 1 }], as: 'open' } },
        { $match: { open: { $size: 0 } } },
        { $count: 'n' },
      ]),
    ]);

  return {
    total,
    byStage: toCounts(byStage, STAGE_KEYS, null),
    byPriority: toCounts(byPriority.map((r) => ({ ...r, _id: r._id || null })), PRIORITY_KEYS, 'none'),
    bySheet: bySheet.map((r) => ({ sheet: r._id || '(manual)', count: r.count })),
    followUps: { overdue, today: dueToday, week: dueWeek },
    reminders: { overdue: remindersOverdue, today: remindersToday, unscheduledPriority: urgentOpen[0]?.n || 0 },
    contactedToday,
    prospectsToday,
    upcomingBookings,
    dueFollowUps,
    recentActivity,
    recentImports,
  };
}
