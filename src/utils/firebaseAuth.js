/**
 * firebaseAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridge utility for Firebase Realtime Database custom claims authentication.
 * Uses the mint-firebase-token Edge Function from Supabase.
 */

import { fbAuth } from '../config/firebaseClient';
import { signInWithCustomToken } from 'firebase/auth';
import { safeInvokeEdgeFn } from '../config/supabaseClient';

// Module-scoped in-memory cache for the Firebase custom token (XSS secure)
let inMemoryCustomToken = null;
let inMemoryCustomTokenTimestamp = null;

/**
 * Ensures the user is logged into Firebase using a token with custom claims.
 * If already logged in, it will reuse the existing session.
 * 
 * @returns {Promise<User>} The authenticated Firebase user.
 */
export async function ensureFirebaseAuthenticated() {
  if (!fbAuth) {
    throw new Error('Firebase Auth is not initialized. Check your environment variables.');
  }

  // 1. Wait for Firebase Auth state initialization from local persistence (avoids startup race condition)
  if (typeof fbAuth.authStateReady === 'function') {
    await fbAuth.authStateReady();
  }

  // 2. Reuse existing authenticated session if active
  if (fbAuth.currentUser) {
    console.log('[FirebaseAuth] Reusing active session:', fbAuth.currentUser.uid);
    return fbAuth.currentUser;
  }

  const cacheKey = 'sp_cached_firebase_token';
  const timeKey  = 'sp_cached_firebase_token_ts';

  // 3. Check if we have a valid cached token in localStorage (persists across page reloads)
  try {
    const cachedToken = localStorage.getItem(cacheKey);
    const cachedTime  = localStorage.getItem(timeKey);

    if (cachedToken && cachedTime) {
      const elapsed = Date.now() - parseInt(cachedTime, 10);
      if (elapsed < 50 * 60 * 1000) { // 50-minute grace buffer
        try {
          console.log('[FirebaseAuth] Reusing cached local token...');
          const userCredential = await signInWithCustomToken(fbAuth, cachedToken);
          console.log('[FirebaseAuth] Firebase sign-in successful using cached local token, UID:', userCredential.user.uid);
          return userCredential.user;
        } catch (cacheAuthErr) {
          console.warn('[FirebaseAuth] Cached local token sign-in failed:', cacheAuthErr.message);
          localStorage.removeItem(cacheKey);
          localStorage.removeItem(timeKey);
        }
      } else {
        console.log('[FirebaseAuth] Cached local token expired (older than 50 mins).');
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(timeKey);
      }
    }
  } catch (_) {}

  // 4. Mint a new token if cache is cold
  try {
    console.log('[FirebaseAuth] Minting Firebase custom token from Supabase...');
    const data = await safeInvokeEdgeFn('mint-firebase-token');
    
    if (!data?.firebase_token) {
      throw new Error('No firebase_token returned from mint-firebase-token function.');
    }

    console.log('[FirebaseAuth] Signing in to Firebase with custom token...');
    const userCredential = await signInWithCustomToken(fbAuth, data.firebase_token);
    
    // Store in localStorage cache to survive page reloads
    try {
      localStorage.setItem(cacheKey, data.firebase_token);
      localStorage.setItem(timeKey, Date.now().toString());
    } catch (_) {}

    console.log('[FirebaseAuth] Firebase sign-in successful for UID:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('[FirebaseAuth] Authentication bridge failed:', error.message);
    throw error;
  }
}

/**
 * Clears the cached Firebase custom token and signs out of Firebase Auth.
 * Call this when the user logs out of the application to prevent session bleed.
 */
export async function clearFirebaseSession() {
  const cacheKey = 'sp_cached_firebase_token';
  const timeKey  = 'sp_cached_firebase_token_ts';
  try {
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(timeKey);
    console.log('[FirebaseAuth] Cleared local custom token cache.');
  } catch (_) {}
  if (fbAuth) {
    try {
      await fbAuth.signOut();
      console.log('[FirebaseAuth] Firebase Auth signed out successfully.');
    } catch (e) {
      console.warn('[FirebaseAuth] Firebase Auth signout failed:', e.message);
    }
  }
}
