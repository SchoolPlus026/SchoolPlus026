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

export const rtdb   = getDatabase(firebaseApp);
export const fbAuth = getAuth(firebaseApp);
export default firebaseApp;
