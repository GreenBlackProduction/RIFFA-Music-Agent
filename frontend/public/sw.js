// Service Worker for caching static assets (production only)
const CACHE_NAME = 'riffa-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((name) => caches.delete(name)))
    )
  );
});

// Pass through all requests — no caching during Vite dev server usage.
// The SW is kept registered so a future production build can activate
// a real caching strategy without re-requesting permissions.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});