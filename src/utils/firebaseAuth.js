/**
 * firebaseAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridge utility for Firebase Realtime Database custom claims authentication.
 * Uses the mint-firebase-token Edge Function from Supabase.
 */

import { fbAuth } from '../config/firebaseClient';
import { signInWithCustomToken } from 'firebase/auth';
import { safeInvokeEdgeFn } from '../config/supabaseClient';

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

  const tokenKey = 'sp_firebase_custom_token';
  const stampKey = 'sp_firebase_custom_token_timestamp';

  // Check if we have a valid cached token
  const cachedToken = localStorage.getItem(tokenKey);
  const cachedStamp = localStorage.getItem(stampKey);

  if (cachedToken && cachedStamp) {
    const elapsed = Date.now() - parseInt(cachedStamp, 10);
    // Custom token is valid for 1 hour. We reuse it if it is less than 50 minutes old (grace buffer)
    if (elapsed < 50 * 60 * 1000) {
      try {
        console.log('[FirebaseAuth] Reusing cached custom token...');
        const userCredential = await signInWithCustomToken(fbAuth, cachedToken);
        console.log('[FirebaseAuth] Firebase sign-in successful using cached token, UID:', userCredential.user.uid);
        return userCredential.user;
      } catch (cacheAuthErr) {
        console.warn('[FirebaseAuth] Cached token sign-in failed, removing from cache:', cacheAuthErr.message);
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(stampKey);
      }
    } else {
      console.log('[FirebaseAuth] Cached token expired (older than 50 mins).');
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
    
    // Store in cache
    try {
      localStorage.setItem(tokenKey, data.firebase_token);
      localStorage.setItem(stampKey, Date.now().toString());
    } catch (cacheErr) {
      console.warn('[FirebaseAuth] Failed to write token to cache:', cacheErr.message);
    }

    console.log('[FirebaseAuth] Firebase sign-in successful for UID:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('[FirebaseAuth] Authentication bridge failed:', error.message);
    throw error;
  }
}
