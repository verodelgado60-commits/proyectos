// La app instalable se quitó. Este archivo solo existe para desinstalar el service worker
// que alcanzó a registrarse en algunos navegadores: borra su caché y se da de baja.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url).catch(() => {});
  })());
});
