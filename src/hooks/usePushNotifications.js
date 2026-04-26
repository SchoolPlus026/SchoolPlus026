/**
 * usePushNotifications.js
 * ────────────────────────────────────────────────────────────────
 * Custom hook for Firebase Cloud Messaging (FCM) push notifications
 * using @capacitor/push-notifications v6.
 *
 * Responsibilities:
 *  1. Request Android 13+ POST_NOTIFICATIONS permission at runtime.
 *  2. Register the device with FCM via Capacitor.
 *  3. Capture the FCM registration token.
 *  4. Save / upsert the token to Supabase via the upsert_device_token RPC.
 *  5. Listen for foreground notifications and show an in-app toast.
 *  6. Clean up all listeners on unmount.
 *
 * Usage:
 *   import { usePushNotifications } from '../hooks/usePushNotifications';
 *   // Call inside any authenticated component (after login):
 *   usePushNotifications();
 *
 * ⚠️  Prerequisites:
 *   - google-services.json placed in android/app/
 *   - v25_push_notifications.sql migration run in Supabase
 *   - App built with: npm run cap:build:android && npx cap sync android
 * ────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';

// ─── In-app Toast Helper ─────────────────────────────────────────────────────
// Displays a brief notification banner when the app is foregrounded.
// Falls back gracefully if the browser/WebView doesn't support it.
function showInAppToast(title, body) {
  try {
    // Check if there is already a toast container, reuse it
    let container = document.getElementById('fcm-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'fcm-toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '99999',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
        maxWidth: '340px',
      });
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      background: 'linear-gradient(135deg, rgba(30,27,75,0.97), rgba(15,15,40,0.97))',
      border: '1px solid rgba(99,102,241,0.35)',
      borderRadius: '14px',
      padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(16px)',
      color: '#e2e8f0',
      fontSize: '13px',
      pointerEvents: 'auto',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
      opacity: '0',
      transform: 'translateY(-8px)',
      cursor: 'pointer',
    });

    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#f1f5f9;margin-bottom:3px;font-size:13px;line-height:1.3;">${title || 'Notification'}</div>
          <div style="color:#94a3b8;font-size:12px;line-height:1.4;word-break:break-word;">${body || ''}</div>
        </div>
        <button onclick="this.closest('[data-fcm-toast]').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;line-height:1;font-size:18px;flex-shrink:0;">×</button>
      </div>
    `;
    toast.setAttribute('data-fcm-toast', 'true');

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 400);
    }, 5000);

    toast.addEventListener('click', () => {
      clearTimeout(timer);
      toast.remove();
    });
  } catch (err) {
    // Fallback if DOM manipulation fails
    console.info(`[FCM] ${title}: ${body}`);
  }
}

// ─── Main Hook ───────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { user, schoolSettings } = useAppStore();

  // Use refs to hold mutable state that should not re-trigger useEffect
  const listenersRegistered = useRef(false);
  const isSettingUp = useRef(false);         // prevents concurrent async runs
  const tokenSaved = useRef(false);
  const userRef = useRef(user);
  const schoolRef = useRef(schoolSettings);

  // Keep refs in sync with the latest values without causing effect re-runs
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { schoolRef.current = schoolSettings; }, [schoolSettings]);

  // Save (upsert) the FCM token to Supabase
  // Reads from refs so this callback never needs to be re-created
  const saveToken = useCallback(async (token) => {
    const currentUser = userRef.current;
    const currentSchool = schoolRef.current;

    if (!currentUser?.id || !token || tokenSaved.current) return;

    const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

    try {
      const { error } = await supabase.rpc('upsert_device_token', {
        p_user_id:     currentUser.id,
        p_school_id:   currentSchool?.school_id ?? null,
        p_fcm_token:   token,
        p_platform:    platform,
        p_device_name: null,
      });

      if (error) {
        console.error('[FCM] Failed to save token to Supabase:', error.message);
      } else {
        tokenSaved.current = true;
        console.info('[FCM] Token saved successfully. Platform:', platform);
      }
    } catch (err) {
      // Non-fatal: token save failure should never crash the app
      console.error('[FCM] Unexpected error saving token:', err);
    }
  }, []); // stable — reads from refs, no deps needed

  useEffect(() => {
    // ── Guard 1: Only run on native Android/iOS ────────────────────────────
    // On web (Netlify/PWA), Capacitor Push is unavailable — skip silently.
    if (!Capacitor.isNativePlatform()) {
      console.info('[FCM] Skipping push notification setup on web platform.');
      return;
    }

    // ── Guard 2: Must have an authenticated user ───────────────────────────
    if (!user?.id) {
      console.info('[FCM] No authenticated user — skipping token registration.');
      return;
    }

    // ── Guard 3: Prevent double-registration on re-renders ─────────────────
    if (listenersRegistered.current || isSettingUp.current) return;

    let registrationListener = null;
    let receivedListener = null;
    let errorListener = null;
    let actionListener = null;

    async function setupPushNotifications() {
      // ── Guard 4: Prevent concurrent async executions ─────────────────────
      if (isSettingUp.current) return;
      isSettingUp.current = true;

      try {
        // ── Step 1: Check existing permission status ───────────────────────
        // checkPermissions() itself is safe and never throws on Android 13+
        let permStatus;
        try {
          permStatus = await PushNotifications.checkPermissions();
        } catch (checkErr) {
          console.warn('[FCM] checkPermissions() failed (likely emulator):', checkErr);
          isSettingUp.current = false;
          return;
        }

        // ── Step 2: Request runtime permission if needed ───────────────────
        // POST_NOTIFICATIONS is a runtime permission on Android 13+ (API 33+).
        // The <uses-permission> in AndroidManifest.xml is required FIRST —
        // without it, this call throws a SecurityException → crash.
        if (permStatus.receive === 'prompt') {
          try {
            permStatus = await PushNotifications.requestPermissions();
          } catch (reqErr) {
            console.warn('[FCM] requestPermissions() failed:', reqErr);
            isSettingUp.current = false;
            return;
          }
        }

        if (permStatus.receive !== 'granted') {
          console.warn('[FCM] Push notification permission not granted. Status:', permStatus.receive);
          isSettingUp.current = false;
          return; // User denied — fail gracefully, do NOT crash
        }

        // ── Step 3: Register with FCM ─────────────────────────────────────
        try {
          await PushNotifications.register();
        } catch (regErr) {
          console.error('[FCM] register() failed:', regErr);
          isSettingUp.current = false;
          return;
        }

        // ── Step 4: Attach listeners (only after successful registration) ──
        // We set listenersRegistered.current here so cleanup knows they exist
        listenersRegistered.current = true;

        registrationListener = await PushNotifications.addListener(
          'registration',
          (tokenData) => {
            try {
              const fcmToken = tokenData.value;
              console.info('[FCM] Token received (truncated):', fcmToken.substring(0, 20) + '...');
              saveToken(fcmToken);
            } catch (e) {
              console.error('[FCM] Error in registration handler:', e);
            }
          }
        );

        receivedListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            try {
              console.info('[FCM] Foreground notification:', notification.title);
              showInAppToast(notification.title, notification.body);
            } catch (e) {
              console.error('[FCM] Error in notification handler:', e);
            }
          }
        );

        // NOTE: We keep the action listener alive as a module-level concern;
        // it intentionally outlives the component.
        actionListener = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            try {
              console.info('[FCM] Notification tapped:', action.notification.title);
              // Future: navigate based on action.notification.data.route
            } catch (e) {
              console.error('[FCM] Error in action handler:', e);
            }
          }
        );

        errorListener = await PushNotifications.addListener(
          'registrationError',
          (err) => {
            console.error('[FCM] FCM registration error:', err.error);
          }
        );

        console.info('[FCM] Push notification setup complete.');

      } catch (err) {
        // Top-level safety net — nothing here should propagate to React
        console.error('[FCM] Unexpected setup failure (non-fatal):', err);
        listenersRegistered.current = false;
      } finally {
        isSettingUp.current = false;
      }
    }

    setupPushNotifications();

    // ── Cleanup: Remove listeners on unmount ──────────────────────────────
    return () => {
      try {
        registrationListener?.remove();
        receivedListener?.remove();
        errorListener?.remove();
        // actionListener intentionally NOT removed — needs to survive remounts
      } catch (cleanupErr) {
        console.warn('[FCM] Cleanup error (non-fatal):', cleanupErr);
      }
      listenersRegistered.current = false;
      isSettingUp.current = false;
    };
  }, [user?.id, saveToken]); // saveToken is stable (reads from refs)
}
