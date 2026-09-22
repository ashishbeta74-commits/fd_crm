// One-off data migrations, run once at start-up (each one is idempotent and cheap when there is nothing to do).
import mongoose from 'mongoose';
import { Contact } from '../models/Contact.js';
import { guessCategory, stageLabel } from '../fields.js';
import { matchStage } from './status.js';
import { knownCityRegion, splitLocation } from './geo.js';

/**
 * Call outcomes (voicemail / connected / wrong number) became pipeline stages. Contacts that were still
 * New / Started take the stage their last outcome stands for; the old field (and its index) is dropped.
 * "No need" has no stage of its own: those contacts stay where they are.
 */
async function callOutcomesToStages() {
  const col = mongoose.connection.collection('contacts');
  const pending = await col.countDocuments({ callOutcome: { $exists: true } });
  if (!pending) return;
  let moved = 0;
  for (const key of ['connected', 'voicemail', 'wrong_number']) {
    const r = await col.updateMany({ callOutcome: key, stage: { $in: ['new', 'started'] } }, { $set: { stage: key } });
    moved += r.modifiedCount;
  }
  await col.updateMany({ callOutcome: { $exists: true } }, { $unset: { callOutcome: '' } });
  await col.updateMany({ 'activities.outcome': { $exists: true } }, { $unset: { 'activities.$[].outcome': '' } });
  try {
    await col.dropIndex('callOutcome_1');
  } catch {
    // index already gone
  }
  console.log(`[migrate] call outcomes -> stages: ${moved} contact(s) moved, ${pending} cleaned`);
}

/**
 * Follow-up counter + "booked on": contacts created before these fields existed get the counter from the
 * follow-up rounds their sheet import recorded ("Follow-up 1: …" call entries) and the booking timestamp
 * from the last booking change in their history (else their creation date).
 */
async function followUpCountsAndBookedAt() {
  const col = mongoose.connection.collection('contacts');
  const pending = await col.countDocuments({ followUpCount: { $exists: false } });
  if (!pending) return;
  const cursor = col.find({ followUpCount: { $exists: false } }).project({ activities: 1, booking: 1, createdAt: 1 });
  let n = 0;
  for await (const c of cursor) {
    const acts = c.activities || [];
    const followUpCount = acts.filter((a) => a.type === 'call' && /^follow-?up \d+\s*:/i.test(a.message || '')).length;
    const set = { followUpCount };
    if (c.booking?.date && !c.booking.bookedAt) {
      const last = acts.filter((a) => a.type === 'booking' && a.at).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
      set['booking.bookedAt'] = last ? new Date(last.at) : c.createdAt || new Date();
    }
    await col.updateOne({ _id: c._id }, { $set: set });
    n += 1;
  }
  console.log(`[migrate] follow-up counts / booked-on filled in for ${n} contact(s)`);
}

/**
 * Contact type (travel advisor / executive assistant): contacts from before the field existed get a
 * guess from their list name and job title. Only contacts with no `category` at all are touched, so
 * anything set by hand (including a deliberate blank) is left alone.
 */
