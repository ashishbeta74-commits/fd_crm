// Tagging in notes: "@Haroon can you call him back?" tells Haroon, "@all" tells the whole team, and a reply
// to a note tells the person who wrote it (the asker). Each person gets a row in their "Tagged me" list
// (models/Mention.js) and a push notification on the browsers they switched notifications on in.
import mongoose from 'mongoose';
import { Mention } from '../models/Mention.js';
import { User } from '../models/User.js';
import { sendToUser } from './push.js';

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const snippet = (s) => (String(s || '').length > 140 ? `${String(s).slice(0, 137)}…` : String(s || ''));

/** The tagged ids that belong to active team members (anything else is dropped). */
export async function validMentions(ids = []) {
  const wanted = [...new Set(ids.map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!wanted.length) return [];
  const users = await User.find({ _id: { $in: wanted }, active: true }).select('_id').lean();
  return users.map((u) => u._id);
}

/**
 * Tell everyone a note concerns. `alreadyTold` = user ids an earlier version of the note already told
 * (an edit only tells the people it newly tags). `askerId` = the author of the note this one replies to.
 */
export async function notifyNote({ contact, activity, askerId = null, alreadyTold = [] }) {
  const author = activity.byId ? String(activity.byId) : '';
  const tagged = activity.mentionAll
    ? (await User.find({ active: true }).select('_id').lean()).map((u) => String(u._id))
    : (activity.mentions || []).map(String);
  const kinds = new Map(tagged.map((id) => [id, 'mention']));
  if (askerId) kinds.set(String(askerId), 'reply');
  kinds.delete(author);
  for (const id of alreadyTold.map(String)) kinds.delete(id);
  if (!kinds.size) return 0;

  const byName = activity.byName || 'Someone';
  const text = snippet(activity.message);
  await Mention.insertMany(
    [...kinds].map(([userId, kind]) => ({ userId, kind, all: Boolean(activity.mentionAll) && kind === 'mention', contactId: contact._id, activityId: activity._id, byId: activity.byId || null, byName, text })),
  );
  const who = contact.name || contact.companyName || 'a contact';
  for (const [userId, kind] of kinds) {
    const title = kind === 'reply' ? `${byName} replied to you` : activity.mentionAll ? `${byName} tagged everyone` : `${byName} tagged you`;
    // fire and forget: a slow push service must not hold up the note
    sendToUser(userId, { title, body: `${who}: ${text}`, url: `${APP_URL}/contacts/${contact._id}`, tag: `mention-${activity._id}-${userId}` }).catch((err) =>
      console.warn(`[mentions] push failed: ${err.message}`),
    );
  }
  return kinds.size;
}

/** A note (and its replies) went: their rows leave the "Tagged me" lists too. */
export const forgetNotes = (activityIds) => Mention.deleteMany({ activityId: { $in: activityIds } });
