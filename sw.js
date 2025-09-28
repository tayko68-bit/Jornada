const CACHE_NAME = 'jornada-cache-v1';
const urlsToCache = [
  './jornada_gps.html',
  // Si tienes una hoja de estilos CSS externa, añádela aquí
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});