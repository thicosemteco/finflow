// sw.js — FinFlow service worker
// Firebase API calls must NEVER be served from cache: they need live auth tokens.
const CACHE = 'finflow-v2';

const FIREBASE_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebaselogging.googleapis.com',
  'www.googleapis.com',
  'accounts.google.com',
  'appleid.apple.com',
];

function isFirebaseRequest(url) {
  return FIREBASE_HOSTS.some(host => url.hostname.includes(host));
}

// Install — pre-cache the app shell
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

// Activate — remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Always pass Firebase requests straight to the network — never cache them.
  if (isFirebaseRequest(url)) return;

  // 2. Cross-origin non-Firebase (CDN fonts, etc.) — network only, no cache.
  if (url.origin !== self.location.origin) return;

  // 3. HTML navigation — network first, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => { caches.open(CACHE).then(c => c.put(request, res.clone())); return res; })
        .catch(() => caches.match('/finflow/index.html'))
    );
    return;
  }

  // 4. Static assets (JS/CSS/images) — cache first, refresh in background.
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const fresh = fetch(request).then(res => {
          cache.put(request, res.clone());
          return res;
        }).catch(() => {});
        return cached || fresh;
      })
    )
  );
});
