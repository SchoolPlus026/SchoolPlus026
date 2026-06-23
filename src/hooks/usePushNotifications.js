/**
 * usePushNotifications.js
 * ────────────────────────────────────────────────────────────────
 * FCM push notifications for native (Capacitor) and Web/PWA.
 *
 * WEB PUSH ARCHITECTURE (why it works this way):
 *
 *  Problem: Browsers only allow ONE active service worker per scope '/'.
 *  If sw.js AND firebase-messaging-sw.js both target '/', sw.js (with
 *  skipWaiting) blocks firebase-messaging-sw.js in "waiting" state.
 *  When getToken() tries to use the FCM SW, it has no active worker →
 *  AbortError: "Subscription failed – no active Service Worker".
 *
 *  Solution:
 *  - One unified SW: /firebase-messaging-sw.js handles BOTH messaging + caching.
 *  - This hook explicitly registers it, waits for it to become ACTIVE, then
 *    passes the registration directly to getToken() — no auto-discovery.
 *  - Module-level flags prevent the StrictMode double-mount setup loop.
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
// These survive React StrictMode's unmount→remount cycle (refs do not).
let _setupDone       = false;
let _setupInProgress = false;
let _unsubscribe     = null;

// ─── Wait for a specific SW registration to become active ────────────────────
// Sends SKIP_WAITING so it doesn't wait for old SW to die,
// then waits for the 'activated' state before returning.
async function waitForSWActivation(registration) {
  if (registration.active) return; // Already active, nothing to do

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error('Service worker activation timed out after 15s')),
      15000
    );

    // The installing or waiting worker — tell it to skip waiting immediately
    const pendingSW = registration.installing || registration.waiting;
    if (pendingSW) {
      pendingSW.postMessage({ type: 'SKIP_WAITING' });

      const onStateChange = () => {
        if (pendingSW.state === 'activated') {
          pendingSW.removeEventListener('statechange', onStateChange);
          clearTimeout(timeoutId);
          resolve();
        }
        if (pendingSW.state === 'redundant') {
          pendingSW.removeEventListener('statechange', onStateChange);
          clearTimeout(timeoutId);
          reject(new Error('Service worker became redundant'));
        }
      };
      pendingSW.addEventListener('statechange', onStateChange);
    } else {
      // No installing/waiting worker — check controllerchange on navigator.serviceWorker
      const onControllerChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        clearTimeout(timeoutId);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    }
  });
}

// ─── In-app Toast ─────────────────────────────────────────────────────────────
function showInAppToast(title, body) {
  try {
    let container = document.getElementById('fcm-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'fcm-toast-container';
      Object.assign(container.style, {
        position: 'fixed', top: '16px', right: '16px', zIndex: '99999',
        display: 'flex', flexDirection: 'column', gap: '10px',
        pointerEvents: 'none', maxWidth: '340px',
      });
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      background: 'linear-gradient(135deg, rgba(30,27,75,0.97), rgba(15,15,40,0.97))',
      border: '1px solid rgba(99,102,241,0.35)', borderRadius: '14px',
      padding: '14px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(16px)', color: '#e2e8f0', fontSize: '13px',
      pointerEvents: 'auto', transition: 'opacity 0.4s ease, transform 0.4s ease',
      opacity: '0', transform: 'translateY(-8px)', cursor: 'pointer',
    });
    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="t" style="font-weight:700;color:#f1f5f9;margin-bottom:3px;font-size:13px;"></div>
          <div class="b" style="color:#94a3b8;font-size:12px;line-height:1.4;word-break:break-word;"></div>
        </div>
        <button onclick="this.closest('[data-fcm-toast]').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;font-size:18px;flex-shrink:0;">×</button>
      </div>`;
    toast.querySelector('.t').textContent = title || 'Notification';
    toast.querySelector('.b').textContent = body  || '';
    toast.setAttribute('data-fcm-toast', 'true');
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
    const t = setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-8px)'; setTimeout(() => toast.remove(), 400); }, 5000);
    toast.addEventListener('click', () => { clearTimeout(t); toast.remove(); });
  } catch (_) { console.info(`[FCM] ${title}: ${body}`); }
}

// ─── Main Hook ────────────────────────────────────────────────────────────────
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
    const u = userRef.current;
    const s = schoolRef.current;
    if (!u?.id || !token || tokenSaved.current) return;
    const platform = Capacitor.getPlatform();
    try {
      const { error } = await supabase.rpc('upsert_device_token', {
        p_user_id: u.id, p_school_id: s?.school_id ?? null,
        p_fcm_token: token, p_platform: platform, p_device_name: null,
      });
      if (error) { console.error('[FCM] Token save failed:', error.message); }
      else        { tokenSaved.current = true; console.info('[FCM] ✅ Token saved. Platform:', platform); }
    } catch (err) { console.error('[FCM] Token save error:', err); }
  }, []);

  useEffect(() => {
    if (!user?.id) { console.info('[FCM] No user — skipping.'); return; }

    if (!Capacitor.isNativePlatform()) {
      // ═══════════════════════════════════════════════════════════
      // WEB / PWA
      // ═══════════════════════════════════════════════════════════
      if (_setupDone || _setupInProgress) {
        console.info('[FCM] Web push already set up or in progress — skipping.');
        return;
      }

      async function setupWebPush() {
        _setupInProgress = true;
        try {
          // 1. Browser support
          if (!await isSupported()) { console.warn('[FCM] Web push not supported.'); return; }

          // 2. Env vars
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
          const apiKey   = import.meta.env.VITE_FIREBASE_API_KEY   || '';
          if (!vapidKey || !apiKey) {
            console.error('[FCM] ❌ Missing VITE_FIREBASE_VAPID_KEY or VITE_FIREBASE_API_KEY'); return;
          }

          // 3. Permission
          let perm = Notification.permission;
          if (perm === 'default') perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            console.warn('[FCM] Permission denied.\n→ Go to browser Settings → Notifications → Allow for this site → Reload.');
            return;
          }

          const messaging = getMessaging(firebaseApp);

          // 4. ── CORE FIX ──────────────────────────────────────────────────
          // Explicitly register the unified firebase-messaging-sw.js.
          // Do NOT let Firebase auto-discover it — we must control registration
          // to ensure it becomes ACTIVE before calling getToken().
          //
          // WHY: If sw.js was previously registered at scope '/', it blocks
          // firebase-messaging-sw.js in "waiting" state. getToken() then fails
          // with "no active Service Worker" because the FCM SW can't activate.
          //
          // FIX SEQUENCE:
          //  a) Unregister any old sw.js that may be blocking
          //  b) Register firebase-messaging-sw.js
          //  c) Force skipWaiting via postMessage
          //  d) Wait until it is confirmed ACTIVE
          //  e) Pass the registration to getToken() — no auto-discovery

          // a) Unregister legacy sw.js if it's blocking
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) {
              const script = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
              if (script.includes('/sw.js') && !script.includes('firebase-messaging-sw')) {
                console.info('[FCM] Unregistering old sw.js:', script);
                await reg.unregister();
              }
            }
          } catch (e) { console.warn('[FCM] SW unregister (non-fatal):', e.message); }

          // b) Register the unified FCM+cache SW
          console.info('[FCM] Registering /firebase-messaging-sw.js...');
          const fcmReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
          console.info('[FCM] Registered. Active:', !!fcmReg.active, '| Installing:', !!fcmReg.installing, '| Waiting:', !!fcmReg.waiting);

          // c+d) Wait for it to become the active controlling SW
          if (!fcmReg.active) {
            console.info('[FCM] Waiting for firebase-messaging-sw.js to activate...');
            await waitForSWActivation(fcmReg);
            console.info('[FCM] ✅ firebase-messaging-sw.js is now active.');
          } else {
            console.info('[FCM] ✅ firebase-messaging-sw.js already active.');
          }

          // e) Get FCM token — pass the registration explicitly
          //    This avoids Firebase auto-registering a new SW and getting confused
          console.info('[FCM] Calling getToken() with explicit serviceWorkerRegistration...');
          const token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: fcmReg,
          });

          if (token) {
            console.info('[FCM] ✅ Token obtained:', token.substring(0, 20) + '...');
            await saveToken(token);
            _setupDone = true;

            // 5. Foreground message handler
            // Browser won't auto-show notification when tab is focused —
            // we manually trigger an OS-level popup via the SW.
            _unsubscribe = onMessage(messaging, async (payload) => {
              console.info('[FCM] Foreground message:', payload);
              const title = payload.notification?.title || payload.data?.title || 'SchoolOS+';
              const body  = payload.notification?.body  || payload.data?.body  || '';

              showInAppToast(title, body);

              if (Notification.permission === 'granted') {
                try {
                  await fcmReg.showNotification(title, {
                    body, icon: '/icons/icon-192.png', badge: '/icons/icon-72.png',
                    tag: 'schoolos-fg', renotify: true,
                    data: { route: payload.data?.route || '/' },
                  });
                } catch (e) { console.warn('[FCM] showNotification failed:', e.message); }
              }

              window.dispatchEvent(new CustomEvent('sp-push-received', { detail: payload }));
            });

          } else {
            console.warn(
              '[FCM] getToken() returned null.\n' +
              `→ Verify VAPID key in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.\n` +
              `→ Current key starts: ${vapidKey.substring(0, 15)}...`
            );
          }

        } catch (err) {
          console.error('[FCM] Web setup failed:', err.message);
          console.error('[FCM] Full error:', err);
        } finally {
          _setupInProgress = false;
        }
      }

      setupWebPush();

      return () => {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        // Do NOT reset _setupDone/_setupInProgress — must survive StrictMode remount
      };

    } else {
      // ═══════════════════════════════════════════════════════════
      // NATIVE (Android / iOS via Capacitor)
      // ═══════════════════════════════════════════════════════════
      if (listenersRegistered.current || isSettingUp.current) return;

      let regL = null, recvL = null, errL = null, actL = null;

      async function setupNative() {
        if (isSettingUp.current) return;
        isSettingUp.current = true;
        try {
          let perm;
          try { perm = await PushNotifications.checkPermissions(); }
          catch (e) { console.warn('[FCM] checkPermissions failed:', e); return; }

          if (perm.receive === 'prompt') {
            try { perm = await PushNotifications.requestPermissions(); }
            catch (e) { console.warn('[FCM] requestPermissions failed:', e); return; }
          }
          if (perm.receive !== 'granted') { console.warn('[FCM] Native permission denied:', perm.receive); return; }

          await PushNotifications.register();
          listenersRegistered.current = true;

          regL  = await PushNotifications.addListener('registration', (d) => { console.info('[FCM] Native token:', d.value.substring(0,20)+'...'); saveToken(d.value); });
          recvL = await PushNotifications.addListener('pushNotificationReceived', (n) => { showInAppToast(n.title, n.body); window.dispatchEvent(new CustomEvent('sp-push-received', { detail: n })); });
          actL  = await PushNotifications.addListener('pushNotificationActionPerformed', (a) => { console.info('[FCM] Tapped:', a.notification.title); });
          errL  = await PushNotifications.addListener('registrationError', (e) => { console.error('[FCM] Native reg error:', e.error); });

          console.info('[FCM] ✅ Native push ready.');
        } catch (err) {
          console.error('[FCM] Native setup failed:', err);
          listenersRegistered.current = false;
        } finally { isSettingUp.current = false; }
      }

      setupNative();

      return () => {
        try { regL?.remove(); recvL?.remove(); errL?.remove(); actL?.remove(); } catch (_) {}
        listenersRegistered.current = false; isSettingUp.current = false;
      };
    }
  }, [user?.id, saveToken]);
}
