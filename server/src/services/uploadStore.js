import { randomUUID } from 'node:crypto';

// Parsed workbooks wait here between the preview step and the commit step.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 20;
const SWEEP_MS = 5 * 60 * 1000;
const store = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, entry] of store) if (now - entry.createdAt > TTL_MS) store.delete(id);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
}

// Expired uploads are dropped on every access and, so an idle server does not hold parsed
// workbooks in memory for hours, every few minutes as well.
setInterval(sweep, SWEEP_MS).unref?.();

export const uploadStore = {
  put(data) {
    sweep();
    const id = randomUUID();
    store.set(id, { ...data, createdAt: Date.now() });
    return id;
  },
  get(id) {
    sweep();
    return store.get(id) || null;
  },
  delete(id) {
    store.delete(id);
  },
  size: () => store.size,
};
