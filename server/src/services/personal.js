import mongoose from 'mongoose';
import { Contact } from '../models/Contact.js';
import { User } from '../models/User.js';
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

/** Counts per person: distinct contacts called / worked / moved into each stage, and entries per type. */
export async function peopleCounts(from, to, userId = null) {
  const start = dayRange(from).start;
  const end = dayRange(to).end;
  const rows = await Contact.aggregate([
    ...entriesPipeline(start, end, userId),
    { $group: { _id: { by: '$a.byId', type: '$a.type', toStage: '$a.toStage', channel: '$a.channel' }, count: { $sum: 1 }, contacts: { $addToSet: '$_id' } } },
  ]);
  const people = new Map();
  for (const r of rows) {
    const key = String(r._id.by);
    if (!people.has(key)) people.set(key, { ...emptyRow(), called: new Set(), workedSet: new Set(), moved: {} });
    const p = people.get(key);
    const { type, toStage, channel } = r._id;
    const ids = r.contacts.map(String);
    if (type === 'followup') p.followUps += r.count;
    if (type === 'email') p.emails += r.count;
    if (type === 'note') p.notes += r.count;
    if (type === 'edit') p.edits += r.count;
    if (type === 'booking') p.bookings += r.count;
    if (type === 'linkedin') p.linkedin += r.count;
    if (type === 'call' || (type === 'followup' && (channel === 'call' || !channel)) || (type === 'stage' && CALL_RESULTS.has(toStage))) ids.forEach((id) => p.called.add(id));
    if (WORK_TYPES.has(type)) ids.forEach((id) => p.workedSet.add(id));
    if (type === 'stage' && toStage) {
      p.stageMoves[toStage] = (p.stageMoves[toStage] || 0) + r.count;
      p.moved[toStage] = p.moved[toStage] || new Set();
      ids.forEach((id) => p.moved[toStage].add(id));
    }
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

/** The whole team (active accounts), each with their counts - zero rows included so nobody is missing. */
export async function teamBoard(from, to) {
  const [users, counts] = await Promise.all([User.find({}).select('displayName username userId role active').sort({ userId: 1 }).lean(), peopleCounts(from, to)]);
  return users
    .filter((u) => u.active || counts.has(String(u._id)))
    .map((u) => ({ id: String(u._id), name: u.displayName || u.username, userId: u.userId, ...(counts.get(String(u._id)) || emptyRow()) }));
}

export async function personSummary(from, to, userId) {
  const id = new mongoose.Types.ObjectId(String(userId));
  const [counts, feed] = await Promise.all([peopleCounts(from, to, id), personFeed(from, to, id)]);
  return { counts: counts.get(String(id)) || emptyRow(), feed };
}
