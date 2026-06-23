import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// Create a client for TanStack React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevent excessive read queries to Supabase
      staleTime: 5 * 60 * 1000, // Cache results for 5 minutes by default
    },
  },
});

// Apply initial theme and language
const theme = localStorage.getItem('sp_theme') || 'light';
const lang = localStorage.getItem('sp_lang') || 'en';

document.documentElement.setAttribute('data-theme', theme);
document.body.setAttribute('data-theme', theme);
if (theme === 'dark') {
  document.documentElement.classList.add('dark');
  document.documentElement.classList.remove('light');
} else {
  document.documentElement.classList.add('light');
  document.documentElement.classList.remove('dark');
}
document.documentElement.lang = lang;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Register Service Workers for PWA and FCM Web Push
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 1. Register main PWA Service Worker (sw.js)
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[PWA] sw.js registered:', reg.scope))
      .catch(err => console.error('[PWA] sw.js registration failed:', err));

    // 2. Register FCM Messaging Service Worker with query params
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';
    const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '';
    const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL || '';
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
    const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '';
    const appId = import.meta.env.VITE_FIREBASE_APP_ID || '';

    if (apiKey) {
      const fcmSwUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(apiKey)}` +
        `&authDomain=${encodeURIComponent(authDomain)}` +
        `&databaseURL=${encodeURIComponent(databaseURL)}` +
        `&projectId=${encodeURIComponent(projectId)}` +
        `&storageBucket=${encodeURIComponent(storageBucket)}` +
        `&messagingSenderId=${encodeURIComponent(messagingSenderId)}` +
        `&appId=${encodeURIComponent(appId)}`;

      navigator.serviceWorker.register(fcmSwUrl, { scope: '/firebase-cloud-messaging-push-scope' })
        .then(reg => console.log('[FCM] firebase-messaging-sw.js registered:', reg.scope))
        .catch(err => console.error('[FCM] firebase-messaging-sw.js registration failed:', err));
    }
  });
}

// Request persistent storage caching sandbox
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(persisted => {
    console.info(`[Storage] Sandbox persistent storage granted: ${persisted}`);
  });
}

