// GET /api/events - Server-Sent Events: tells an open tab which collections just changed, so it
// refetches what it shows (see client/src/lib/live.js) instead of polling. Behind requireAuth like
// every other route; the browser reads it with fetch() so the token travels in the header.
import { Router } from 'express';
import { changes, isLive } from '../lib/changes.js';

export const eventsRouter = Router();

// Proxies (Render, Cloudflare) close a connection that is silent for ~100 s.
const HEARTBEAT_MS = 25_000;

eventsRouter.get('/', (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform keeps compression() from buffering the stream
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('hello', { live: isLive() });

  const onChange = (collections) => send('change', { collections });
  const onLive = (live) => send('live', { live });
  changes.on('change', onChange);
  changes.on('live', onLive);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    changes.off('change', onChange);
    changes.off('live', onLive);
  });
});
