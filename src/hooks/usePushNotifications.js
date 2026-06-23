/**
 * usePushNotifications.js
 * ────────────────────────────────────────────────────────────────
 * Custom hook for Firebase Cloud Messaging (FCM) push notifications.
 * Handles both native (Android/iOS via Capacitor) and web/PWA (via Web SDK).
 *
 * Responsibilities:
 *  1. Request notification permission (Android 13+ / Browser).
 *  2. Register device with FCM and capture the FCM token.
 *  3. Save / upsert the token to Supabase via the upsert_device_token RPC.
 *  4. Listen for foreground notifications and show OS-level popup + in-app toast.
 *  5. Clean up all listeners on unmount.
 *
 * Web push critical notes:
 *  - Service Worker is registered with Firebase config injected via query params
 *    (SW files cannot access import.meta.env directly).
 *  - Stale push subscriptions are unsubscribed before getToken() to prevent
 *    AbortError: "Registration failed - push service error" caused by VAPID key
 *    mismatches between the old subscription and the current key.
 *  - Bare SWs (registered without Firebase config) are unregistered first.
 * ────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import firebaseApp from '../config/firebaseClient';

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
    const titleEl = toast.querySelector('#fcm-toast-title');
    const bodyEl  = toast.querySelector('#fcm-toast-body');
    if (titleEl) titleEl.textContent = title || 'Notification';
    if (bodyEl)  bodyEl.textContent  = body  || '';
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

    toast.addEventListener('click', () => {
      clearTimeout(timer);
      toast.remove();
    });
  } catch (err) {
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

  // ── Token save helper (reads from refs — stable, no re-create needed) ──────
  const saveToken = useCallback(async (token) => {
    const currentUser   = userRef.current;
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
        console.info('[FCM] ✅ Token saved. Platform:', platform);
      }
    } catch (err) {
      console.error('[FCM] Unexpected error saving token:', err);
    }
  }, []);

  // ── Main effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Reset flags whenever the user changes (handles logout → new user login)
    tokenSaved.current        = false;
    listenersRegistered.current = false;

    if (!user?.id) {
      console.info('[FCM] No authenticated user — skipping token registration.');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      // ════════════════════════════════════════════════════════════════════
      // WEB / PWA FCM SETUP
      // ════════════════════════════════════════════════════════════════════
      if (listenersRegistered.current || isSettingUp.current) return;

      let unsubscribeMessage = null;

      async function setupWebPush() {
        if (isSettingUp.current) return;
        isSettingUp.current = true;

        try {
          // Step 1: Check browser support
          const supported = await isSupported();
          if (!supported) {
            console.warn('[FCM] Web Push is not supported in this browser.');
            return;
          }

          // Step 2: Early env-var validation — fail fast before any network call
          const apiKey            = import.meta.env.VITE_FIREBASE_API_KEY            || '';
          const authDomain        = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || '';
          const databaseURL       = import.meta.env.VITE_FIREBASE_DATABASE_URL       || '';
          const projectId         = import.meta.env.VITE_FIREBASE_PROJECT_ID         || '';
          const storageBucket     = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || '';
          const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| '';
          const appId             = import.meta.env.VITE_FIREBASE_APP_ID             || '';
          const vapidKey          = import.meta.env.VITE_FIREBASE_VAPID_KEY          || '';

          if (!apiKey || !vapidKey || !messagingSenderId || !appId) {
            console.error(
              '[FCM] ❌ Missing required Firebase env vars.\n' +
              `apiKey: ${!!apiKey}, vapidKey: ${!!vapidKey}, ` +
              `messagingSenderId: ${!!messagingSenderId}, appId: ${!!appId}`
            );
            return;
          }

          const messaging = getMessaging(firebaseApp);

          // Step 3: Request OS notification permission
          let permission = Notification.permission;
          if (permission === 'default') {
            permission = await Notification.requestPermission();
          }

          if (permission !== 'granted') {
            console.warn(
              '[FCM] Notification permission denied.\n' +
              '→ To fix: Open browser Settings → Privacy & Security → Notifications\n' +
              '→ Find this site → change to "Allow" → reload the page.'
            );
            return;
          }

          // Step 4: Build SW URL with Firebase config embedded as query params
          // Service workers cannot read import.meta.env (no bundler access),
          // so we pass all Firebase config through the URL query string.
          const swUrl = `/sw.js?apiKey=${encodeURIComponent(apiKey)}` +
            `&authDomain=${encodeURIComponent(authDomain)}` +
            `&databaseURL=${encodeURIComponent(databaseURL)}` +
            `&projectId=${encodeURIComponent(projectId)}` +
            `&storageBucket=${encodeURIComponent(storageBucket)}` +
            `&messagingSenderId=${encodeURIComponent(messagingSenderId)}` +
            `&appId=${encodeURIComponent(appId)}`;

          // Step 5: Unregister any "bare" SW that was installed WITHOUT Firebase config.
          // A bare SW (no apiKey in its scriptURL) cannot initialize Firebase Messaging,
          // so getToken() would fail or return null if it were the controlling SW.
          const existingRegs = await navigator.serviceWorker.getRegistrations();
          for (const existingReg of existingRegs) {
            const script =
              existingReg.active?.scriptURL ||
              existingReg.installing?.scriptURL ||
              existingReg.waiting?.scriptURL || '';
            if (script.includes('/sw.js') && !script.includes('apiKey=')) {
              console.info('[FCM] Unregistering bare SW (missing Firebase config):', script);
              await existingReg.unregister();
            }
          }

          // Step 6: Register our Firebase-configured SW
          const newReg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
          console.info('[FCM] SW registered at scope:', newReg.scope);

          // Step 7: Wait for the SW to be fully active and controlling this page.
          // navigator.serviceWorker.ready resolves ONLY when a SW is in 'activated'
          // state and controlling this client — far more reliable than statechange.
          const readyReg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('SW ready timeout after 12s')), 12000)
            ),
          ]);
          console.info('[FCM] ✅ Service worker active and controlling page.');

          // Step 8: ── CRITICAL FIX ──────────────────────────────────────────
          // Clear any existing push subscription BEFORE calling getToken().
          //
          // ROOT CAUSE OF AbortError: "Registration failed - push service error":
          // The browser's PushManager already has a subscription tied to a DIFFERENT
          // VAPID key (from a previous build, old key, or different origin).
          // When Firebase's getToken() calls PushManager.subscribe({ applicationServerKey })
          // internally, the push service detects the VAPID key mismatch and rejects it
          // with an AbortError.
          //
          // FIX: Explicitly unsubscribe() first, forcing getToken() to create a
          // completely fresh subscription with the correct current VAPID key.
          try {
            const existingSub = await readyReg.pushManager.getSubscription();
            if (existingSub) {
              console.info('[FCM] Clearing stale push subscription (VAPID key may have changed)...');
              await existingSub.unsubscribe();
              console.info('[FCM] Stale subscription cleared. Creating fresh one...');
            } else {
              console.info('[FCM] No existing push subscription found. Creating new one...');
            }
          } catch (subErr) {
            // Non-fatal — if clearing fails, getToken() might still succeed
            console.warn('[FCM] Could not clear existing subscription (non-fatal):', subErr.message);
          }

          // Step 9: Get the FCM registration token
          console.info('[FCM] Calling getToken()...');
          const token = await getToken(messaging, {
            serviceWorkerRegistration: readyReg,
            vapidKey,
          });

          if (token) {
            console.info('[FCM] ✅ Web FCM token obtained (truncated):', token.substring(0, 20) + '...');
            await saveToken(token);
            listenersRegistered.current = true;

            // Step 10: Listen for foreground messages
            // When the app tab is OPEN (foreground), Firebase SDK delivers the message
            // to onMessage() — it does NOT automatically show an OS notification.
            // We must manually trigger one via ServiceWorkerRegistration.showNotification().
            unsubscribeMessage = onMessage(messaging, (payload) => {
              console.info('[FCM] Foreground message received:', payload);
              const title = payload.notification?.title || payload.data?.title || 'SchoolOS+ Notification';
              const body  = payload.notification?.body  || payload.data?.body  || '';

              // 1. Show custom in-app toast banner (always)
              showInAppToast(title, body);

              // 2. Show native OS-level notification popup via Service Worker.
              //    This is the key call that makes it appear in the browser's
              //    notification tray even when the tab is focused.
              if (Notification.permission === 'granted') {
                readyReg.showNotification(title, {
                  body,
                  icon:     '/icons/icon-192.png',
                  badge:    '/icons/icon-72.png',
                  tag:      'schoolos-fg-notification',
                  renotify: true,
                  data:     { route: payload.data?.route || '/' },
                }).catch(e => console.warn('[FCM] showNotification failed:', e));
              }

              window.dispatchEvent(new CustomEvent('sp-push-received', { detail: payload }));
            });
          } else {
            console.warn(
              '[FCM] getToken() returned empty/null.\n' +
              '→ Check: Firebase Console → Project Settings → Web app → Authorized domains\n' +
              `→ Ensure "${window.location.hostname}" is listed.\n` +
              '→ Also verify VAPID key matches the Web Push certificate in Firebase Console.'
            );
          }
        } catch (err) {
          console.error('[FCM] Web push setup failed:', err);

          if (err?.name === 'AbortError') {
            console.error(
              '[FCM] AbortError: PushManager.subscribe() rejected by browser push service.\n' +
              '→ Root cause: Stale subscription with mismatched VAPID key.\n' +
              '→ Fix: Reload the page — the stale subscription auto-cleanup should handle it.\n' +
              '→ Manual fix: DevTools → Application → Service Workers → Unregister all → Reload.'
            );
          }

          if (err?.message?.includes('403') || err?.code === 'installations/request-failed') {
            console.error(
              '[FCM] 403 from Firebase Installations API.\n' +
              '→ Verify Firebase Web App credentials match the project.\n' +
              '→ Check VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID are the WEB app credentials\n' +
              '   (not Android). Go to Firebase Console → Project Settings → Your apps → Web app.'
            );
          }
        } finally {
          isSettingUp.current = false;
        }
      }

      setupWebPush();

      return () => {
        if (unsubscribeMessage) unsubscribeMessage();
        listenersRegistered.current = false;
        isSettingUp.current         = false;
      };

    } else {
      // ════════════════════════════════════════════════════════════════════
      // NATIVE ANDROID / iOS FCM SETUP (via Capacitor)
      // ════════════════════════════════════════════════════════════════════
      if (listenersRegistered.current || isSettingUp.current) return;

      let registrationListener = null;
      let receivedListener     = null;
      let errorListener        = null;
      let actionListener       = null;

      async function setupPushNotifications() {
        if (isSettingUp.current) return;
        isSettingUp.current = true;

        try {
          let permStatus;
          try {
            permStatus = await PushNotifications.checkPermissions();
          } catch (checkErr) {
            console.warn('[FCM] checkPermissions() failed (likely emulator):', checkErr);
            return;
          }

          if (permStatus.receive === 'prompt') {
            try {
              permStatus = await PushNotifications.requestPermissions();
            } catch (reqErr) {
              console.warn('[FCM] requestPermissions() failed:', reqErr);
              return;
            }
          }

          if (permStatus.receive !== 'granted') {
            console.warn('[FCM] Push notification permission not granted. Status:', permStatus.receive);
            return;
          }

          try {
            await PushNotifications.register();
          } catch (regErr) {
            console.error('[FCM] register() failed:', regErr);
            return;
          }

          listenersRegistered.current = true;

          registrationListener = await PushNotifications.addListener(
            'registration',
            (tokenData) => {
              try {
                const fcmToken = tokenData.value;
                console.info('[FCM] Native token received (truncated):', fcmToken.substring(0, 20) + '...');
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
                console.info('[FCM] Foreground native notification:', notification.title);
                showInAppToast(notification.title, notification.body);
                window.dispatchEvent(new CustomEvent('sp-push-received', { detail: notification }));
              } catch (e) {
                console.error('[FCM] Error in notification handler:', e);
              }
            }
          );

          actionListener = await PushNotifications.addListener(
            'pushNotificationActionPerformed',
            (action) => {
              try {
                console.info('[FCM] Notification tapped:', action.notification.title);
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

          console.info('[FCM] ✅ Native push notification setup complete.');

        } catch (err) {
          console.error('[FCM] Unexpected native setup failure (non-fatal):', err);
          listenersRegistered.current = false;
        } finally {
          isSettingUp.current = false;
        }
      }

      setupPushNotifications();

      return () => {
        try {
          registrationListener?.remove();
          receivedListener?.remove();
          errorListener?.remove();
          actionListener?.remove();
        } catch (cleanupErr) {
          console.warn('[FCM] Cleanup error (non-fatal):', cleanupErr);
        }
        listenersRegistered.current = false;
        isSettingUp.current         = false;
      };
    }
  }, [user?.id, saveToken]);
}
