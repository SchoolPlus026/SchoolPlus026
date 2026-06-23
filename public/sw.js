importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js');

// Parse Firebase config from query parameters to avoid hardcoding secrets
const urlParams = new URLSearchParams(location.search);
const firebaseConfig = {
  apiKey:            urlParams.get('apiKey') || '',
  authDomain:        urlParams.get('authDomain') || '',
  databaseURL:       urlParams.get('databaseURL') || '',
  projectId:         urlParams.get('projectId') || 'schoolpro-d95a8',
  storageBucket:     urlParams.get('storageBucket') || '',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId:             urlParams.get('appId') || '',
};

if (firebaseConfig.apiKey) {
  try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background message handler
    messaging.onBackgroundMessage((payload) => {
      console.info('[FCM Service Worker] Received background notification payload:', payload);

      const title = payload.notification?.title || payload.data?.title || 'SchoolOS+ Alert';
      const options = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: '/icons/icon-192.webp',
        badge: '/icons/icon-72.webp',
        data: {
          route: payload.data?.route || '/'
        }
      };

      self.registration.showNotification(title, options);
    });
  } catch (err) {
    console.error('[FCM Service Worker] Firebase initialization failed:', err);
  }
} else {
  console.info('[FCM Service Worker] Firebase config parameters missing. Background notifications disabled.');
}

// Notification Click Handler: Navigate to the specified route
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetRoute = event.notification.data?.route || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find if there is already a window open, focus it and redirect
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetRoute);
          }
        }
      }
      // If no window is open, launch a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetRoute);
      }
    })
  );
});

const CACHE_NAME = 'schoolos-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/theme-init.js',
  '/google-translate-init.js',
  '/icons/icon-192.webp',
  '/icons/icon-512.webp'
];

// Install: Cache critical static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network first with Cache fallback for index.html / pages, Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip POST/PUT/DELETE requests or external api calls
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // HTML / Navigation requests: Network first, fallback to cached index.html (SPA routing)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Static assets (JS, CSS, WebP, Fonts): Cache first, fallback to Network
  const isStaticAsset = url.pathname.includes('/assets/') || 
                        url.pathname.endsWith('.js') || 
                        url.pathname.endsWith('.css') || 
                        url.pathname.endsWith('.webp') ||
                        url.pathname.includes('fonts.googleapis.com') ||
                        url.pathname.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default: Network with Cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
