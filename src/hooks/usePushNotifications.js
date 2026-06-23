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
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import firebaseApp from '../config/firebaseClient';

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
          <div id="fcm-toast-title" style="font-weight:700;color:#f1f5f9;margin-bottom:3px;font-size:13px;line-height:1.3;"></div>
          <div id="fcm-toast-body" style="color:#94a3b8;font-size:12px;line-height:1.4;word-break:break-word;"></div>
        </div>
        <button onclick="this.closest('[data-fcm-toast]').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;line-height:1;font-size:18px;flex-shrink:0;">×</button>
      </div>
    `;
    const titleEl = toast.querySelector('#fcm-toast-title');
    const bodyEl = toast.querySelector('#fcm-toast-body');
    if (titleEl) titleEl.textContent = title || 'Notification';
    if (bodyEl) bodyEl.textContent = body || '';
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
    // ── Guard 2: Must have an authenticated user ───────────────────────────
    if (!user?.id) {
      console.info('[FCM] No authenticated user — skipping token registration.');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      // ── WEB / PWA PLATFORM FCM SETUP ──────────────────────────────────────
      if (listenersRegistered.current || isSettingUp.current) return;
      
      let unsubscribeMessage = null;
      
      async function setupWebPush() {
        if (isSettingUp.current) return;
        isSettingUp.current = true;
        
        try {
          const supported = await isSupported();
          if (!supported) {
            console.warn('[FCM] Web Push is not supported in this browser.');
            isSettingUp.current = false;
            return;
          }
          
          const messaging = getMessaging(firebaseApp);
          
          // Request permission
          let permission = Notification.permission;
          if (permission === 'default') {
            permission = await Notification.requestPermission();
          }
          
          if (permission !== 'granted') {
            console.warn('[FCM] Notification permission denied on web.');
            isSettingUp.current = false;
            return;
          }
          
          // Fetch or Register the unified service worker dynamically
          const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';
          const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '';
          const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL || '';
          const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
          const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '';
          const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '';
          const appId = import.meta.env.VITE_FIREBASE_APP_ID || '';

          const swUrl = `/sw.js?apiKey=${encodeURIComponent(apiKey)}` +
            `&authDomain=${encodeURIComponent(authDomain)}` +
            `&databaseURL=${encodeURIComponent(databaseURL)}` +
            `&projectId=${encodeURIComponent(projectId)}` +
            `&storageBucket=${encodeURIComponent(storageBucket)}` +
            `&messagingSenderId=${encodeURIComponent(messagingSenderId)}` +
            `&appId=${encodeURIComponent(appId)}`;

          const reg = await navigator.serviceWorker.register(swUrl);

          // Wait for service worker to finish installing/activating
          const sw = reg.active || reg.installing || reg.waiting;
          if (sw && sw.state !== 'activated') {
            await new Promise((resolve) => {
              const listener = () => {
                if (sw.state === 'activated') {
                  sw.removeEventListener('statechange', listener);
                  resolve();
                }
              };
              sw.addEventListener('statechange', listener);
              // Fallback resolve
              setTimeout(resolve, 5000);
            });
          }
          
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
          if (!vapidKey) {
            console.warn('[FCM] VITE_FIREBASE_VAPID_KEY is missing. Web push cannot be initialized.');
            isSettingUp.current = false;
            return;
          }
          
          const token = await getToken(messaging, {
            serviceWorkerRegistration: reg,
            vapidKey: vapidKey
          });
          
          if (token) {
            console.info('[FCM] Web token received (truncated):', token.substring(0, 20) + '...');
            await saveToken(token);
            listenersRegistered.current = true;
            
            // Listen for foreground messages
            unsubscribeMessage = onMessage(messaging, (payload) => {
              console.info('[FCM] Web foreground notification:', payload);
              const title = payload.notification?.title || payload.data?.title || 'Notification';
              const body = payload.notification?.body || payload.data?.body || '';
              
              // 1. Show custom in-app Toast banner
              showInAppToast(title, body);
              
              // 2. Trigger native OS-level popup alert in foreground
              if (Notification.permission === 'granted') {
                reg.showNotification(title, {
                  body: body,
                  icon: '/icons/icon-192.webp',
                  badge: '/icons/icon-72.webp',
                  data: {
                    route: payload.data?.route || '/'
                  }
                });
              }
              
              window.dispatchEvent(new CustomEvent('sp-push-received', { detail: payload }));
            });
          } else {
            console.warn('[FCM] No web token returned.');
          }
        } catch (err) {
          console.error('[FCM] Web setup failed:', err);
        } finally {
          isSettingUp.current = false;
        }
      }
      
      setupWebPush();
      
      return () => {
        if (unsubscribeMessage) unsubscribeMessage();
        listenersRegistered.current = false;
        isSettingUp.current = false;
      };
    } else {
      // ── NATIVE ANDROID/IOS FCM SETUP ─────────────────────────────────────
      if (listenersRegistered.current || isSettingUp.current) return;

      let registrationListener = null;
      let receivedListener = null;
      let errorListener = null;
      let actionListener = null;

      async function setupPushNotifications() {
        if (isSettingUp.current) return;
        isSettingUp.current = true;

        try {
          let permStatus;
          try {
            permStatus = await PushNotifications.checkPermissions();
          } catch (checkErr) {
            console.warn('[FCM] checkPermissions() failed (likely emulator):', checkErr);
            isSettingUp.current = false;
            return;
          }

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
            return;
          }

          try {
            await PushNotifications.register();
          } catch (regErr) {
            console.error('[FCM] register() failed:', regErr);
            isSettingUp.current = false;
            return;
          }

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

          console.info('[FCM] Push notification setup complete.');

        } catch (err) {
          console.error('[FCM] Unexpected setup failure (non-fatal):', err);
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
        } catch (cleanupErr) {
          console.warn('[FCM] Cleanup error (non-fatal):', cleanupErr);
        }
        listenersRegistered.current = false;
        isSettingUp.current = false;
      };
    }
  }, [user?.id, saveToken]); // saveToken is stable (reads from refs)
}
