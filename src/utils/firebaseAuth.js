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

  try {
    console.log('[FirebaseAuth] Minting Firebase custom token from Supabase...');
    const data = await safeInvokeEdgeFn('mint-firebase-token');
    
    if (!data?.firebase_token) {
      throw new Error('No firebase_token returned from mint-firebase-token function.');
    }

    console.log('[FirebaseAuth] Signing in to Firebase with custom token...');
    const userCredential = await signInWithCustomToken(fbAuth, data.firebase_token);
    
    console.log('[FirebaseAuth] Firebase sign-in successful for UID:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('[FirebaseAuth] Authentication bridge failed:', error.message);
    throw error;
  }
}
