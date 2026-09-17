import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { normalizeHeader } from '../lib/mapping.js';
import { MULTI_FIELDS, TEXT_FIELDS, priorityRank } from '../fields.js';
import { Contact, normalizeTags } from '../models/Contact.js';
import { Reminder } from '../models/Reminder.js';
import { DuplicateIgnore, MergeLog } from '../models/MergeLog.js';

export const duplicatesRouter = Router();

// Criteria, most reliable first. `name` alone is off by default (too many false positives).
export const CRITERIA = ['email', 'phone', 'name_company', 'name'];
const CONFIDENCE = { email: 4, phone: 3, name_company: 2, name: 1 };
const MAX_SCAN = 50000;

const pairKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);
/** Digits only, without a leading US country code: "+1 (212) 555-0100" and "212-555-0100" compare equal. */
export function phoneKey(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length >= 7 ? d.slice(-10) : '';
}

const summaryProject = {
  name: 1,
  email: 1,
  primaryEmail: 1,
  secondaryEmail: 1,
  title: 1,
  companyName: 1,
  contactMain: 1,
  companyNo: 1,
  location: 1,
  stage: 1,
  priority: 1,
  tags: 1,
  followUp: 1,
  notes: 1,
  lastContactedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  'source.sheetName': 1,
  'source.tabName': 1,
  'source.row': 1,
  activityCount: { $size: { $ifNull: ['$activities', []] } },
};

/** Keys a contact is grouped by, per criterion. */
function keysFor(c) {
  const out = { email: [], phone: [], name_company: [], name: [] };
  for (const k of ['email', 'primaryEmail', 'secondaryEmail']) {
    const e = String(c[k] || '').trim().toLowerCase();
    if (e.includes('@')) out.email.push(e);
  }
  const p = phoneKey(c.contactMain);
  if (p) out.phone.push(p);
  const n = normalizeHeader(c.name || '');
  const co = normalizeHeader(c.companyName || '');
  if (n && co) out.name_company.push(`${n}|${co}`);
  if (n && n.includes(' ')) out.name.push(n);
  return out;
}

/** Which contact of a group should survive a merge: most history, then oldest. */
export function suggestPrimary(members) {
  return [...members].sort((a, b) => (b.activityCount || 0) - (a.activityCount || 0) || new Date(a.createdAt) - new Date(b.createdAt))[0];
}

const findQuery = z.object({
  by: z.string().default('email,phone,name_company'),
  sheet: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  page: z.coerce.number().int().min(1).default(1),
});

/**
 * GET /duplicates?by=email,phone,name_company[,name]&sheet=&limit=
 * Groups of contacts that look like the same person. Contacts are linked when any enabled criterion
 * matches (union-find), pairs marked "not duplicates" never link.
 */
