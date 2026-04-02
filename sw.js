// sw.js — FinFlow service worker
// Firebase API calls must NEVER be served from cache: they need live auth tokens.
const CACHE = 'finflow-v3';

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
  //
  // IMPORTANT: .catch() only fires on network errors, NOT on 4xx responses.
  // When authDomain = "thicosemteco.github.io", Google redirects the user to
  //   https://thicosemteco.github.io/__/auth/handler?code=...&state=...
  // GitHub Pages has no such file — it returns HTTP 404 (a valid response).
  // Without the explicit non-200 fallback below, the SW would return that 404
  // to the browser, Firebase would never see the auth result, and the user
  // would land back on the login screen with no error.
  // By serving index.html for any non-200 navigate, the app loads at
  // /__/auth/handler?... and Firebase's redirectResultPromise processes the
  // OAuth params, completing the sign-in.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok && res.status === 200 && res.type === 'basic') {
            // Cache successful responses (clone synchronously before any async work).
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {});
            return res;
          }
          // Non-200 (including 404 for /__/auth/handler on GitHub Pages):
          // serve the app shell so Firebase can process the auth result.
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
