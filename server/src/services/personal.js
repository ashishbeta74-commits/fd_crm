import mongoose from 'mongoose';
import { Contact } from '../models/Contact.js';
import { User } from '../models/User.js';
import { WorkspaceEvent } from '../models/WorkspaceEvent.js';
import { EmailEvaluation } from '../models/EmailEvaluation.js';
import { todayUtc } from '../lib/dates.js';
import { dayRange } from './dailyReport.js';

// Per-person numbers for "My dashboard": what each team member did between two New York days, read from
// the history entries their saves were stamped with (Activity.byId, see models/Contact.js). Entries from
// before attribution existed, sheet syncs and start-up jobs have no byId, so they count for nobody.

// Stages a call ends in: a move into one of these counts the contact as called.
const CALL_RESULTS = new Set(['started', 'connected', 'voicemail', 'wrong_number', 'hung_up', 'not_interested', 'prospect']);
// Work that counts a contact as "worked" (same list as the daily report).
const WORK_TYPES = new Set(['call', 'email', 'followup', 'stage', 'note', 'booking', 'linkedin']);

/** This person's (or everyone's) history entries in [start, end), one row per entry. */
function entriesPipeline(start, end, userId) {
  const inWindow = [
    { $gte: ['$$a.at', start] },
    { $lt: ['$$a.at', end] },
    userId ? { $eq: ['$$a.byId', userId] } : { $ne: [{ $ifNull: ['$$a.byId', null] }, null] },
  ];
  return [
    { $match: { activities: { $elemMatch: { at: { $gte: start, $lt: end }, byId: userId || { $exists: true } } } } },
    { $project: { name: 1, companyName: 1, stage: 1, a: { $filter: { input: '$activities', as: 'a', cond: { $and: inWindow } } } } },
    { $unwind: '$a' },
  ];
}

const emptyRow = () => ({ calls: 0, worked: 0, followUps: 0, emails: 0, notes: 0, edits: 0, bookings: 0, linkedin: 0, stageMoves: {}, stageContacts: {} });

/**
 * Counts per person: distinct contacts called / worked / moved into each stage, and entries per type.
 * Stage changes count by their result: per person and contact only the stage they left it in counts, so a
 * mistake that was corrected (Prospect -> Voice Mail) counts once as Voice Mail, and one that was undone
 * (New -> Prospect -> New) counts for nothing. Recording the same result again (another voicemail, also via a
 * reset to New: Voice Mail -> New -> Voice Mail) does count.
 */
