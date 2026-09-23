// Live change feed: a MongoDB change stream over the collections the app shows.
//
// Every write reaches it - from this API, a sheet sync, a script, or another API instance on the same
// database - so it is the one signal that "the data changed". Two things hang off it:
//  - the cache (lib/cache.js) recomputes the dashboard / filter lists only after a change, instead of
//    rescanning the contacts on a timer;
//  - GET /api/events (routes/events.js) tells every open browser tab, which refetches what it shows
//    instead of polling every minute.
// Change streams need a replica set (Atlas always is). On a standalone mongod (the embedded dev
// database) the feed stays off and everything falls back to the timers, as before.
import { EventEmitter } from 'node:events';
import mongoose from 'mongoose';
import { markDirty, setLiveMode } from './cache.js';
import { events } from './events.js';

export const changes = new EventEmitter();
changes.setMaxListeners(0); // one listener per open browser tab

// Not `dailyreports`: computing today's report saves it (a fresh capturedAt every time), so watching it
// would make every recompute look like a change and trigger the next one. Reports derive from contacts
// and reminders, whose changes already mark them stale.
const WATCHED = ['contacts', 'reminders', 'importbatches', 'linkedsheets', 'emailtemplates', 'scripts', 'savedviews'];
// Collections whose writes change the dashboard / filter lists / reports (the cached data keys).
const DATA = new Set(['contacts', 'reminders', 'importbatches', 'linkedsheets']);
// Cache keys derived from those collections (see routes/stats.js, routes/meta.js).
const DATA_KEYS = ['stats', 'meta', 'daily:', 'history:', 'range:', 'stage-days:'];
// With the feed on, cached data only ages by the clock ("today", "overdue"), so it may live this long.
const LIVE_TTL_MS = 5 * 60 * 1000;
// Changes are collected this long and sent as one event (an import writes thousands of contacts).
const BATCH_MS = 400;
const RETRY_MS = 30_000;

let live = false;
let stream = null;
let pending = new Set();
let flushTimer = null;
let retryTimer = null;

export const isLive = () => live;

function setLive(on) {
  if (live === on) return;
  live = on;
  setLiveMode(on ? DATA_KEYS : [], on ? LIVE_TTL_MS : 0);
  changes.emit('live', on);
}

function flush() {
  flushTimer = null;
  const collections = [...pending];
  pending = new Set();
  if (collections.some((c) => DATA.has(c))) markDirty();
  changes.emit('change', collections);
}

function queue(collections) {
  for (const c of collections) pending.add(c);
  if (!flushTimer) {
    flushTimer = setTimeout(flush, BATCH_MS);
    flushTimer.unref?.();
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    open();
  }, RETRY_MS);
  retryTimer.unref?.();
}

function open() {
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) return scheduleRetry();
  try {
    stream = db.watch([{ $match: { 'ns.coll': { $in: WATCHED } } }, { $project: { ns: 1, operationType: 1 } }]);
  } catch (err) {
    console.warn(`[live] change feed unavailable: ${err.message}`);
    return scheduleRetry();
  }
  stream.on('change', (c) => queue([c.ns?.coll].filter(Boolean)));
  stream.on('error', (err) => {
    const s = stream;
    stream = null;
    s?.close().catch(() => {});
    setLive(false);
    // 40573: "The $changeStream stage is only supported on replica sets" - a standalone dev database.
    if (err?.code === 40573) {
      console.log('[live] the database is not a replica set: live updates are off, pages poll instead');
      return;
    }
    console.warn(`[live] change feed dropped (${err.message}); retrying in ${RETRY_MS / 1000} s`);
    scheduleRetry();
  });
  // Opening does not throw for a standalone server; the first getMore does. Call it live only once
  // the stream has been accepted by the server.
  stream.once('resumeTokenChanged', () => {
    if (!live) console.log('[live] change feed on: dashboards and lists update as soon as data changes');
    setLive(true);
    // anything written while the feed was down has been missed: treat everything as changed
    queue(WATCHED);
  });
}

/** Start watching (once per process). */
export function startChangeFeed() {
  if (stream || retryTimer) return;
  // A save through this API flags the cache at once, before its HTTP response goes out, so the
  // refetch that follows an edit never gets the pre-edit numbers (the feed's event comes ~0.5 s later).
  events.on('contact:saved', () => {
    if (live) markDirty();
  });
  open();
}
