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

  // Reuse existing authenticated session if active
  if (fbAuth.currentUser) {
    console.log('[FirebaseAuth] Reusing active session:', fbAuth.currentUser.uid);
    return fbAuth.currentUser;
  }

  // One-time self-healing cleanup: remove legacy plain-text tokens from localStorage
  try {
    localStorage.removeItem('sp_firebase_custom_token');
    localStorage.removeItem('sp_firebase_custom_token_timestamp');
  } catch (_) {}

  // Check if we have a valid cached token in memory
  if (inMemoryCustomToken && inMemoryCustomTokenTimestamp) {
    const elapsed = Date.now() - inMemoryCustomTokenTimestamp;
    // Custom token is valid for 1 hour. We reuse it if it is less than 50 minutes old (grace buffer)
    if (elapsed < 50 * 60 * 1000) {
      try {
        console.log('[FirebaseAuth] Reusing cached in-memory custom token...');
        const userCredential = await signInWithCustomToken(fbAuth, inMemoryCustomToken);
        console.log('[FirebaseAuth] Firebase sign-in successful using cached token, UID:', userCredential.user.uid);
        return userCredential.user;
      } catch (cacheAuthErr) {
        console.warn('[FirebaseAuth] Cached token sign-in failed, removing from memory:', cacheAuthErr.message);
        inMemoryCustomToken = null;
        inMemoryCustomTokenTimestamp = null;
      }
    } else {
      console.log('[FirebaseAuth] Cached in-memory token expired (older than 50 mins).');
    }
  }

  try {
    console.log('[FirebaseAuth] Minting Firebase custom token from Supabase...');
    const data = await safeInvokeEdgeFn('mint-firebase-token');
    
    if (!data?.firebase_token) {
      throw new Error('No firebase_token returned from mint-firebase-token function.');
    }

    console.log('[FirebaseAuth] Signing in to Firebase with custom token...');
    const userCredential = await signInWithCustomToken(fbAuth, data.firebase_token);
    
    // Store in-memory cache
    inMemoryCustomToken = data.firebase_token;
    inMemoryCustomTokenTimestamp = Date.now();

    console.log('[FirebaseAuth] Firebase sign-in successful for UID:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('[FirebaseAuth] Authentication bridge failed:', error.message);
    throw error;
  }
}
