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
export const STATS_TTL = 20_000;
const DAILY_TTL = 20_000;
const HISTORY_TTL = 60_000;

statsRouter.get('/', async (req, res) => {
  res.json(await memo('stats', STATS_TTL, computeStats));
});

// GET /api/stats/stage-days?stage=prospect&days=14 - contacts that entered the stage (and are still in it)
// per New York calendar day, newest day first. Every day of the span is present, with 0 when nothing moved.
statsRouter.get('/stage-days', async (req, res) => {
  const stage = String(req.query.stage || 'prospect');
  if (!STAGE_KEYS.includes(stage)) throw new HttpError(400, 'unknown stage');
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  res.json({ stage, days, items: await memo(`stage-days:${stage}:${days}`, STATS_TTL, () => stageDays(stage, days)) });
});

const pad2 = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

async function stageDays(stage, days) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const rows = await Contact.aggregate([
    { $match: { stage, stageChangedAt: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$stageChangedAt', timezone: process.env.TZ || 'America/New_York' } }, count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  const items = [];
  for (let i = 0; i < days; i += 1) {
    const key = localKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    items.push({ day: key, count: counts.get(key) || 0 });
  }
  return items;
}

export { computeStats, DAILY_TTL };

/**
 * Every whole-collection count the dashboard needs, in ONE pass over the contacts: totals per stage,
 * per priority and per sheet, the follow-up buckets, calls today, and the stages contacts entered
 * today. As separate queries these were eleven collection scans; with the database a continent away
 * that was the dashboard's whole cost. `$project` first so only the handful of fields each stage
 * needs flows through the facet.
 */
function contactRollup({ today, tomorrow, week, localMidnight }) {
  const inRange = (from, to) => ({ $and: [{ $ne: ['$followUp', null] }, { $gte: ['$followUp', from] }, { $lt: ['$followUp', to] }] });
  return Contact.aggregate([
    {
      $project: {
        _id: 0,
        stage: 1,
        priority: 1,
        sheet: '$source.sheetName',
        followUp: 1,
        contactedToday: { $cond: [{ $gte: [{ $ifNull: ['$lastContactedAt', new Date(0)] }, localMidnight] }, 1, 0] },
        // The stage this contact entered today and is still in ('' when it did not move today):
        // moving one back out takes it off the count again, as before.
        enteredToday: {
          $cond: [
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ['$activities', []] },
                      as: 'a',
                      cond: { $and: [{ $eq: ['$$a.type', 'stage'] }, { $eq: ['$$a.toStage', '$stage'] }, { $gte: [{ $ifNull: ['$$a.at', new Date(0)] }, localMidnight] }] },
                    },
                  },
                },
                0,
              ],
            },
            '$stage',
            '',
          ],
        },
      },
    },
    {
      $facet: {
        total: [{ $count: 'n' }],
        byStage: [{ $group: { _id: '$stage', count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        bySheet: [{ $group: { _id: '$sheet', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        enteredToday: [{ $match: { enteredToday: { $ne: '' } } }, { $group: { _id: '$enteredToday', count: { $sum: 1 } } }],
        totals: [
          {
            $group: {
              _id: null,
              contactedToday: { $sum: '$contactedToday' },
              // `$lt` compares across types in an expression, so null follow-ups are excluded explicitly
              overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$followUp', null] }, { $lt: ['$followUp', today] }] }, 1, 0] } },
              dueToday: { $sum: { $cond: [inRange(today, tomorrow), 1, 0] } },
              dueWeek: { $sum: { $cond: [inRange(today, week), 1, 0] } },
            },
          },
        ],
      },
    },
  ]);
}

async function computeStats() {
  const today = todayUtc();
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);

  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const localTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const [rollup, upcomingBookings, dueFollowUps, recentActivity, recentImports, remindersOverdue, remindersToday, urgentOpen] = await Promise.all([
    contactRollup({ today, tomorrow, week, localMidnight }),
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

  const f = rollup[0] || {};
  const totals = f.totals?.[0] || {};
  const entered = Object.fromEntries((f.enteredToday || []).map((r) => [r._id, r.count]));

  return {
    total: f.total?.[0]?.n || 0,
    byStage: toCounts(f.byStage || [], STAGE_KEYS, null),
    byPriority: toCounts((f.byPriority || []).map((r) => ({ ...r, _id: r._id || null })), PRIORITY_KEYS, 'none'),
    bySheet: (f.bySheet || []).map((r) => ({ sheet: r._id || '(manual)', count: r.count })),
    followUps: { overdue: totals.overdue || 0, today: totals.dueToday || 0, week: totals.dueWeek || 0 },
    reminders: { overdue: remindersOverdue, today: remindersToday, unscheduledPriority: urgentOpen[0]?.n || 0 },
    contactedToday: totals.contactedToday || 0,
    prospectsToday: entered.prospect || 0,
    // today's call results: contacts that entered the stage since midnight and are still in it
    todayByStage: { prospect: entered.prospect || 0, voicemail: entered.voicemail || 0, hung_up: entered.hung_up || 0, not_interested: entered.not_interested || 0 },
    upcomingBookings,
    dueFollowUps,
    recentActivity,
    recentImports,
  };
}
