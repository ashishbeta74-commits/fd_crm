import { AsyncLocalStorage } from 'node:async_hooks';

// Who is making the current request, reachable from anywhere it leads to (model hooks included) without
// passing `req` down. requireAuth opens the scope; sheet syncs and start-up jobs run outside it (no user).
const store = new AsyncLocalStorage();

export const runAsUser = (user, fn) => store.run({ user }, fn);

/** { id, name } of the signed-in person, or null outside a request / for the static API token. */
export function currentUser() {
  const u = store.getStore()?.user;
  if (!u?._id) return null;
  return { id: u._id, name: u.displayName || u.username || '' };
}

/** Runs `fn` as the system (no user): sheet imports started from a request must not credit the person who clicked. */
export const runAsSystem = (fn) => store.run({ user: null }, fn);
