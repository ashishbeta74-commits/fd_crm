'use client';

// Live updates: one Server-Sent Events stream per tab (GET /api/events). The API watches the database
// and says which collections changed; the tab refetches only the queries on screen that show them.
// While the stream is up, pages poll rarely (livePoll) - teammates' edits arrive within a second
// instead of within a minute. When it is down (API restarting, a database without a change feed),
// they poll every LIVE_MS as before.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE, LIVE_MS } from '@/lib/api';

// Poll interval while live: a backstop only (the clock still moves "today" / "overdue").
const LIVE_BACKSTOP_MS = 5 * 60_000;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
// Events are merged this long so a burst (an import, a bulk edit) causes one refetch.
const BATCH_MS = 300;

let live = false;

/** refetchInterval for pages that show shared data: rare while live, LIVE_MS otherwise. */
export const livePoll = () => (live ? LIVE_BACKSTOP_MS : LIVE_MS);
export const isLive = () => live;

// Which query keys show data from each collection. Only queries on screen refetch (the rest are just
// marked stale and refresh when next shown).
const KEYS_BY_COLLECTION = {
  contacts: [['contacts'], ['contact'], ['stats'], ['followups'], ['linkedin'], ['meta'], ['duplicates']],
  reminders: [['reminders'], ['contact'], ['stats'], ['followups']],
  importbatches: [['imports'], ['stats'], ['meta']],
  linkedsheets: [['imports'], ['meta']],
  dailyreports: [['stats']],
  emailtemplates: [['templates']],
  scripts: [['scripts']],
  savedviews: [['views']],
};

function refetchFor(qc, collections) {
  const seen = new Set();
  for (const c of collections) {
    for (const key of KEYS_BY_COLLECTION[c] || []) {
      const id = key.join('/');
      if (seen.has(id)) continue;
      seen.add(id);
      // cancelRefetch: false - a query already fetching (e.g. after our own edit) is not started twice
      qc.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
    }
  }
}

/** Parse one SSE block ("event: x\ndata: {...}") into { event, data }. */
function parseBlock(block) {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

/** Keep the stream open while signed in (`token`), reconnecting with back-off. */
export function useLiveUpdates(token) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    let controller = null;
    let retryTimer = null;
    let batchTimer = null;
    let pending = new Set();
    let delay = RETRY_MIN_MS;
    let connectedOnce = false;

    const setLive = (on) => {
      live = on;
    };
    const flush = () => {
      batchTimer = null;
      const collections = [...pending];
      pending = new Set();
      refetchFor(qc, collections);
    };
    const onEvent = ({ event, data }) => {
      if (event === 'hello' || event === 'live') {
        setLive(Boolean(data.live));
        return;
      }
      if (event === 'change') {
        for (const c of data.collections || []) pending.add(c);
        if (!batchTimer) batchTimer = setTimeout(flush, BATCH_MS);
      }
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        const res = await fetch(`${API_BASE}/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        });
        // signed out / old API without the endpoint: stay on polling, do not hammer it
        if (res.status === 401 || res.status === 404) return;
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
        // Missed events while disconnected: refresh whatever is on screen once.
        if (connectedOnce) qc.invalidateQueries();
        connectedOnce = true;
        delay = RETRY_MIN_MS;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value.replace(/\r\n/g, '\n');
          let at;
          while ((at = buffer.indexOf('\n\n')) >= 0) {
            const msg = parseBlock(buffer.slice(0, at));
            buffer = buffer.slice(at + 2);
            if (msg) onEvent(msg);
          }
        }
      } catch {
        // network drop / abort: handled below
      }
      setLive(false);
      if (stopped) return;
      retryTimer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    };

    connect();
    return () => {
      stopped = true;
      setLive(false);
      controller?.abort();
      clearTimeout(retryTimer);
      clearTimeout(batchTimer);
    };
  }, [token, qc]);
}
