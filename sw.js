// Service worker mínimo para instalar el sitio como app.
// Siempre pide primero a la red (así nunca se queda con una versión vieja); solo usa la copia guardada
// si no hay conexión. Nunca guarda ni toca las llamadas a GitHub (datos cifrados, token).
const CACHE = "proyectos-app-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // api.github.com y raw.githubusercontent.com: directo, sin caché
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
      }
      return res;
    } catch {
      const guardada = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
      if (guardada) return guardada;
      if (req.mode === "navigate") { const inicio = await caches.match("./", { ignoreSearch: true }); if (inicio) return inicio; }
      return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
