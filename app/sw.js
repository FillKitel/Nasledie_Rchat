const CACHE = "mayak-shell-v21";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./chat-state.js?v=21",
  "./user-search.js?v=21",
  "./username.js?v=21",
  "./avatar-crop.js?v=21",
  "./app.js?v=21",
  "./styles.css?v=21",
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

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const payload = event.data?.json?.() || {};
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = windows.some(
        (client) => client.visibilityState === "visible",
      );
      if (visible) {
        windows.forEach((client) =>
          client.postMessage({ type: "mayak-push", payload }),
        );
        return;
      }
      await self.registration.showNotification(
        payload.title || "Новое сообщение в Маяке",
        {
          body: payload.body || "Откройте Маяк, чтобы прочитать сообщение",
          icon: "./icon.svg",
          badge: "./icon.svg",
          tag: payload.chatId ? `mayak-${payload.chatId}` : "mayak-message",
          renotify: true,
          data: { url: payload.url || "./" },
        },
      );
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = new URL(
        event.notification.data?.url || "./",
        self.location.origin,
      ).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
