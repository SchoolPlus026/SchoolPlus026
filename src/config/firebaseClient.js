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

const cleanEnvVar = (val) => {
  if (typeof val !== 'string') return val;
  return val.trim().replace(/^['"]|['"]$/g, '').trim();
};

const firebaseConfig = {
  apiKey:        cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY)        || 'AIzaSyC55RFbFqAC-lWaohoIdiaFODrADwkXROY',
  authDomain:    cleanEnvVar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN)    || 'schoolpro-d95a8.firebaseapp.com',
  databaseURL:   cleanEnvVar(import.meta.env.VITE_FIREBASE_DATABASE_URL)   || 'https://schoolpro-d95a8-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:     cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID)     || 'schoolpro-d95a8',
  storageBucket: cleanEnvVar(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || 'schoolpro-d95a8.firebasestorage.app',
  messagingSenderId: cleanEnvVar(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || '740866406612',
  appId:         cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID)         || '1:740866406612:web:3e22519602a53c2307a341',
};

// ─── RUNTIME CREDENTIAL SANITIZATION ─────────────────────────────────────────
// If the app is running with mismatched credentials (e.g. legacy/wrong GitHub
// secrets for messagingSenderId or appId), we automatically override/correct
// them at runtime to prevent 403 PERMISSION_DENIED on the Installations API.
if (firebaseConfig.projectId === 'schoolpro-d95a8') {
  const EXPECTED_SENDER_ID = '740866406612';
  const EXPECTED_APP_ID = '1:740866406612:web:3e22519602a53c2307a341';

  if (firebaseConfig.messagingSenderId !== EXPECTED_SENDER_ID || firebaseConfig.appId !== EXPECTED_APP_ID) {
    console.warn(
      `[firebaseClient] ⚠️ DETECTED MISMATCHED FIREBASE CREDENTIALS AT RUNTIME!\n` +
      `  - Got messagingSenderId: "${firebaseConfig.messagingSenderId}" (Expected: "${EXPECTED_SENDER_ID}")\n` +
      `  - Got appId:             "${firebaseConfig.appId}" (Expected: "${EXPECTED_APP_ID}")\n` +
      `  - Project ID:            "${firebaseConfig.projectId}"\n` +
      `Automatically overriding with correct Web App credentials to prevent 403 Forbidden.`
    );
    firebaseConfig.messagingSenderId = EXPECTED_SENDER_ID;
    firebaseConfig.appId = EXPECTED_APP_ID;
  }
}

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
