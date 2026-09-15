// In-memory cache for the read endpoints the whole team polls (dashboard stats, meta, daily reports).
//
// Two things make it fast when the database is far away (see docs/DEPLOY.md):
//  - one computation serves every caller, and concurrent callers share the in-flight promise;
//  - stale-while-revalidate: once a value exists, it is returned immediately and refreshed in the
//    background, so nobody waits for the queries again - only the very first caller ever does.
// `warm()` keeps the hot keys refreshed on a timer so even that first caller is served from memory.

const entries = new Map();

// How long past its TTL a value may still be served while the refresh runs behind it.
const STALE_WINDOW_MS = 10 * 60 * 1000;

function refresh(key, ttlMs, fn) {
  const pending = Promise.resolve()
    .then(fn)
    .then((value) => {
      entries.set(key, { value, expires: Date.now() + ttlMs, at: Date.now() });
      return value;
    })
    .catch((err) => {
      // Keep any previous value: serving slightly stale data beats failing the request.
      const prev = entries.get(key);
      if (prev?.value === undefined) entries.delete(key);
      else entries.set(key, { ...prev, pending: null });
      throw err;
    });
  const prev = entries.get(key);
  entries.set(key, { ...prev, pending });
  return pending;
}

/**
 * The cached value for `key`, computed with `fn` and kept for `ttlMs`.
 * A stale value is returned at once and refreshed in the background.
 */
export async function memo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit?.value !== undefined) {
    if (hit.expires > now) return hit.value;
    // stale: hand back what we have and refresh behind it (swallow the error, the value stays)
    if (!hit.pending && now - hit.at < STALE_WINDOW_MS) refresh(key, ttlMs, fn).catch(() => {});
    if (now - hit.at < STALE_WINDOW_MS) return hit.value;
  }
  if (hit?.pending) return hit.pending;
  return refresh(key, ttlMs, fn);
}

/** Drop cached entries whose key starts with `prefix` (all of them when omitted). */
export function bust(prefix = '') {
  for (const k of entries.keys()) if (k.startsWith(prefix)) entries.delete(k);
}

// ---- background warming ----
const warmers = [];
let timer = null;

/** Keep `key` computed in the background so no request ever pays for it. */
export function warm(key, ttlMs, fn) {
  warmers.push({ key, ttlMs, fn });
}

/** Refresh every warmed key now and then every `everyMs`. Safe to call once per process. */
export function startCacheWarming(everyMs = 30_000) {
  if (timer || !warmers.length) return;
  const tick = async () => {
    for (const w of warmers) {
      try {
        await refresh(w.key, w.ttlMs, w.fn);
      } catch {
        // the database may still be connecting; the next tick tries again
      }
    }
  };
  timer = setInterval(tick, everyMs);
  timer.unref?.();
  setTimeout(tick, 3000).unref?.();
}