async function contactCategories() {
  const col = mongoose.connection.collection('contacts');
  const pending = await col.countDocuments({ category: { $exists: false } });
  if (!pending) return;
  const cursor = col.find({ category: { $exists: false } }).project({ title: 1, 'source.sheetName': 1 });
  const counts = {};
  let ops = [];
  const flush = async () => {
    if (ops.length) await col.bulkWrite(ops, { ordered: false });
    ops = [];
  };
  for await (const c of cursor) {
    const category = guessCategory({ sheetName: c.source?.sheetName, title: c.title });
    counts[category || '(unknown)'] = (counts[category || '(unknown)'] || 0) + 1;
    ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: { category } } } });
    if (ops.length >= 500) await flush();
  }
  await flush();
  console.log(`[migrate] contact types guessed for ${pending} contact(s): ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

/**
 * City / state / country: contacts from before these fields existed get them split out of their
 * free-text location ("Albany, New York" -> Albany / New York / United States). Only contacts with no
 * `city` field at all are touched.
 */
async function contactGeo() {
  const col = mongoose.connection.collection('contacts');
  const pending = await col.countDocuments({ city: { $exists: false } });
  if (!pending) return;
  const cursor = col.find({ city: { $exists: false } }).project({ location: 1 });
  let ops = [];
  let withCity = 0;
  let withCountry = 0;
  const flush = async () => {
    if (ops.length) await col.bulkWrite(ops, { ordered: false });
    ops = [];
  };
  for await (const c of cursor) {
    const geo = splitLocation(c.location);
    if (geo.city) withCity += 1;
    if (geo.country) withCountry += 1;
    ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: geo } } });
    if (ops.length >= 500) await flush();
  }
  await flush();
  console.log(`[migrate] city / state / country split out of location for ${pending} contact(s): ${withCity} with a city, ${withCountry} with a country`);
}

/**
 * Contacts whose sheet gave only a city get the state and country filled in: from the list of
 * well-known US cities first, else from other contacts that carry the same city WITH a state (when
 * they all agree). Cheap when there is nothing left to do, so it runs on every start.
 */
async function inferPlaces() {
  const col = mongoose.connection.collection('contacts');
  const candidates = await col.find({ city: { $nin: ['', null] }, state: { $in: ['', null] }, placeGuessed: { $ne: true } }).project({ city: 1 }).toArray();
  if (!candidates.length) return;
  // city -> the single state / country seen on other contacts (ambiguous cities are skipped)
  const seen = await col
    .aggregate([{ $match: { city: { $nin: ['', null] }, state: { $nin: ['', null] } } }, { $group: { _id: { city: { $toLower: '$city' }, state: '$state', country: '$country' }, n: { $sum: 1 } } }])
    .toArray();
  const byCity = new Map();
  for (const r of seen) {
    const list = byCity.get(r._id.city) || [];
    list.push({ state: r._id.state, country: r._id.country, n: r.n });
    byCity.set(r._id.city, list);
  }
  let ops = [];
  let filled = 0;
  for (const c of candidates) {
    const key = String(c.city).toLowerCase();
    let guess = knownCityRegion(c.city);
    if (!guess) {
      const list = byCity.get(key);
      if (list && list.length === 1) guess = { state: list[0].state, country: list[0].country };
    }
    const set = guess ? { ...guess, placeGuessed: true } : { placeGuessed: true };
    if (guess) filled += 1;
    ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: set } } });
    if (ops.length >= 500) {
      await col.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }
  if (ops.length) await col.bulkWrite(ops, { ordered: false });
  console.log(`[migrate] state / country inferred from the city for ${filled} of ${candidates.length} contact(s)`);
}

/**
 * "Hung Up" and "Not Interested" became stages on 2026-09-15. Before that, sheet statuses such as
 * "hung up", "dont need", "declined" or "DNC" landed the contact in Started; contacts still there whose
 * status text says so move to the new stage. Runs each start, finds nothing after the first time.
 */
async function hungUpAndNotInterested() {
  const col = mongoose.connection.collection('contacts');
  const cursor = col.find({ stage: 'started', status: { $nin: ['', null] } }).project({ status: 1, stage: 1 });
  let ops = [];
  const moved = { hung_up: 0, not_interested: 0 };
  for await (const c of cursor) {
    const stage = matchStage(c.status);
    if (stage !== 'hung_up' && stage !== 'not_interested') continue;
    moved[stage] += 1;
    ops.push({
      updateOne: {
        filter: { _id: c._id, stage: 'started' },
        update: {
          $set: { stage },
          $push: { activities: { type: 'stage', source: 'import', fromStage: 'started', toStage: stage, message: `Moved from Started to ${stageLabel(stage)} (status "${c.status}") (import)`, at: new Date() } },
        },
      },
    });
    if (ops.length >= 500) {
      await col.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }
  if (ops.length) await col.bulkWrite(ops, { ordered: false });
  if (moved.hung_up || moved.not_interested) console.log(`[migrate] Started -> Hung Up: ${moved.hung_up}, Started -> Not Interested: ${moved.not_interested}`);
}

// The newest "moved to <current stage>" history entry of a contact (null when there is none).
const NEWEST_STAGE_ENTRY = {
  $max: {
    $map: {
      input: {
        $filter: {
          input: { $ifNull: ['$activities', []] },
          as: 'a',
          cond: { $and: [{ $eq: ['$$a.type', 'stage'] }, { $eq: ['$$a.toStage', '$stage'] }] },
        },
      },
      as: 'a',
      in: '$$a.at',
    },
  },
};

/**
 * stageChangedAt (when a contact entered its current stage) for contacts created before the field existed:
 * the newest "moved to <current stage>" history entry, else the contact's creation date.
 */
async function stageChangedAt() {
  const col = mongoose.connection.collection('contacts');
  const pending = await col.countDocuments({ stageChangedAt: { $exists: false } });
  if (pending) {
    await col.updateMany({ stageChangedAt: { $exists: false } }, [{ $set: { stageChangedAt: { $ifNull: [NEWEST_STAGE_ENTRY, '$createdAt'] } } }]);
    console.log(`[migrate] stageChangedAt: backfilled ${pending} contact(s)`);
  }
  await repairStageChangedAt();
}

/**
 * A stage change saved by a process without this field's save hook (an API still on older code, a bulk
 * update) leaves stageChangedAt behind its own history. Bring it up to the newest matching history entry.
 * Idempotent and cheap; runs at start-up and after every sheet sync cycle.
 */
export async function repairStageChangedAt() {
  if (mongoose.connection.readyState !== 1) return 0;
  const col = mongoose.connection.collection('contacts');
  const r = await col.updateMany({ $expr: { $lt: ['$stageChangedAt', NEWEST_STAGE_ENTRY] } }, [{ $set: { stageChangedAt: NEWEST_STAGE_ENTRY } }]);
  if (r.modifiedCount) console.log(`[migrate] stageChangedAt: repaired ${r.modifiedCount} contact(s) whose stage was changed without the date`);
  return r.modifiedCount;
}

export async function runMigrations() {
  if (mongoose.connection.readyState !== 1) return;
  await callOutcomesToStages();
  await followUpCountsAndBookedAt();
  await contactCategories();
  await contactGeo();
  await inferPlaces();
  await hungUpAndNotInterested();
  await stageChangedAt();
}

// Keep the model import so the collection exists / indexes are registered before the first query.
void Contact;
