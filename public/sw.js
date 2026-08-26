// Bump this on every release so installed phones fetch the new shell
// instead of serving a stale cached version forever.
const CACHE = 'dandy-engines-v7';
const SHELL = ['/', '/styles.css', '/app.js', '/jobs.js', '/myjobs.js', '/alljobs.js', '/tunnelvision.js', '/rottler.js', '/partpayments.js', '/history.js', '/machining.js', '/alerts.js', '/manifest.json', '/logo.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache API calls — always hit the network for auth/data.
  if (event.request.url.includes('/.netlify/functions/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Dandy Engines', body: 'You have an update.' };
  try { data = event.data.json(); } catch { /* fall back to default above */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.webp',
      badge: '/logo.webp',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
