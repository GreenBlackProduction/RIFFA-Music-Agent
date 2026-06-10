// Tombstone service worker.
//
// A real SW broke critical flows: a navigation-fetch handler double-fetched
// single-use auth nonces (/tg-auth?nonce=…) → Telegram login failed; an earlier
// pass-through version tripped the Google-Fonts CSP and broke Vite's lazy CSS
// (white screen). So we intentionally run NO service worker.
//
// This version intercepts no requests (no `fetch` handler), clears any old
// caches, and unregisters itself. Returning browsers fetch this file on their
// next navigation (sw.js is served no-cache), evict the old worker, and from
// then on every request is handled natively by the browser.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
