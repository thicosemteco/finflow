// FinFlow Service Worker
// BUILD_TIMESTAMP is replaced at deploy time by deploy.sh
// A new timestamp on every deploy forces cache invalidation and reload.
const BUILD_TIMESTAMP = '20260415093437';
const CACHE = 'finflow-' + BUILD_TIMESTAMP;

const SHELL = [
  '/finflow/',
  '/finflow/index.html',
  '/finflow/manifest.json',
  '/finflow/apple-touch-icon.png',
  '/finflow/icon-192.png',
  '/finflow/icon-512.png',
];

// Install: cache shell assets immediately, skip waiting so this SW
// takes over right away without waiting for all tabs to close.
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
});

// Activate: delete ALL old caches, then tell every open tab to reload
// so they get the new JS bundle (not the one the old SW already served).
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Tell all open clients to reload so they get fresh JS
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // JS and CSS: ALWAYS network-first so stale code is never served
  if (url.pathname.match(/\.(js|css)(\?|$)/)) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
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

  // Static assets (images, icons): cache-first
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(res => { cache.put(request, res.clone()); return res; })
          .catch(() => {});
        return cached || networkFetch;
      })
    )
  );
});
