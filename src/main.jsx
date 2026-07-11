import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';

// Create a client for TanStack React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevent excessive read queries to Supabase
      refetchOnReconnect: false,   // Disable automatic sync storm DDoS on reconnection
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

// Request persistent storage caching sandbox
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(persisted => {
    console.info(`[Storage] Sandbox persistent storage granted: ${persisted}`);
  });
}

// Register unified Service Worker immediately on startup for Web/PWA
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Clean up legacy sw.js if present
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const script = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (script.includes('/sw.js') && !script.includes('firebase-messaging-sw')) {
          console.info('[PWA] Unregistering legacy SW:', script);
          await reg.unregister();
        }
      }

      // Register the unified messaging + caching service worker
      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      console.info('[PWA] Service Worker registered. Scope:', reg.scope);

      // Listen for new service worker updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('[PWA] New service worker installed and waiting.');
              window.dispatchEvent(new CustomEvent('sw-update-available', { detail: reg }));
            }
          });
        }
      });

      // Check if there is already a waiting service worker on load
      if (reg.waiting && navigator.serviceWorker.controller) {
        console.info('[PWA] Service worker update is already waiting.');
        window.dispatchEvent(new CustomEvent('sw-update-available', { detail: reg }));
      }
    } catch (err) {
      console.warn('[PWA] Service Worker registration failed:', err);
    }
  });
}

