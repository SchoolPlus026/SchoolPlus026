/**
 * usePushNotifications.js
 * ────────────────────────────────────────────────────────────────
 * FCM push notifications for both native (Capacitor) and web/PWA.
 *
 * WEB PUSH ARCHITECTURE:
 *  - Firebase config is baked into /firebase-messaging-sw.js at build time
 *    by the Vite plugin in vite.config.js (no query-param tricks needed).
 *  - getToken() is called WITHOUT a custom serviceWorkerRegistration, so
 *    Firebase SDK finds /firebase-messaging-sw.js automatically (standard).
 *  - This eliminates the AbortError caused by VAPID key validation failures
 *    that occurred with non-standard SW URLs.
 *  - Module-level flags prevent the setup loop caused by React StrictMode
 *    unmounting/remounting effects.
 * ────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import firebaseApp from '../config/firebaseClient';

// ─── Module-level flags ───────────────────────────────────────────────────────
// Using module-level vars (not refs) so they survive React StrictMode's
// unmount→remount cycle. Refs are reset on unmount; module vars are not.
let _webPushSetupDone      = false;
let _webPushSetupInProgress = false;
let _unsubscribeMessage     = null;

// ─── In-app Toast Helper ─────────────────────────────────────────────────────
function showInAppToast(title, body) {
  try {
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
          <div id="fcm-toast-title" style="font-weight:700;color:#f1f5f9;margin-bottom:3px;font-size:13px;line-height:1.3;"></div>
          <div id="fcm-toast-body" style="color:#94a3b8;font-size:12px;line-height:1.4;word-break:break-word;"></div>
        </div>
        <button onclick="this.closest('[data-fcm-toast]').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;line-height:1;font-size:18px;flex-shrink:0;">×</button>
      </div>
    `;
    toast.querySelector('#fcm-toast-title').textContent = title || 'Notification';
    toast.querySelector('#fcm-toast-body').textContent  = body  || '';
    toast.setAttribute('data-fcm-toast', 'true');
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateY(0)';
    });

    const timer = setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 400);
    }, 5000);

    toast.addEventListener('click', () => { clearTimeout(timer); toast.remove(); });
  } catch (_) {
    console.info(`[FCM] ${title}: ${body}`);
  }
}

// ─── Main Hook ───────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { user, schoolSettings } = useAppStore();

  const listenersRegistered = useRef(false);
  const isSettingUp         = useRef(false);
  const tokenSaved          = useRef(false);
  const userRef             = useRef(user);
  const schoolRef           = useRef(schoolSettings);

  useEffect(() => { userRef.current   = user;           }, [user]);
  useEffect(() => { schoolRef.current = schoolSettings; }, [schoolSettings]);

  const saveToken = useCallback(async (token) => {
    const currentUser   = userRef.current;
    const currentSchool = schoolRef.current;
    if (!currentUser?.id || !token || tokenSaved.current) return;

    const platform = Capacitor.getPlatform();
    try {
      const { error } = await supabase.rpc('upsert_device_token', {
        p_user_id:     currentUser.id,
        p_school_id:   currentSchool?.school_id ?? null,
        p_fcm_token:   token,
        p_platform:    platform,
        p_device_name: null,
      });
      if (error) {
        console.error('[FCM] Failed to save token:', error.message);
      } else {
        tokenSaved.current = true;
        console.info('[FCM] ✅ Token saved to Supabase. Platform:', platform);
      }
    } catch (err) {
      console.error('[FCM] Unexpected error saving token:', err);
    }
  }, []);

  useEffect(() => {
    // Guard: no user
    if (!user?.id) {
      console.info('[FCM] No authenticated user — skipping.');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      // ════════════════════════════════════════════════════════════════
      // WEB / PWA PLATFORM
      // ════════════════════════════════════════════════════════════════

      // Module-level guard prevents duplicate setup across StrictMode cycles
      if (_webPushSetupDone || _webPushSetupInProgress) {
        console.info('[FCM] Web push already set up or in progress — skipping.');
        return;
      }

      async function setupWebPush() {
        _webPushSetupInProgress = true;

        try {
          // ── 1. Browser support check ─────────────────────────────────
          const supported = await isSupported();
          if (!supported) {
            console.warn('[FCM] Web push not supported in this browser.');
            return;
          }

          // ── 2. Env var check ─────────────────────────────────────────
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
          if (!vapidKey) {
            console.error('[FCM] ❌ VITE_FIREBASE_VAPID_KEY is not set. Web push cannot start.');
            return;
          }

          const messaging = getMessaging(firebaseApp);

          // ── 3. Notification permission ───────────────────────────────
          let permission = Notification.permission;
          if (permission === 'default') {
            permission = await Notification.requestPermission();
          }
          if (permission !== 'granted') {
            console.warn(
              '[FCM] Notification permission not granted.\n' +
              '→ Browser: Settings → Privacy & Security → Notifications\n' +
              '→ Find this site → set to "Allow" → reload.'
            );
            return;
          }

          // ── 4. Register the PWA caching SW (sw.js) ──────────────────
          // This is the app shell cache SW, registered independently.
          // Firebase messaging uses its OWN standard SW (/firebase-messaging-sw.js)
          // which was generated by the Vite plugin with config baked in.
          if ('serviceWorker' in navigator) {
            try {
              await navigator.serviceWorker.register('/sw.js', { scope: '/' });
              console.info('[FCM] PWA cache SW (sw.js) registered.');
            } catch (swErr) {
              console.warn('[FCM] PWA SW registration failed (non-fatal):', swErr.message);
            }
          }

          // ── 5. Get FCM token ─────────────────────────────────────────
          // CRITICAL: Do NOT pass serviceWorkerRegistration here.
          // Firebase SDK will automatically find and register
          // /firebase-messaging-sw.js (generated by vite.config.js plugin).
          // This is the standard Firebase approach and avoids ALL the
          // VAPID key / AbortError / SW scope issues from custom SW URLs.
          console.info('[FCM] Calling getToken() — Firebase will use /firebase-messaging-sw.js...');
          const token = await getToken(messaging, { vapidKey });

          if (token) {
            console.info('[FCM] ✅ Web FCM token obtained:', token.substring(0, 20) + '...');
            await saveToken(token);
            _webPushSetupDone = true;

            // ── 6. Foreground message handler ────────────────────────
            // FCM SDK does NOT show an OS notification when the page is focused.
            // We must trigger it manually via the service worker.
            _unsubscribeMessage = onMessage(messaging, async (payload) => {
              console.info('[FCM] Foreground message:', payload);
              const title = payload.notification?.title || payload.data?.title || 'SchoolOS+';
              const body  = payload.notification?.body  || payload.data?.body  || '';

              // Always show in-app toast
              showInAppToast(title, body);

              // Also show OS-level native notification via the active SW
              if (Notification.permission === 'granted') {
                try {
                  const reg = await navigator.serviceWorker.ready;
                  await reg.showNotification(title, {
                    body,
                    icon:     '/icons/icon-192.png',
                    badge:    '/icons/icon-72.png',
                    tag:      'schoolos-fg',
                    renotify: true,
                    data:     { route: payload.data?.route || '/' },
                  });
                } catch (notifErr) {
                  console.warn('[FCM] showNotification failed:', notifErr.message);
                }
              }

              window.dispatchEvent(new CustomEvent('sp-push-received', { detail: payload }));
            });

          } else {
            console.warn(
              '[FCM] getToken() returned null/empty.\n' +
              `→ Check Firebase Console → Project Settings → Cloud Messaging\n` +
              `→ Web Push certificates → verify the Key pair matches VITE_FIREBASE_VAPID_KEY.\n` +
              `→ Also verify "${window.location.hostname}" is in Firebase Authorized Domains.`
            );
          }

        } catch (err) {
          console.error('[FCM] Web push setup failed:', err.message, err);

          if (err?.name === 'AbortError') {
            console.error(
              '[FCM] AbortError from Firebase/PushManager.\n' +
              '━━━ MOST LIKELY CAUSE ━━━\n' +
              'The VAPID key in VITE_FIREBASE_VAPID_KEY does not match the Web Push\n' +
              'certificate registered in Firebase Console for this project.\n\n' +
              '━━━ HOW TO FIX ━━━\n' +
              '1. Open: https://console.firebase.google.com\n' +
              '2. Select project: schoolpro-d95a8\n' +
              '3. Go to: ⚙️ Project Settings → Cloud Messaging tab\n' +
              '4. Scroll to "Web configuration" → "Web Push certificates"\n' +
              '5. Copy the "Key pair" value shown there\n' +
              '6. Update GitHub Secret VITE_FIREBASE_VAPID_KEY with that exact value\n' +
              '7. Re-run the GitHub Actions deployment\n\n' +
              `Current VAPID key starts with: ${(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').substring(0, 15)}...`
            );
          }
        } finally {
          _webPushSetupInProgress = false;
        }
      }

      setupWebPush();

      // Cleanup: unsubscribe foreground listener but keep module flags
      // so StrictMode remount doesn't restart setup
      return () => {
        if (_unsubscribeMessage) {
          _unsubscribeMessage();
          _unsubscribeMessage = null;
        }
      };

    } else {
      // ════════════════════════════════════════════════════════════════
      // NATIVE ANDROID / iOS (Capacitor)
      // ════════════════════════════════════════════════════════════════
      if (listenersRegistered.current || isSettingUp.current) return;

      let registrationListener = null;
      let receivedListener     = null;
      let errorListener        = null;
      let actionListener       = null;

      async function setupNativePush() {
        if (isSettingUp.current) return;
        isSettingUp.current = true;

        try {
          let permStatus;
          try {
            permStatus = await PushNotifications.checkPermissions();
          } catch (e) {
            console.warn('[FCM] checkPermissions() failed (emulator?):', e);
            return;
          }

          if (permStatus.receive === 'prompt') {
            try {
              permStatus = await PushNotifications.requestPermissions();
            } catch (e) {
              console.warn('[FCM] requestPermissions() failed:', e);
              return;
            }
          }

          if (permStatus.receive !== 'granted') {
            console.warn('[FCM] Native push permission denied:', permStatus.receive);
            return;
          }

          await PushNotifications.register();
          listenersRegistered.current = true;

          registrationListener = await PushNotifications.addListener('registration', (tokenData) => {
            const fcmToken = tokenData.value;
            console.info('[FCM] Native token:', fcmToken.substring(0, 20) + '...');
            saveToken(fcmToken);
          });

          receivedListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.info('[FCM] Foreground native notification:', notification.title);
            showInAppToast(notification.title, notification.body);
            window.dispatchEvent(new CustomEvent('sp-push-received', { detail: notification }));
          });

          actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.info('[FCM] Notification tapped:', action.notification.title);
          });

          errorListener = await PushNotifications.addListener('registrationError', (err) => {
            console.error('[FCM] Native registration error:', err.error);
          });

          console.info('[FCM] ✅ Native push setup complete.');
        } catch (err) {
          console.error('[FCM] Native setup failed:', err);
          listenersRegistered.current = false;
        } finally {
          isSettingUp.current = false;
        }
      }

      setupNativePush();

      return () => {
        try {
          registrationListener?.remove();
          receivedListener?.remove();
          errorListener?.remove();
          actionListener?.remove();
        } catch (_) {}
        listenersRegistered.current = false;
        isSettingUp.current         = false;
      };
    }
  }, [user?.id, saveToken]);
}
