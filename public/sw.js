// Service worker: shows the notifications the server sends, and opens the right event when one is tapped.
// It deliberately caches nothing, so the app always loads the latest version.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { /* not JSON: show the default text */ }
  e.waitUntil(self.registration.showNotification(m.title || 'DJ MB', {
    body: m.body || 'יש עדכון באירועים',
    tag: m.tag || undefined,
    renotify: !!m.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    lang: 'he',
    dir: 'rtl',
    data: { url: m.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('navigate' in w) {
        await w.navigate(url);
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
