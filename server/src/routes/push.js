import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { publicKey, sendTo } from '../services/push.js';

export const pushRouter = Router();

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// The VAPID public key the browser needs to subscribe.
pushRouter.get('/key', async (req, res) => {
  res.json({ publicKey: await publicKey() });
});

const subscriptionInput = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

// Register this browser for the signed-in user (a browser can only ever belong to one user).
pushRouter.post('/subscribe', async (req, res) => {
  const sub = subscriptionInput.parse(req.body?.subscription || req.body);
  const row = await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    { $set: { userId: req.user?._id || null, keys: sub.keys, userAgent: String(req.get('user-agent') || '').slice(0, 300) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  res.status(201).json({ ok: true, id: row._id });
});

pushRouter.delete('/subscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().min(1) }).parse(req.body);
  await PushSubscription.deleteOne({ endpoint });
  res.json({ ok: true });
});

// Send a test notification to the caller's subscribed browsers.
pushRouter.post('/test', async (req, res) => {
  const subs = await PushSubscription.find({ userId: req.user?._id || null }).lean();
  if (!subs.length) throw new HttpError(400, 'This browser is not subscribed yet - switch notifications on first');
  const sent = await sendTo(subs, { title: 'Famous Drive CRM', body: 'Notifications are on. You will get reminders here even when the app is closed.', url: `${APP_URL}/`, tag: 'test' });
  res.json({ sent });
});

// How many browsers the caller has subscribed (for the settings UI).
pushRouter.get('/status', async (req, res) => {
  const count = await PushSubscription.countDocuments({ userId: req.user?._id || null });
  res.json({ subscriptions: count });
});
