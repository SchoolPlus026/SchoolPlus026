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
  const listenersRegistered = useRef(false);
  const tokenSaved = useRef(false);

  // Save (upsert) the FCM token to Supabase
  const saveToken = useCallback(async (token) => {
    if (!user?.id || !token || tokenSaved.current) return;

    const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

    try {
      const { error } = await supabase.rpc('upsert_device_token', {
        p_user_id:    user.id,
        p_school_id:  schoolSettings?.school_id ?? null,
        p_fcm_token:  token,
        p_platform:   platform,
        p_device_name: null, // Could use Capacitor Device plugin for device name
      });

      if (error) {
        console.error('[FCM] Failed to save token to Supabase:', error.message);
      } else {
        tokenSaved.current = true;
        console.info('[FCM] Token saved successfully. Platform:', platform);
      }
    } catch (err) {
      console.error('[FCM] Unexpected error saving token:', err);
    }
  }, [user?.id, schoolSettings?.school_id]);

  useEffect(() => {
    // ── Guard: Only run on native Android/iOS ──────────────────────────────
    // On web (PWA), Capacitor Push Notifications is not available.
    // We skip silently — web push would use a different flow (VAPID).
    if (!Capacitor.isNativePlatform()) {
      console.info('[FCM] Skipping push notification setup on web platform.');
      return;
    }

    // ── Guard: Must have an authenticated user ─────────────────────────────
    if (!user?.id) {
      console.info('[FCM] No authenticated user — skipping token registration.');
      return;
    }

    // ── Guard: Prevent double-registration ────────────────────────────────
    if (listenersRegistered.current) return;
    listenersRegistered.current = true;

    let registrationListener;
    let receivedListener;
    let errorListener;

    async function setupPushNotifications() {
      try {
        // ── Step 1: Request Permission (Android 13+ requires runtime request) ──
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.warn('[FCM] Push notification permission denied by user.');
          return; // Don't break the app — just skip registration
        }

        // ── Step 2: Register with FCM ─────────────────────────────────────
        await PushNotifications.register();

        // ── Step 3: Listen for the FCM Token ──────────────────────────────
        registrationListener = await PushNotifications.addListener(
          'registration',
          (tokenData) => {
            const fcmToken = tokenData.value;
            console.info('[FCM] Device registered. Token (truncated):', fcmToken.substring(0, 20) + '...');
            saveToken(fcmToken);
          }
        );

        // ── Step 4: Handle Foreground Notifications ───────────────────────
        // When a push arrives while the app is OPEN, Capacitor fires this event.
        // The system notification tray is NOT used — we show our own in-app toast.
        receivedListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            console.info('[FCM] Foreground notification received:', notification.title);
            showInAppToast(
              notification.title,
              notification.body
            );
          }
        );

        // ── Step 5: Handle Notification Tap (background → foreground) ─────
        // When user taps a notification in the system tray, this fires.
        // You can use notification.actionId / data for deep linking later.
        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            console.info('[FCM] Notification tapped:', action.notification.title);
            // Future: navigate based on action.notification.data.route
          }
        );

        // ── Step 6: Handle Registration Errors ────────────────────────────
        errorListener = await PushNotifications.addListener(
          'registrationError',
          (err) => {
            console.error('[FCM] Registration error:', err.error);
          }
        );

      } catch (err) {
        console.error('[FCM] Setup failed:', err);
        listenersRegistered.current = false; // Allow retry on next render
      }
    }

    setupPushNotifications();

    // ── Cleanup: Remove all listeners on unmount ───────────────────────────
    return () => {
      registrationListener?.remove();
      receivedListener?.remove();
      errorListener?.remove();
      // Note: we do NOT remove pushNotificationActionPerformed listener
      // because it needs to persist even after component unmounts.
      listenersRegistered.current = false;
    };
  }, [user?.id, saveToken]);
}
