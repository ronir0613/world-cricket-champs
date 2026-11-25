/* Offline support. Network first, so updates always show when online;
   the cache is only used when the network is unavailable. */
const CACHE = "wcc-v18";
const CORE = [
  "./",
  "index.html",
  "app.css",
  "cwc27.css",
  "features.css",
  "shell.css",
  "pro.css",
  "pro.js",
  "game/game.css",
  "game/nets.js",
  "game/ball.js",
  "game/world.js",
  "game/figure.js",
  "vendor/three/three.module.min.js",
  "vendor/three/addons/loaders/GLTFLoader.js",
  "vendor/three/addons/utils/BufferGeometryUtils.js",
  "game/players.js",
  "assets/players/player.gltf",
  "assets/players/player.bin",
  "assets/players/body_dark.webp",
  "assets/players/body_light.webp",
  "assets/players/body_normal.webp",
  "assets/players/body_rough.webp",
  "assets/players/eye.webp",
  "assets/players/hair.webp",
  "assets/players/hair_normal.webp",
  "assets/players/hair_parted.gltf",
  "assets/players/hair_parted.bin",
  "assets/players/hair_buzzed.gltf",
  "assets/players/hair_buzzed.bin",
  "assets/players/beard.gltf",
  "assets/players/beard.bin",
  "assets/players/anims.glb",
  "assets/players/bat.glb",
  "game/bowler.js",
  "game/batter.js",
  "game/venue-preview.js",
  "game/movement-lab.js",
  "vendor/three/addons/loaders/FBXLoader.js",
  "vendor/three/addons/libs/fflate.module.js",
  "vendor/three/addons/curves/NURBSCurve.js",
  "vendor/three/addons/curves/NURBSUtils.js",
  "assets/players/cricketer/bowler.fbx",
  "assets/players/cricketer/skin.webp",
  "assets/players/cricketer/skin_n.webp",
  "assets/players/cricketer/shirt.webp",
  "assets/players/cricketer/shirt_n.webp",
  "assets/players/cricketer/trousers_n.webp",
  "assets/players/cricketer/shoes.webp",
  "assets/players/cricketer/shoes_n.webp",
  "assets/players/cricketer/eye.webp",
  "assets/players/cricketer/teeth.webp",
  "assets/players/cricketer/hair_n.webp",
  "assets/sfx/bat_hit.mp3",
  "assets/sfx/cheer_big.mp3",
  "assets/sfx/cheer_small.mp3",
  "assets/sfx/crowd_ambience.mp3",
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