export async function peopleCounts(from, to, userId = null) {
  const start = dayRange(from).start;
  const end = dayRange(to).end;
  const [rows, stageRows] = await Promise.all([
    Contact.aggregate([
      ...entriesPipeline(start, end, userId),
      { $match: { 'a.type': { $ne: 'stage' } } },
      { $group: { _id: { by: '$a.byId', type: '$a.type', channel: '$a.channel' }, count: { $sum: 1 }, contacts: { $addToSet: '$_id' } } },
    ]),
    Contact.aggregate([
      ...entriesPipeline(start, end, userId),
      { $match: { 'a.type': 'stage' } },
      { $sort: { 'a.at': 1 } },
      {
        $group: {
          _id: { by: '$a.byId', contact: '$_id' },
          from: { $first: '$a.fromStage' },
          to: { $last: '$a.toStage' },
          lastFrom: { $last: '$a.fromStage' },
          // "called again" entries (Voice Mail -> Voice Mail): real attempts, not a move that was undone
          repeats: { $sum: { $cond: [{ $eq: ['$a.fromStage', '$a.toStage'] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const people = new Map();
  const person = (by) => {
    const key = String(by);
    if (!people.has(key)) people.set(key, { ...emptyRow(), called: new Set(), workedSet: new Set(), moved: {} });
    return people.get(key);
  };
  for (const r of rows) {
    const p = person(r._id.by);
    const { type, channel } = r._id;
    const ids = r.contacts.map(String);
    if (type === 'followup') p.followUps += r.count;
    if (type === 'email') p.emails += r.count;
    if (type === 'note') p.notes += r.count;
    if (type === 'edit') p.edits += r.count;
    if (type === 'booking') p.bookings += r.count;
    if (type === 'linkedin') p.linkedin += r.count;
    if (type === 'call' || (type === 'followup' && (channel === 'call' || !channel))) ids.forEach((id) => p.called.add(id));
    if (WORK_TYPES.has(type)) ids.forEach((id) => p.workedSet.add(id));
  }
  for (const r of stageRows) {
    const { to: stage, from: startedIn, repeats, lastFrom } = r;
    // Moved back to where it started: nothing happened (Prospect by mistake, then back). Except when the same
    // result was recorded again: with "… again", or the older way of resetting to New first and picking the
    // result once more (Voice Mail -> New -> Voice Mail), where the last move comes from New.
    if (!stage || (stage === startedIn && !repeats && lastFrom !== 'new')) continue;
    const p = person(r._id.by);
    const id = String(r._id.contact);
    if (CALL_RESULTS.has(stage)) p.called.add(id);
    p.workedSet.add(id);
    p.stageMoves[stage] = (p.stageMoves[stage] || 0) + 1;
    p.moved[stage] = p.moved[stage] || new Set();
    p.moved[stage].add(id);
  }
  const out = new Map();
  for (const [key, p] of people) {
    const { called, workedSet, moved, ...rest } = p;
    out.set(key, { ...rest, calls: called.size, worked: workedSet.size, stageContacts: Object.fromEntries(Object.entries(moved).map(([s, set]) => [s, set.size])) });
  }
  return out;
}

/** The person's own entries, newest first, with the contact they were on (for the "What I did" list). */
export async function personFeed(from, to, userId, limit = 200) {
  const start = dayRange(from).start;
  const end = dayRange(to).end;
  const rows = await Contact.aggregate([
    ...entriesPipeline(start, end, userId),
    { $match: { 'a.type': { $ne: 'import' } } },
    { $sort: { 'a.at': -1 } },
    { $limit: limit },
    { $project: { _id: 0, contactId: '$_id', name: 1, companyName: 1, stage: 1, type: '$a.type', message: '$a.message', toStage: '$a.toStage', channel: '$a.channel', at: '$a.at' } },
  ]);
  return rows;
}

/**
 * Status / reach-out type changes made on Client Reach Out / Reservations (models/WorkspaceEvent.js), per person:
 * { <workspace>: { total (changes), rows (distinct rows worked), byStatus: { <new status>: changes },
 *   byType: { Call | Email | Text: distinct rows } } }, plus `worked`: distinct rows over both pages.
 */
export async function workspaceCounts(from, to, userId = null) {
  const rows = await WorkspaceEvent.aggregate([
    { $match: { at: { $gte: dayRange(from).start, $lt: dayRange(to).end }, byId: userId || { $ne: null } } },
    { $project: { byId: 1, workspace: 1, rowId: 1, reachType: 1, status: { $cond: [{ $eq: ['$kind', 'type'] }, null, '$to'] } } },
  ]);
  const people = new Map();
  for (const e of rows) {
    const p = people.get(String(e.byId)) || {};
    people.set(String(e.byId), p);
    const w = (p[e.workspace] ||= { total: 0, rows: new Set(), byStatus: {}, byType: {} });
    w.total += 1;
    w.rows.add(String(e.rowId));
    if (e.status !== null) w.byStatus[e.status || 'Not set'] = (w.byStatus[e.status || 'Not set'] || 0) + 1;
    if (e.reachType) (w.byType[e.reachType] ||= new Set()).add(String(e.rowId));
  }
  const out = new Map();
  for (const [by, p] of people) {
    const shaped = { worked: 0 };
    for (const [ws, w] of Object.entries(p)) {
      shaped.worked += w.rows.size;
      shaped[ws] = { total: w.total, rows: w.rows.size, byStatus: w.byStatus, byType: Object.fromEntries(Object.entries(w.byType).map(([t, s]) => [t, s.size])) };
    }
    out.set(by, shaped);
  }
  return out;
}

/** The person's status / reach-out type changes on those pages, newest first. */
function workspaceFeed(from, to, userId, limit = 200) {
  return WorkspaceEvent.find({ byId: userId, at: { $gte: dayRange(from).start, $lt: dayRange(to).end } })
    .sort({ at: -1 })
    .limit(limit)
    .select('-_id workspace rowId kind label from to reachType at')
    .lean();
}

/** A person's contact counts with their Client Reach Out / Reservations rows added to "worked". */
function withWorkspaces(counts = emptyRow(), { worked = 0, ...workspaces } = {}) {
  return { ...counts, worked: counts.worked + worked, workspaces };
}

/** The whole team (active accounts), each with their counts - zero rows included so nobody is missing. */
export async function teamBoard(from, to) {
  const [users, counts, wsCounts] = await Promise.all([User.find({}).select('displayName username userId role active').sort({ userId: 1 }).lean(), peopleCounts(from, to), workspaceCounts(from, to)]);
  return users
    .filter((u) => u.active || counts.has(String(u._id)) || wsCounts.has(String(u._id)))
    .map((u) => ({ id: String(u._id), name: u.displayName || u.username, userId: u.userId, ...withWorkspaces(counts.get(String(u._id)), wsCounts.get(String(u._id))) }));
}

export async function personSummary(from, to, userId) {
  const id = new mongoose.Types.ObjectId(String(userId));
  const [counts, feed, wsCounts, wsFeed] = await Promise.all([peopleCounts(from, to, id), personFeed(from, to, id), workspaceCounts(from, to, id), workspaceFeed(from, to, id)]);
  const { workspaces, ...c } = withWorkspaces(counts.get(String(id)), wsCounts.get(String(id)));
  return { counts: c, feed, workspaces, workspaceFeed: wsFeed };
}

/**
 * "My dashboard" for someone who works the Email Evaluation sheet (TEAM `dashboard: 'email'`, services/users.js):
 * the follow-up sends they logged in the span (sends carry the display name of who logged them), newest first,
 * plus what is waiting for the whole team: rows due a send now and rows with no company.
 */
export async function emailSummary(from, to, userId) {
  const start = dayRange(from).start;
  const end = dayRange(to).end;
  const user = await User.findById(userId).select('displayName username').lean();
  const names = [user?.displayName, user?.username].filter(Boolean);
  const mine = { by: { $in: names }, at: { $gte: start, $lt: end } };
  const [feed, due, noCompany] = await Promise.all([
    EmailEvaluation.aggregate([
      { $match: { sends: { $elemMatch: mine } } },
      { $unwind: '$sends' },
      { $match: { 'sends.by': mine.by, 'sends.at': mine.at } },
      { $sort: { 'sends.at': -1 } },
      { $project: { _id: 0, rowId: '$_id', clientName: 1, company: 1, tab: 1, n: '$sends.n', channel: '$sends.channel', date: '$sends.date', at: '$sends.at' } },
    ]),
    EmailEvaluation.countDocuments({ nextFollowUpAt: { $ne: null, $lte: todayUtc() } }),
    EmailEvaluation.countDocuments({ company: { $in: ['', null] } }),
  ]);
  const byChannel = {};
  for (const s of feed) byChannel[s.channel] = (byChannel[s.channel] || 0) + 1;
  return { sends: feed.length, rows: new Set(feed.map((s) => String(s.rowId))).size, byChannel, due, noCompany, feed: feed.slice(0, 200) };
}
