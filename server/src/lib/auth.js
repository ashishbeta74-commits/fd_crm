// Authentication: scrypt password hashes, HMAC-signed bearer tokens, Express guards.
// Every /api route except /api/health and /api/auth/login needs `Authorization: Bearer <token>`.
// Scripts may use the static API_TOKEN from server/.env instead of logging in.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Setting, User } from '../models/User.js';
import { HttpError } from './errors.js';
import { bust, memo } from './cache.js';
import { runAsUser } from './context.js';

/** Forget the cached record of one user (or of everyone) so a password change / deactivation applies on the next request. */
export const bustUser = (id) => bust(id ? `user:${id}` : 'user:');

const TOKEN_DAYS = 30;
let secret = '';

/** Signing secret: SESSION_SECRET from .env, else one generated once and kept in the database. */
export async function loadSecret() {
  if (secret) return secret;
  const env = (process.env.SESSION_SECRET || '').trim();
  if (env) {
    secret = env;
    return secret;
  }
  const row = await Setting.findOneAndUpdate(
    { key: 'sessionSecret' },
    { $setOnInsert: { key: 'sessionSecret', value: randomBytes(32).toString('hex') } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  secret = row.value;
  return secret;
}

// ---------- passwords ----------
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const candidate = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// Readable, unambiguous characters (no 0/O, 1/l/I) in three blocks: "Xk7p-Qm2v-9Hs4"
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function generatePassword() {
  const pick = () => ALPHABET[randomBytes(1)[0] % ALPHABET.length];
  return [0, 1, 2].map(() => Array.from({ length: 4 }, pick).join('')).join('-');
}

// ---------- tokens ----------
const b64url = (s) => Buffer.from(s).toString('base64url');

export function signToken(user) {
  const payload = b64url(JSON.stringify({ sub: String(user._id), v: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0, exp: Date.now() + TOKEN_DAYS * 86400000 }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function parseToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const publicUser = (u) => ({ _id: u._id, username: u.username, displayName: u.displayName, userId: u.userId, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });

// ---------- guards ----------
const OPEN_PATHS = new Set(['/api/health', '/api/auth/login']);

/** Attaches req.user (or the static API token identity). 401 when missing / invalid. */
export async function requireAuth(req, res, next) {
  try {
    await loadSecret(); // cached after the first call; login needs it to sign tokens
    // mounted at /api, so req.path is relative ('/auth/login'); baseUrl restores the prefix
    if (OPEN_PATHS.has(`${req.baseUrl || ''}${req.path}`) || req.method === 'OPTIONS') return next();
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Please sign in');
    const apiToken = (process.env.API_TOKEN || '').trim();
    if (apiToken && token.length === apiToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(apiToken))) {
      req.user = { _id: null, username: 'api-token', displayName: 'API token', userId: 'API', role: 'admin', active: true };
      return next();
    }
    const data = parseToken(token);
    if (!data) throw new HttpError(401, 'Your session has expired - please sign in again');
    // One user lookup per 30 s per person, not per request: the database can be a continent away.
    // Password changes and deactivation clear the entry at once (bustUser in routes/auth.js).
    const user = await memo(`user:${data.sub}`, 30_000, () => User.findById(data.sub).lean());
    const version = user?.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
    if (!user || !user.active || version !== data.v) throw new HttpError(401, 'Your session is no longer valid - please sign in again');
    req.user = user;
    // Everything this request saves is stamped with the person (see lib/context.js, models/Contact.js).
    return runAsUser(user, next);
  } catch (err) {
    return next(err);
  }
}

/** Super admin only (email templates, user management). */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Only the super admin can do that'));
  return next();
}
