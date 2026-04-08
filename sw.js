// FinFlow Service Worker
// BUILD_TIMESTAMP is replaced at deploy time by the deploy script.
// Changing this value forces all clients to discard the old cache and
// fetch fresh assets — critical for correctness after every deploy.
const BUILD_TIMESTAMP = '20260408093537';
const CACHE = 'finflow-' + BUILD_TIMESTAMP;

// Shell assets to pre-cache (no JS/CSS — those are network-first)
const SHELL = [
  '/finflow/',
  '/finflow/index.html',
  '/finflow/manifest.json',
  '/finflow/apple-touch-icon.png',
  '/finflow/icon-192.png',
  '/finflow/icon-512.png',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // JS and CSS: ALWAYS network-first, no stale code ever served
  // Vite hashes these filenames so network-first is always safe
  if (url.pathname.match(/\.(js|css|jsx|ts)(\?|$)/)) {
    event.respondWith(
      fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // HTML navigation: network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/finflow/index.html'))
    );
    return;
  }

  // Static assets (images, fonts, icons): cache-first
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
});
