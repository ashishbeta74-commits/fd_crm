// In-memory cache for the read endpoints the whole team polls (dashboard stats, meta, daily reports).
//
// Two things make it fast when the database is far away (see docs/DEPLOY.md):
//  - one computation serves every caller, and concurrent callers share the in-flight promise;
//  - stale-while-revalidate: once a value exists, it is returned immediately and refreshed in the
//    background, so nobody waits for the queries again - only the very first caller ever does.
// `warm()` keeps the hot keys refreshed on a timer so even that first caller is served from memory.
//
// With the live change feed running (lib/changes.js) the cache also knows WHEN the data changed:
// `markDirty()` flags the data keys, the next reader waits for a fresh value instead of getting the
// stale one, and the warmers recompute right away. Nothing is recomputed while nothing changes, so
// TTLs stretch to the live TTL (only the clock - "today", "overdue" - still ages a value then).

const entries = new Map();

// How long past its TTL a value may still be served while the refresh runs behind it.
const STALE_WINDOW_MS = 10 * 60 * 1000;

// Keys holding data derived from the collections (not per-user lookups). Set by setLiveMode().
let livePrefixes = [];
let liveTtl = 0;
const isLiveKey = (key) => livePrefixes.some((p) => key.startsWith(p));
const ttlFor = (key, ttlMs) => (liveTtl && isLiveKey(key) ? Math.max(ttlMs, liveTtl) : ttlMs);

/**
 * Turn event-driven freshness on (`prefixes` = the data keys, `ttlMs` = how long they may age while
 * nothing changes) or off (no arguments = plain TTLs).
 */
export function setLiveMode(prefixes = [], ttlMs = 0) {
  livePrefixes = prefixes;
  liveTtl = ttlMs;
}

function refresh(key, ttlMs, fn) {
  // A change that lands while this computation runs keeps the entry dirty, so it is recomputed again.
  const stamp = entries.get(key)?.dirty || 0;
  const pending = Promise.resolve()
    .then(fn)
    .then((value) => {
      const dirty = entries.get(key)?.dirty || 0;
      entries.set(key, { value, expires: Date.now() + ttlFor(key, ttlMs), at: Date.now(), dirty: dirty === stamp ? 0 : dirty });
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
 * A stale value is returned at once and refreshed in the background; a dirty one (the data changed)
 * is recomputed first.
 */
export async function memo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit?.dirty) return hit.pending || refresh(key, ttlMs, fn);
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
let dirtyTimer = null;
let dirtySeq = 0;

/** Keep `key` computed in the background so no request ever pays for it. */
export function warm(key, ttlMs, fn) {
  warmers.push({ key, ttlMs, fn });
}

/** Recompute the warmed keys that are dirty, missing or past their TTL. */
async function refreshWarm() {
  for (const w of warmers) {
    const e = entries.get(w.key);
    if (e?.pending) continue;
    if (e?.value !== undefined && !e.dirty && e.expires > Date.now()) continue;
    try {
      await refresh(w.key, w.ttlMs, w.fn);
    } catch {
      // the database may still be connecting; the next tick tries again
    }
  }
}

/** The data changed: every live key is recomputed before it is served again, warmed keys right away. */
export function markDirty() {
  dirtySeq += 1;
  for (const [k, e] of entries) if (isLiveKey(k)) entries.set(k, { ...e, dirty: dirtySeq });
  // a burst of writes (an import, a bulk edit) triggers one recompute, not one per write
  if (!dirtyTimer) {
    dirtyTimer = setTimeout(() => {
      dirtyTimer = null;
      refreshWarm().catch(() => {});
    }, 500);
    dirtyTimer.unref?.();
  }
}

/** Refresh the warmed keys now and then check them every `everyMs`. Safe to call once per process. */
export function startCacheWarming(everyMs = 30_000) {
  if (timer || !warmers.length) return;
  timer = setInterval(refreshWarm, everyMs);
  timer.unref?.();
  setTimeout(refreshWarm, 3000).unref?.();
}
