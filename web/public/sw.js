// Kockolov service worker: makes the site installable, shows a friendly page when the phone is offline,
// and shows push notifications (a watched set got cheaper or is back in stock).
// Prices are always fetched live, so nothing else is cached here; the browser cache handles /assets.
const CACHE = 'kockolov-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : '' };
  }
  const title = msg.title || 'Kockolov';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: msg.body || '',
      icon: msg.icon || '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: msg.tag || undefined,
      renotify: Boolean(msg.tag),
      lang: 'sr',
      data: { url: msg.url || '/pracenje' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => w.url === target);
      if (same) return same.focus();
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open && 'navigate' in open) return open.focus().then((w) => (w || open).navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});

// The browser replaced the subscription (keys rotated): tell the server about the new one
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  event.waitUntil(
    (async () => {
      const res = await fetch('/api/push/key');
      if (!res.ok) return;
      const { key } = await res.json();
      const sub =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(key) }));
      await fetch('/api/me/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), replaces: old ? old.endpoint : undefined }),
      });
    })(),
  );
});

function urlKey(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
