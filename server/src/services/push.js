import webPush from 'web-push';
import { Contact } from '../models/Contact.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { Reminder } from '../models/Reminder.js';
import { Setting } from '../models/User.js';
import { formatZoned } from '../config/timezone.js';
import { todayUtc, addDays } from '../lib/dates.js';
import { priorityLabel } from '../fields.js';

const log = (...a) => console.log(...a);
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const DIGEST_AT = process.env.PUSH_DIGEST_AT || '08:30'; // New York wall-clock, "" to disable
const TICK_MS = 60_000;

let keys = null;

/**
 * VAPID keys identify this server to the browsers' push services. Use VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY from the env when set; otherwise generate once and keep them in the settings
 * collection so subscriptions survive restarts.
 */
export async function loadVapid() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim() };
  } else {
    const saved = await Setting.findOne({ key: 'vapid' }).lean();
    if (saved?.value?.publicKey && saved?.value?.privateKey) keys = saved.value;
    else {
      keys = webPush.generateVAPIDKeys();
      await Setting.findOneAndUpdate({ key: 'vapid' }, { $set: { value: keys } }, { upsert: true });
      log('[push] generated VAPID keys (stored in settings)');
    }
  }
  const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.GMAIL_USER || 'crm@example.com'}`;
  webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return keys;
}

export const publicKey = async () => (await loadVapid()).publicKey;

/** Send one payload to a list of subscription rows; drops rows the push service no longer knows. */
export async function sendTo(subs, payload) {
  await loadVapid();
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const s of subs) {
    try {
      await webPush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60 * 6 });
      sent += 1;
      await PushSubscription.updateOne({ _id: s._id }, { $set: { lastUsedAt: new Date(), lastError: '' } });
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) await PushSubscription.deleteOne({ _id: s._id });
      else await PushSubscription.updateOne({ _id: s._id }, { $set: { lastError: `${code || ''} ${err?.message || err}`.trim() } });
    }
  }
  return sent;
}

export const sendToUser = async (userId, payload) => sendTo(await PushSubscription.find({ userId }).lean(), payload);
export const sendToAll = async (payload) => sendTo(await PushSubscription.find().lean(), payload);

const reminderPayload = (r, contact) => ({
  title: `${r.priority ? `[${priorityLabel(r.priority)}] ` : ''}${contact?.name || 'Reminder'}`,
  body: r.note || `Reminder for ${contact?.companyName || contact?.email || 'a contact'} · ${formatZoned(r.at)}`,
  url: `${APP_URL}/contacts/${r.contactId}`,
  tag: `reminder-${r._id}`,
});

/** Push every reminder that has come due and has not been pushed yet, to its creator (or everyone). */
export async function pushDueReminders() {
  const due = await Reminder.find({ done: false, at: { $lte: new Date() }, pushedAt: null }).sort({ at: 1 }).limit(50).lean();
  if (!due.length) return 0;
  const contacts = new Map((await Contact.find({ _id: { $in: due.map((r) => r.contactId) } }).select('name companyName email').lean()).map((c) => [String(c._id), c]));
  let total = 0;
  for (const r of due) {
    const payload = reminderPayload(r, contacts.get(String(r.contactId)));
    total += r.createdBy ? await sendToUser(r.createdBy, payload) : await sendToAll(payload);
    await Reminder.updateOne({ _id: r._id }, { $set: { pushedAt: new Date() } });
  }
  return total;
}

/** Once a day (New York): "3 follow-ups due today · 2 overdue · 1 reminder" to every subscribed browser. */
export async function pushDailyDigest() {
  if (!DIGEST_AT) return 0;
  const now = new Date();
  const [hh, mm] = DIGEST_AT.split(':').map(Number);
  if (now.getHours() < hh || (now.getHours() === hh && now.getMinutes() < mm)) return 0;
  const today = todayUtc();
  const stamp = today.toISOString().slice(0, 10);
  const last = await Setting.findOne({ key: 'push.lastDigest' }).lean();
  if (last?.value === stamp) return 0;
  await Setting.findOneAndUpdate({ key: 'push.lastDigest' }, { $set: { value: stamp } }, { upsert: true });
  const tomorrow = addDays(today, 1);
  const [dueToday, overdue, reminders] = await Promise.all([
    Contact.countDocuments({ followUp: { $gte: today, $lt: tomorrow } }),
    Contact.countDocuments({ followUp: { $lt: today } }),
    Reminder.countDocuments({ done: false, at: { $lt: tomorrow } }),
  ]);
  if (!dueToday && !overdue && !reminders) return 0;
  const parts = [`${dueToday} follow-up${dueToday === 1 ? '' : 's'} due today`];
  if (overdue) parts.push(`${overdue} overdue`);
  if (reminders) parts.push(`${reminders} reminder${reminders === 1 ? '' : 's'}`);
  return sendToAll({ title: 'Your day at Famous Drive', body: parts.join(' · '), url: `${APP_URL}/follow-ups`, tag: `digest-${stamp}` });
}

let timer = null;
/** Every minute: due reminders, then the daily digest. Safe to call once per process. */
export function startPush() {
  if (timer) return;
  const tick = async () => {
    try {
      const n = await pushDueReminders();
      if (n) log(`[push] ${n} reminder notification${n === 1 ? '' : 's'} sent`);
      const d = await pushDailyDigest();
      if (d) log(`[push] daily digest sent to ${d} browser${d === 1 ? '' : 's'}`);
    } catch (err) {
      log(`[push] ${err.message}`);
    }
  };
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
}
