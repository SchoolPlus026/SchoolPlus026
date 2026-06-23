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

// NOTE: Service Worker registration is handled exclusively by usePushNotifications.js
// to ensure Firebase config query params are correctly injected before getToken() is called.
// Registering here without those params would cause a race condition where a bare SW
// (without Firebase config) activates first and blocks FCM token generation.

// Request persistent storage caching sandbox
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(persisted => {
    console.info(`[Storage] Sandbox persistent storage granted: ${persisted}`);
  });
}

