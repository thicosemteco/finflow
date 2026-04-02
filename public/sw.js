const CACHE = 'finflow-v1';

// On install: cache the app shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        '/finflow/',
        '/finflow/index.html',
        '/finflow/manifest.json',
        '/finflow/apple-touch-icon.png',
        '/finflow/icon-192.png',
      ])
    )
  );
});

// On activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Navigation (HTML): network first, fall back to cached /finflow/index.html
// - Assets (JS/CSS/images): cache first, update cache in background
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Navigation: try network, fall back to shell
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/finflow/index.html'))
    );
  } else {
    // Assets: serve from cache instantly, refresh cache in background
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(request).then(cached => {
          const networkFetch = fetch(request).then(res => {
            cache.put(request, res.clone());
            return res;
          }).catch(() => {});
          return cached || networkFetch;
        })
      )
    );
  }
});
