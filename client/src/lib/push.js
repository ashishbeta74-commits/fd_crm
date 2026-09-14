// Web Push: register the service worker, subscribe this browser with the API's public key, and
// tell the API. Works only over https or on localhost, and only in browsers that support push.
import { api } from '@/lib/api';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

const toKey = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

/** Subscribe this browser (idempotent) and register the subscription with the API. */
export async function subscribePush() {
  if (!pushSupported()) throw new Error('This browser cannot receive push notifications');
  const reg = await registration();
  const { publicKey } = await api.push.key();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await api.push.subscribe(sub.toJSON());
  return sub;
}

/** Unsubscribe this browser and forget it on the API. */
export async function unsubscribePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.push.unsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Whether this browser currently holds a push subscription. */
export async function hasPushSubscription() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return Boolean(await reg?.pushManager.getSubscription());
}
