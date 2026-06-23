importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js');

// Parse Firebase config from query parameters (injected by usePushNotifications at registration time)
const urlParams = new URLSearchParams(location.search);
const apiKey = urlParams.get('apiKey') || '';
const firebaseConfig = {
  apiKey,
  authDomain:        urlParams.get('authDomain') || '',
  databaseURL:       urlParams.get('databaseURL') || '',
  projectId:         urlParams.get('projectId') || 'schoolpro-d95a8',
  storageBucket:     urlParams.get('storageBucket') || '',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId:             urlParams.get('appId') || '',
};

let messaging = null;

if (apiKey) {
  try {
    // Guard against double-initialization (browser may reuse the same SW instance)
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    messaging = firebase.messaging();

    // Background message handler — fires when app is closed / in background
    messaging.onBackgroundMessage((payload) => {
      console.info('[SW] Background FCM payload received:', payload);

      const title = payload.notification?.title || payload.data?.title || 'SchoolOS+ Alert';
      const options = {
        body:  payload.notification?.body  || payload.data?.body  || '',
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag:   'schoolos-notification',        // collapse duplicates
        renotify: true,
        requireInteraction: false,
        data: {
          route: payload.data?.route || '/'
        }
      };

      self.registration.showNotification(title, options);
    });

    console.info('[SW] Firebase Messaging initialized for background push.');
  } catch (err) {
    console.error('[SW] Firebase initialization failed:', err);
  }
} else {
  console.info('[SW] No Firebase apiKey in query params — background FCM disabled for this SW instance.');
}

// ── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetRoute = event.notification.data?.route || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(targetRoute);
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetRoute);
    })
  );
});

// ── PWA Caching (App Shell) ──────────────────────────────────────────────────
const CACHE_NAME = 'schoolos-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/theme-init.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  // skipWaiting so the new SW takes over immediately on re-registration
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip service worker itself and its versioned registrations (never cache sw.js)
  if (url.pathname.startsWith('/sw.js') || url.pathname.startsWith('/firebase-messaging-sw.js')) return;

  // Navigation requests: Network first, fallback to cached index.html (SPA routing)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: JS bundles, CSS, images, fonts — Cache first, then network
  // NOTE: We intentionally DO NOT cache .js files from the app root (/sw.js handled above)
  // Only cache hashed Vite build assets in /assets/
  const isHashedAsset = url.pathname.startsWith('/assets/') ||
                        url.pathname.endsWith('.webp') ||
                        url.pathname.endsWith('.png') ||
                        url.pathname.endsWith('.ico') ||
                        url.pathname.endsWith('.woff2') ||
                        url.pathname.endsWith('.woff');

  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 ||
              (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
