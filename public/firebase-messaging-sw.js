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
} else {
  console.warn('[FCM Service Worker] Firebase config parameters missing from registration URL.');
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
