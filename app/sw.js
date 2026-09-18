const CACHE = "mayak-shell-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./chat-state.js?v=20",
  "./user-search.js?v=20",
  "./username.js?v=20",
  "./avatar-crop.js?v=20",
  "./app.js?v=20",
  "./styles.css?v=20",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});
