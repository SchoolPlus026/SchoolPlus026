// sw.js — Legacy PWA SW (kept for backwards compatibility only)
// The ACTIVE service worker is now /firebase-messaging-sw.js (unified SW).
// This file intentionally does NOT call skipWaiting() so it does not
// block the FCM SW from becoming the active controller.
// It will be phased out once all users' browsers update.
console.log('[sw.js] Loaded but yielding control to firebase-messaging-sw.js');
