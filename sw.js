const CACHE_NAME = 'jornada-cache-v1';
const urlsToCache = [
  './jornada_gps.html',
  'https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
