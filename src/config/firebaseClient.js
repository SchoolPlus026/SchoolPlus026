/**
 * firebaseClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Realtime Database client for the Bus Safe Drop Live Tracking System.
 * Only the RTDB is used here — FCM is handled server-side via Edge Functions.
 *
 * Environment variables required (add to .env and GitHub Secrets):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_DATABASE_URL
 *   VITE_FIREBASE_PROJECT_ID
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:        import.meta.env.VITE_FIREBASE_API_KEY        || '',
  authDomain:    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN    || '',
  databaseURL:   import.meta.env.VITE_FIREBASE_DATABASE_URL   || '',
  projectId:     import.meta.env.VITE_FIREBASE_PROJECT_ID     || 'schoolpro-d95a8',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:         import.meta.env.VITE_FIREBASE_APP_ID         || '',
};

// Singleton pattern: prevent re-initialization on hot-module reload
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Guard: getDatabase() throws INVALID_ARGUMENT if databaseURL is empty.
// We wrap it so a missing env var causes a graceful error state in UI,
// NOT a module-level crash that kills the entire React app.
let rtdb   = null;
let fbAuth = null;

try {
  if (firebaseConfig.databaseURL) {
    rtdb   = getDatabase(firebaseApp);
    fbAuth = getAuth(firebaseApp);
  } else {
    console.error(
      '[firebaseClient] VITE_FIREBASE_DATABASE_URL is not set. ' +
      'Bus Safe Drop live tracking will be unavailable until the env var is configured.'
    );
  }
} catch (e) {
  console.error('[firebaseClient] Firebase initialization failed:', e.message);
}

export { rtdb, fbAuth };
export default firebaseApp;
