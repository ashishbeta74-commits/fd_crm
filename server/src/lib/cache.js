// Tiny in-memory memo for read endpoints the whole team polls (dashboard stats, meta, daily reports).
// One computation serves every caller for `ttlMs`, and concurrent callers share the in-flight promise,
// so ten open dashboards cost one set of queries instead of ten. Writes call `bust()` where freshness matters.

const entries = new Map();

/** Return the cached value for `key`, or compute it with `fn` and keep it for `ttlMs`. */
export async function memo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = Promise.resolve()
    .then(fn)
    .then((value) => {
      entries.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      entries.delete(key);
      throw err;
    });
  entries.set(key, { pending, expires: 0, value: hit?.value });
  return pending;
}

/** Drop cached entries whose key starts with `prefix` (all of them when omitted). */
export function bust(prefix = '') {
  for (const k of entries.keys()) if (k.startsWith(prefix)) entries.delete(k);
}