duplicatesRouter.get('/', async (req, res) => {
  const q = findQuery.parse(req.query);
  const criteria = q.by.split(',').map((s) => s.trim()).filter((s) => CRITERIA.includes(s));
  if (!criteria.length) throw new HttpError(400, `by must be one or more of ${CRITERIA.join(', ')}`);
  const match = {};
  if (q.sheet) match['source.sheetName'] = q.sheet;
  // Two passes: match on the six fields the criteria actually use (small documents, so the whole
  // collection crosses the wire cheaply), then read the full details only for the contacts that
  // turned out to be in a group. Pulling all ~20 fields - `notes` among them - for every contact
  // measured 17 s against the live API.
  const [contacts, ignoredRows] = await Promise.all([
    Contact.aggregate([{ $match: match }, { $project: { name: 1, companyName: 1, email: 1, primaryEmail: 1, secondaryEmail: 1, contactMain: 1 } }, { $limit: MAX_SCAN }]),
    DuplicateIgnore.find().select('pair').lean(),
  ]);
  const ignored = new Set(ignoredRows.map((x) => x.pair));

  const parent = contacts.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const reasons = new Map(); // root -> Set(criterion)
  const union = (a, b, why) => {
    if (ignored.has(pairKey(contacts[a]._id, contacts[b]._id))) return;
    const ra = find(a);
    const rb = find(b);
    const merged = new Set([...(reasons.get(ra) || []), ...(reasons.get(rb) || []), why]);
    if (ra !== rb) parent[rb] = ra;
    reasons.set(find(a), merged);
  };
  const keys = contacts.map(keysFor);
  const nameTokens = contacts.map((c) => new Set(normalizeHeader(c.name || '').split(' ').filter((t) => t.length > 1)));
  // A phone shared by colleagues is usually the company switchboard: it only counts as a duplicate
  // when the names share a word too (or one of them has no name at all).
  const namesAgree = (a, b) => !nameTokens[a].size || !nameTokens[b].size || [...nameTokens[a]].some((t) => nameTokens[b].has(t));
  for (const why of criteria) {
    const seen = new Map(); // key -> [indices]
    keys.forEach((k, i) => {
      for (const key of k[why]) {
        const list = seen.get(key);
        if (!list) {
          seen.set(key, [i]);
          continue;
        }
        if (why === 'phone') {
          for (const j of list) if (namesAgree(i, j)) union(i, j, why);
        } else union(i, list[0], why);
        list.push(i);
      }
    });
  }

  const groups = new Map();
  contacts.forEach((c, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  });
  // Second pass: the full summary for the contacts that are actually in a group.
  const memberIds = [];
  for (const members of groups.values()) if (members.length > 1) for (const m of members) memberIds.push(m._id);
  const detailed = memberIds.length ? await Contact.aggregate([{ $match: { _id: { $in: memberIds } } }, { $project: summaryProject }]) : [];
  const byId = new Map(detailed.map((c) => [String(c._id), c]));

  let items = [];
  for (const [root, light] of groups) {
    if (light.length < 2) continue;
    const members = light.map((m) => byId.get(String(m._id))).filter(Boolean);
    if (members.length < 2) continue;
    const why = [...(reasons.get(root) || [])].sort((a, b) => CONFIDENCE[b] - CONFIDENCE[a]);
    items.push({ key: String(members[0]._id), reasons: why, confidence: CONFIDENCE[why[0]] || 0, suggestedPrimaryId: suggestPrimary(members)._id, contacts: members });
  }
  if (q.q) {
    const needle = q.q.toLowerCase();
    items = items.filter((g) => g.contacts.some((c) => ['name', 'email', 'primaryEmail', 'companyName', 'contactMain'].some((f) => String(c[f] || '').toLowerCase().includes(needle))));
  }
  items.sort((a, b) => b.confidence - a.confidence || b.contacts.length - a.contacts.length || String(a.contacts[0].name).localeCompare(String(b.contacts[0].name)));
  const total = items.length;
  const contactsInGroups = items.reduce((n, g) => n + g.contacts.length, 0);
  const start = (q.page - 1) * q.limit;
  res.json({ items: items.slice(start, start + q.limit), total, contactsInGroups, scanned: contacts.length, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)), criteria });
});

// ---------- merge ----------
const STAGE_RANK = { new: 0, started: 1, voicemail: 1, wrong_number: 1, hung_up: 1, not_interested: 1, connected: 2, prospect: 3, ready: 4, future_booking: 4, converted: 5, done: 6 };
const joinText = (a, b, sep) => (a && b ? `${a}${sep}${b}` : a || b || '');

/** Fold `other` into `primary` (mongoose docs). Primary values win; gaps are filled from `other`. */
export function foldContact(primary, other) {
  for (const k of TEXT_FIELDS) {
    if (!other[k]) continue;
    if (MULTI_FIELDS[k] && k !== 'location') {
      if (!(primary[k] || '').includes(other[k])) primary[k] = joinText(primary[k], other[k], MULTI_FIELDS[k]);
    } else if (!primary[k]) primary[k] = other[k];
  }
  if (!primary.followUp && other.followUp) {
    primary.followUp = other.followUp;
    if (!primary.followUpNote) primary.followUpNote = other.followUpNote || '';
  }
  if (!primary.booking?.date && other.booking?.date) primary.booking = { date: other.booking.date, time: other.booking.time || '', note: other.booking.note || '', bookedAt: other.booking.bookedAt || null };
  primary.followUpCount = Math.max(primary.followUpCount || 0, other.followUpCount || 0);
  if ((STAGE_RANK[other.stage] || 0) > (STAGE_RANK[primary.stage] || 0) && primary.stage === 'new') primary.stage = other.stage;
  if (priorityRank(other.priority) > priorityRank(primary.priority)) primary.priority = other.priority;
  primary.tags = normalizeTags([...(primary.tags || []), ...(other.tags || [])]);
  primary.extra = { ...(other.extra || {}), ...(primary.extra || {}) };
  primary.markModified('extra');
  if (other.lastContactedAt && (!primary.lastContactedAt || other.lastContactedAt > primary.lastContactedAt)) primary.lastContactedAt = other.lastContactedAt;
  for (const id of other.importBatchIds || []) primary.importBatchIds.addToSet(id);
  if (!primary.source?.fileName && other.source?.fileName) primary.source = { ...other.source };
  for (const a of other.activities || []) primary.activities.push({ type: a.type, message: a.message, fromStage: a.fromStage ?? null, toStage: a.toStage ?? null, at: a.at });
}

