/* Offline support. Network first, so updates always show when online;
   the cache is only used when the network is unavailable. */
const CACHE = "wcc-v5";
const CORE = [
  "./",
  "index.html",
  "app.css",
  "cwc27.css",
  "features.css",
  "shell.css",
  "pro.css",
  "pro.js",
  "cwc27.js",
  "story-mode.js",
  "ui-nav.js",
  "features.js",
  "shell.js",
  "assets/keyart/ab-de-villiers.webp",
  "presentation.js",
  "manifest.webmanifest",
  "assets/world-countries-50m.json",
  "assets/vendor/d3-array.min.js",
  "assets/vendor/d3-geo.min.js",
  "assets/vendor/topojson-client.min.js",
  "assets/icon-192.png",
  "assets/photos/johannesburg.jpg",
  "assets/photos/cape-town.jpg",
  "assets/photos/durban.jpg",
  "assets/photos/harare.jpg",
  "assets/photos/bulawayo.jpg",
  "assets/photos/windhoek.jpg",
  "assets/photos/nets.jpg",
  "assets/photos/matchday-1.jpg",
  "assets/photos/matchday-2.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  if (request.headers.has("range")) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (sameOrigin || isFont)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: sameOrigin }).then((cached) => cached || caches.match("index.html")))
  );
});
