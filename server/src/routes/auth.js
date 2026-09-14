import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { bustUser, generatePassword, hashPassword, publicUser, requireAdmin, signToken, verifyPassword } from '../lib/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { User } from '../models/User.js';

export const authRouter = Router();

const loginInput = z.object({ username: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) });
const passwordRule = z.string().min(8, 'Use at least 8 characters').max(200);

// Small brute-force brake: after 5 failures a username waits 30 s.
const failures = new Map();
const LOCK_MS = 30_000;

// Per-IP limit on top of the per-username lockout below, so a restart does not reset the brake entirely.
authRouter.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 30, name: 'sign-in attempts' }), async (req, res) => {
  const { username, password } = loginInput.parse(req.body);
  const key = username.toLowerCase();
  const f = failures.get(key);
  if (f && f.count >= 5 && Date.now() - f.at < LOCK_MS) throw new HttpError(429, 'Too many attempts - wait 30 seconds and try again');
  const user = await User.findOne({ username: key });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    failures.set(key, { count: (f?.count || 0) + 1, at: Date.now() });
    throw new HttpError(401, 'Wrong username or password');
  }
  failures.delete(key);
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Bearer tokens are stateless; the client forgets the token. Kept so the UI has something to call.
authRouter.post('/logout', (req, res) => {
  res.json({ ok: true });
});

authRouter.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1), newPassword: passwordRule }).parse(req.body);
  if (!req.user?._id) throw new HttpError(400, 'The API token cannot change a password');
  const user = await User.findById(req.user._id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(401, 'Current password is wrong');
  user.passwordHash = hashPassword(newPassword);
  user.passwordChangedAt = new Date(); // invalidates every other session of this user
  await user.save();
  bustUser(user._id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

// ---- super admin: the team list and password resets ----
authRouter.get('/users', requireAdmin, async (req, res) => {
  const items = await User.find().sort({ userId: 1 }).lean();
  res.json({ items: items.map(publicUser) });
});

authRouter.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  const password = generatePassword();
  user.passwordHash = hashPassword(password);
  user.passwordChangedAt = new Date();
  await user.save();
  bustUser(user._id);
  res.json({ user: publicUser(user), password });
});

authRouter.patch('/users/:id', requireAdmin, async (req, res) => {
  const body = z.object({ active: z.boolean().optional(), displayName: z.string().trim().min(1).max(80).optional() }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (body.active === false && String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot deactivate yourself');
  if (body.active !== undefined) user.active = body.active;
  if (body.displayName !== undefined) user.displayName = body.displayName;
  await user.save();
  bustUser(user._id);
  res.json({ user: publicUser(user) });
});
