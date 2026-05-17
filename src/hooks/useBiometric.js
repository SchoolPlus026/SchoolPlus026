/**
 * useBiometric.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom React hook — WebAuthn / Biometric Login
 *
 * Encapsulates the full WebAuthn client-side ceremony logic:
 *   • isSupported()      — check if device/browser supports biometrics
 *   • registerPasskey()  — enroll this device (registration ceremony)
 *   • loginWithBiometric() — authenticate (authentication ceremony)
 *   • listPasskeys()     — fetch user's enrolled devices from DB
 *   • removePasskey()    — delete a specific credential from DB
 *
 * Uses @simplewebauthn/browser for the browser-side ceremony API.
 * All cryptographic verification is done server-side in Edge Functions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { supabase } from '../config/supabaseClient';

// Edge Function base URL — derived from the Supabase URL
const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Call a Supabase Edge Function with JSON body.
 * Automatically includes the anon key in the Authorization header.
 */
async function callEdge(functionName, body) {
  const res = await fetch(`${EDGE_BASE}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Edge function error (${res.status})`);
  return json;
}

export function useBiometric() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Support check ──────────────────────────────────────────────────────────
  /**
   * Returns true if the browser supports WebAuthn AND the platform has
   * a biometric authenticator (Touch ID, Face ID, fingerprint sensor, etc.)
   */
  const isSupported = useCallback(async () => {
    if (!browserSupportsWebAuthn()) return false;
    try {
      return await platformAuthenticatorIsAvailable();
    } catch {
      return false;
    }
  }, []);

  // ── Register this device ───────────────────────────────────────────────────
  /**
   * Runs the WebAuthn registration ceremony for the current logged-in user.
   * @param {string} userId    - Supabase auth.users UUID
   * @param {string} username  - Display name for the credential
   * @param {string} friendlyName - e.g. "My Android Phone"
   * @returns {{ success: boolean, error?: string }}
   */
  const registerPasskey = useCallback(async (userId, username, friendlyName = 'My Device') => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get registration options from server
      const options = await callEdge('webauthn-start', {
        type: 'registration',
        userId,
        username,
      });

      // 2. Trigger OS biometric prompt (browser handles the UI)
      let credential;
      try {
        credential = await startRegistration({ optionsJSON: options });
      } catch (browserErr) {
        // User cancelled or device doesn't support it
        if (browserErr.name === 'NotAllowedError') {
          throw new Error('Biometric enrollment was cancelled. Please try again.');
        }
        throw new Error(`Enrollment failed: ${browserErr.message}`);
      }

      // 3. Send the credential to server for verification and storage
      const result = await callEdge('webauthn-verify', {
        type: 'registration',
        userId,
        credential,
        friendlyName,
      });

      return { success: true, message: result.message };
    } catch (err) {
      const msg = err.message ?? 'Biometric enrollment failed.';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Login with biometric ───────────────────────────────────────────────────
  /**
   * Runs the WebAuthn authentication ceremony and establishes a Supabase session.
   * @param {string} userId - The user's Supabase UUID (must be known before login)
   * @param {object} schoolSettings - Current school context (passed to store after login)
   * @returns {{ success: boolean, user?, role?, error? }}
   */
  const loginWithBiometric = useCallback(async (userId) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get authentication options from server (includes the allowCredentials list)
      const options = await callEdge('webauthn-start', {
        type: 'authentication',
        userId,
      });

      // 2. Trigger OS biometric prompt
      let credential;
      try {
        credential = await startAuthentication({ optionsJSON: options });
      } catch (browserErr) {
        if (browserErr.name === 'NotAllowedError') {
          throw new Error('Biometric login was cancelled.');
        }
        throw new Error(`Biometric prompt failed: ${browserErr.message}`);
      }

      // 3. Send signed assertion to server for verification
      const result = await callEdge('webauthn-verify', {
        type: 'authentication',
        userId,
        credential,
      });

      // 4. Exchange the OTP token_hash for a real Supabase session
      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: result.token_hash,
        type: 'magiclink',
      });

      if (sessionError || !sessionData?.user) {
        throw new Error('Session creation failed after biometric verification.');
      }

      return { success: true, user: sessionData.user };
    } catch (err) {
      const msg = err.message ?? 'Biometric login failed.';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  // ── List enrolled devices ──────────────────────────────────────────────────
  /**
   * Fetches all passkeys registered for the current user (for the Manage Devices UI).
   * Uses the standard Supabase client — RLS ensures users only see their own.
   */
  const listPasskeys = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('user_passkeys')
      .select('id, friendly_name, device_type, backed_up, created_at, last_used_at')
      .order('created_at', { ascending: false });

    if (fetchError) throw new Error(fetchError.message);
    return data ?? [];
  }, []);

  // ── Remove a device ────────────────────────────────────────────────────────
  /**
   * Deletes a specific passkey row. RLS ensures users can only delete their own.
   * @param {string} passkeyId - UUID of the user_passkeys row
   */
  const removePasskey = useCallback(async (passkeyId) => {
    const { error: deleteError } = await supabase
      .from('user_passkeys')
      .delete()
      .eq('id', passkeyId);

    if (deleteError) throw new Error(deleteError.message);
  }, []);

  return {
    loading,
    error,
    isSupported,
    registerPasskey,
    loginWithBiometric,
    listPasskeys,
    removePasskey,
  };
}
