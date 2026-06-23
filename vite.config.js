import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Vite plugin: generates public/firebase-messaging-sw.js at build time
 * with Firebase config values baked directly into the file.
 *
 * WHY this approach:
 *  - Service Workers run outside the Vite bundle — they cannot use import.meta.env.
 *  - Passing config via URL query params causes FCM to treat the SW as non-standard,
 *    leading to VAPID key validation failures and AbortError on PushManager.subscribe().
 *  - Firebase SDK's getToken() looks for /firebase-messaging-sw.js by default.
 *    Using the standard filename removes all SW lookup ambiguity.
 *  - Baking values at build time (via loadEnv) works identically in local dev,
 *    CI/CD pipelines, and production builds.
 */
function firebaseMessagingSWPlugin(env) {
  const apiKey            = env.VITE_FIREBASE_API_KEY            || '';
  const authDomain        = env.VITE_FIREBASE_AUTH_DOMAIN        || '';
  const databaseURL       = env.VITE_FIREBASE_DATABASE_URL       || '';
  const projectId         = env.VITE_FIREBASE_PROJECT_ID         || 'schoolpro-d95a8';
  const storageBucket     = env.VITE_FIREBASE_STORAGE_BUCKET     || '';
  const messagingSenderId = env.VITE_FIREBASE_MESSAGING_SENDER_ID|| '';
  const appId             = env.VITE_FIREBASE_APP_ID             || '';

  const swContent = `
// ============================================================
// firebase-messaging-sw.js
// AUTO-GENERATED at build time by vite.config.js plugin.
// DO NOT edit manually — changes will be overwritten on next build.
// Firebase config is baked in at build time (no import.meta.env in SW scope).
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey:            "${apiKey}",
  authDomain:        "${authDomain}",
  databaseURL:       "${databaseURL}",
  projectId:         "${projectId}",
  storageBucket:     "${storageBucket}",
  messagingSenderId: "${messagingSenderId}",
  appId:             "${appId}",
};

if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId) {
  try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background message handler — fires when app is closed or in background tab.
    // When the app is in FOREGROUND, onMessage() in the React hook handles delivery.
    messaging.onBackgroundMessage((payload) => {
      console.info('[firebase-messaging-sw] Background message received:', payload);
      const title = payload.notification?.title || payload.data?.title || 'SchoolOS+ Alert';
      const options = {
        body:     payload.notification?.body || payload.data?.body || '',
        icon:     '/icons/icon-192.png',
        badge:    '/icons/icon-72.png',
        tag:      'schoolos-notification',
        renotify: true,
        requireInteraction: false,
        data:     { route: payload.data?.route || '/' },
      };
      return self.registration.showNotification(title, options);
    });

    console.info('[firebase-messaging-sw] ✅ Firebase Messaging initialized successfully.');
  } catch (err) {
    console.error('[firebase-messaging-sw] Firebase initialization failed:', err);
  }
} else {
  console.warn('[firebase-messaging-sw] Firebase config is missing — background push notifications disabled.');
}

// Notification click: navigate to the route stored in notification data
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(route);
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(route);
    })
  );
});
`.trimStart();

  function generate() {
    const outputPath = resolve('./public/firebase-messaging-sw.js');
    writeFileSync(outputPath, swContent, 'utf8');
    console.log('[vite-plugin:firebase-sw] ✅ Generated public/firebase-messaging-sw.js');
  }

  return {
    name: 'firebase-messaging-sw',
    // Generate on build start (npm run build)
    buildStart() { generate(); },
    // Generate on dev server start (npm run dev)
    configureServer() { generate(); },
  };
}

export default defineConfig(({ mode }) => {
  // loadEnv reads .env, .env.local, .env.[mode] — works in local dev and CI
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      firebaseMessagingSWPlugin(env),
    ],
    server: {
      port: 3000,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      emptyOutDir: true,
    },
  };
});
