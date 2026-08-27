// Bump this on every release so installed phones fetch the new shell
// instead of serving a stale cached version forever.
const CACHE = 'dandy-engines-v8';
const SHELL = [
  '/', '/styles.css',
  '/jobs.js', '/modal.js', '/undo.js', '/home.js', '/myjobs.js',
  '/alljobs.js', '/allmachining.js', '/tunnelvision.js', '/rottler.js',
  '/balancing.js', '/partpayments.js', '/history.js', '/permissions-ui.js', '/tab-order-ui.js', '/feedback-ui.js', '/machining.js',
  '/alerts.js', '/search.js', '/app.js',
  '/manifest.json', '/logo.webp',
];

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

  // Network-first for the app shell (HTML/JS/CSS): always try to fetch the
  // latest version first, and only fall back to the cached copy if the
  // network is unavailable (offline support). This is deliberately NOT
  // cache-first — cache-first silently served a stale build for an entire
  // release once, since it required perfectly remembering to bump CACHE
  // above on every single deploy. Network-first self-heals instead.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
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
