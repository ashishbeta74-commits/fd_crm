// Small in-memory rate limiter for the endpoints that are reachable without a session (login) or
// that do heavy work per call (spreadsheet previews). Per client IP, fixed window.
import { HttpError } from './errors.js';

const buckets = new Map(); // key -> { count, resetAt }

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref?.();

/**
 * @param {{ windowMs: number, max: number, name?: string }} opts
 * Express middleware: at most `max` requests per `windowMs` per IP; 429 beyond that.
 */
export function rateLimit({ windowMs, max, name = 'requests' }) {
  return (req, res, next) => {
    // The web app reaches the API through the Next.js proxy, so the real client is in X-Forwarded-For.
    const ip = (req.get('x-forwarded-for') || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));
    if (b.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return next(new HttpError(429, `Too many ${name} - try again in ${Math.ceil((b.resetAt - now) / 1000)} s`));
    }
    return next();
  };
}
