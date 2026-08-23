const CACHE_NAME = 'glow-log-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (event.request.method === 'GET' && response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await cache.match(event.request);
        return cached || Promise.reject(err);
      }
    })
  );
});
