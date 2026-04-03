// sw.js — FinFlow service worker
// Firebase API calls must NEVER be served from cache: they need live auth tokens.
const CACHE = 'finflow-v5';

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

  // 3. HTML navigation — network first, fall back to cached app shell.
  //
  // Two fallback levels:
  //   a) Non-200 response (GitHub Pages 404 for unknown SPA routes): serve
  //      cached index.html so the React router handles the path client-side.
  //   b) Network error (offline): same — serve cached index.html.
  //
  // Note: Firebase auth redirects go through finflow-b3e2f.firebaseapp.com
  // (Firebase Hosting), not through this service worker. By the time the
  // browser returns here it is navigating to a normal same-origin URL.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {});
            return res;
          }
          // Non-200 (e.g. GitHub Pages 404 for deep SPA links): serve app shell.
          return caches.match('/finflow/index.html').then(cached => cached || res);
        })
        .catch(() => caches.match('/finflow/index.html'))
    );
    return;
  }

  // 4. Static assets (JS/CSS/images) — cache first, refresh in background.
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const fresh = fetch(request).then(res => {
          // Same rule: clone synchronously, only cache clean same-origin responses.
          if (res.ok && res.type === 'basic') {
            const clone = res.clone();
            cache.put(request, clone).catch(() => {});
          }
          return res;
        }).catch(() => null);
        return cached || fresh;
      })
    )
  );
});
