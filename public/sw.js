// @ts-nocheck -- runs in ServiceWorkerGlobalScope, not the app's Window scope.
// Minimal service worker: enough to make the app installable, with a
// network-first runtime cache as a lightweight offline fallback.
// ponytail: no precache/versioning strategy; upgrade to a real offline shell
// (e.g. Workbox or a versioned precache list) if offline support matters.
const CACHE = "gg-runtime-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
