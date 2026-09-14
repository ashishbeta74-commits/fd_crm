/* Famous Drive CRM service worker: shows push notifications and opens the CRM when one is clicked. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Famous Drive CRM', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Famous Drive CRM';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: '/images/telephone-call.png',
    badge: '/images/telephone-call.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const sameOrigin = list.find((c) => 'focus' in c);
      if (sameOrigin) {
        sameOrigin.focus();
        if ('navigate' in sameOrigin) return sameOrigin.navigate(url).catch(() => undefined);
        return undefined;
      }
      return self.clients.openWindow(url);
    }),
  );
});
