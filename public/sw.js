// @ts-nocheck -- runs in ServiceWorkerGlobalScope, not the app's Window scope.
// Minimal service worker: enough to make the app installable, with a
// network-first runtime cache as a lightweight offline fallback.
// ponytail: no precache/versioning strategy; upgrade to a real offline shell
// (e.g. Workbox or a versioned precache list) if offline support matters.
const CACHE = "gg-runtime-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Evict stale bundles: drop every cache that isn't the current one, so a
  // deploy can't be masked by a previously-cached JS chunk.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches
          .open(CACHE)
          .then((cache) => cache.put(request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
