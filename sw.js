/*
 * Service worker: hace la app instalable y utilizable sin conexión.
 *
 * Estrategias:
 *  - HTML/CSS/JS/datos propios: network-first con fallback a caché. Así,
 *    con conexión siempre se sirve la versión más reciente (nunca queda
 *    "pegado" un JS viejo); sin conexión, se sirve la última copia buena
 *    conocida.
 *  - Retratos de campeón (assets/champions/*.png): cache-first. El nombre
 *    de archivo es estable por campeón y pesan ~5MB en total; no tiene
 *    sentido re-descargarlos en cada visita ni bloquear la instalación
 *    descargándolos todos de golpe, así se van cacheando bajo demanda.
 *
 * Sube CACHE_VERSION cuando cambies esta lista o la lógica de fetch, para
 * forzar que los clientes viejos limpien su caché de shell.
 */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `arena-tracker-static-${CACHE_VERSION}`;
const IMAGE_CACHE = "arena-tracker-images-v1";

const APP_SHELL = [
  "/",
  "/es/",
  "/privacy/",
  "/es/privacidad/",
  "/404.html",
  "/style.css",
  "/app.js",
  "/data/champions.json",
  "/site.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== IMAGE_CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/champions/")) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(request).then(
          cached =>
            cached ||
            fetch(request).then(response => {
              cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