const mergeInput = z.object({
  primaryId: z.string().min(1),
  mergeIds: z.array(z.string().min(1)).min(1).max(50),
});

const describe = (c) => c.name || c.email || c.primaryEmail || `contact ${c._id}`;

duplicatesRouter.post('/merge', async (req, res) => {
  const body = mergeInput.parse(req.body);
  const mergeIds = [...new Set(body.mergeIds.filter((id) => id !== body.primaryId))];
  if (!mergeIds.length) throw new HttpError(400, 'Choose at least one other contact to merge into the primary');
  const primary = await Contact.findById(body.primaryId);
  if (!primary) throw new HttpError(404, 'Primary contact not found');
  const others = await Contact.find({ _id: { $in: mergeIds } });
  if (others.length !== mergeIds.length) throw new HttpError(404, 'One of the contacts to merge no longer exists');

  const primaryBefore = primary.toObject();
  for (const o of others) foldContact(primary, o);
  primary.activities.push({ type: 'merge', message: `Merged with ${others.map(describe).join(', ')}` });
  primary.activities.sort((a, b) => new Date(a.at) - new Date(b.at));

  const moved = await Reminder.find({ contactId: { $in: mergeIds } }).select('_id contactId').lean();
  const log = await MergeLog.create({
    primaryId: primary._id,
    primaryBefore,
    merged: others.map((o) => o.toObject()),
    movedReminders: moved.map((r) => ({ reminderId: r._id, contactId: r.contactId })),
    summary: `${describe(primary)} <- ${others.map(describe).join(', ')}`,
  });
  await primary.save();
  await Reminder.updateMany({ contactId: { $in: mergeIds } }, { $set: { contactId: primary._id } });
  await Contact.deleteMany({ _id: { $in: mergeIds } });
  res.json({ contact: primary, mergeId: log._id, merged: others.length });
});

duplicatesRouter.get('/merges', async (req, res) => {
  const items = await MergeLog.find().sort({ createdAt: -1 }).limit(30).select('primaryId summary merged createdAt undoneAt').lean();
  res.json({ items: items.map((m) => ({ _id: m._id, primaryId: m.primaryId, summary: m.summary, mergedCount: m.merged?.length || 0, createdAt: m.createdAt, undoneAt: m.undoneAt })) });
});

// Put the merged contacts back and restore the primary as it was.
duplicatesRouter.post('/merges/:id/undo', async (req, res) => {
  const log = await MergeLog.findById(req.params.id);
  if (!log) throw new HttpError(404, 'Merge not found');
  if (log.undoneAt) throw new HttpError(409, 'This merge was already undone');
  await Contact.replaceOne({ _id: log.primaryId }, log.primaryBefore, { upsert: true });
  const existing = new Set((await Contact.find({ _id: { $in: log.merged.map((m) => m._id) } }).select('_id').lean()).map((c) => String(c._id)));
  const toInsert = log.merged.filter((m) => !existing.has(String(m._id)));
  if (toInsert.length) await Contact.insertMany(toInsert, { ordered: false });
  for (const m of log.movedReminders) await Reminder.updateOne({ _id: m.reminderId }, { $set: { contactId: m.contactId } });
  log.undoneAt = new Date();
  await log.save();
  res.json({ restored: toInsert.length, primaryId: log.primaryId });
});

// ---------- "not duplicates" ----------
const idsInput = z.object({ ids: z.array(z.string().min(1)).min(2).max(50) });

duplicatesRouter.post('/ignore', async (req, res) => {
  const { ids } = idsInput.parse(req.body);
  const ops = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const pair = pairKey(ids[i], ids[j]);
      ops.push({ updateOne: { filter: { pair }, update: { $setOnInsert: { pair, ids: [ids[i], ids[j]].map((x) => new mongoose.Types.ObjectId(x)) } }, upsert: true } });
    }
  }
  const r = await DuplicateIgnore.bulkWrite(ops);
  res.json({ pairs: ops.length, added: r.upsertedCount });
});

duplicatesRouter.delete('/ignore', async (req, res) => {
  const { ids } = idsInput.parse(req.body);
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) pairs.push(pairKey(ids[i], ids[j]));
  const r = await DuplicateIgnore.deleteMany({ pair: { $in: pairs } });
  res.json({ removed: r.deletedCount });
});

duplicatesRouter.get('/ignore', async (req, res) => {
  const items = await DuplicateIgnore.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json({ items, total: await DuplicateIgnore.countDocuments() });
});
