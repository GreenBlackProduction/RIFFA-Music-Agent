// Tombstone service worker.
//
// The previous version was a pass-through (`fetch(event.request)` for every
// request). Once it controlled a page, it re-issued cross-origin requests
// (Google Fonts) as `fetch()` — which reclassifies them from `style-src` to
// `connect-src` and trips the page CSP, and it broke Vite's lazy CSS preload
// (white screen on returning visits). It cached nothing, so it had no upside.
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
