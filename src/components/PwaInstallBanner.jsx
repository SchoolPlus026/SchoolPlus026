import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Share2, PlusSquare, ArrowRight, X, Info, Download, Monitor } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [platformInfo, setPlatformInfo] = useState({ isIOS: false, isChrome: false, isSafari: false, isDesktop: false });
  const [visible, setVisible] = useState(false);
  const [apkUrl, setApkUrl] = useState(null);

  // ── Native Notification Permission Prompt with Cooldown ──
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!('Notification' in window)) return;

    const cooldown = 24 * 60 * 60 * 1000; // 24-hour cooldown
    const lastAttempt = localStorage.getItem('sp_notification_prompt_last_attempt');

    if (Notification.permission === 'default') {
      if (!lastAttempt || Date.now() - Number(lastAttempt) > cooldown) {
        const triggerNotificationPrompt = async () => {
          try {
            console.log('[PWA] Triggering native notification permission dialog on gesture...');
            const res = await Notification.requestPermission();
            console.log('[PWA] Notification permission result:', res);
            // Save the attempt time only when we actually trigger the dialog successfully
            localStorage.setItem('sp_notification_prompt_last_attempt', Date.now().toString());
          } catch (err) {
            console.warn('[PWA] Notification permission prompt failed:', err);
          }
        };

        // Fallback: Request on first user interaction (gesture is strictly required on modern browsers)
        const handleGesture = () => {
          if (Notification.permission === 'default') {
            triggerNotificationPrompt();
          }
          cleanup();
        };

        const cleanup = () => {
          window.removeEventListener('click', handleGesture);
          window.removeEventListener('touchstart', handleGesture);
          window.removeEventListener('keydown', handleGesture);
        };

        window.addEventListener('click', handleGesture);
        window.addEventListener('touchstart', handleGesture);
        window.addEventListener('keydown', handleGesture);

        return cleanup;
      }
    }
  }, []);

  const [isInstalled, setIsInstalled] = useState(false);
  const { user } = useAppStore();
  const prevUserRef = useRef(user);

  // Helper: check if app is running in standalone mode or installed via navigator API
  const checkInstallation = async () => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) {
      setIsInstalled(true);
      return true;
    }
    if ('getInstalledRelatedApps' in navigator) {
      try {
        const relatedApps = await navigator.getInstalledRelatedApps();
        const installed = relatedApps.length > 0;
        if (installed) {
          setIsInstalled(true);
          return true;
        }
      } catch (e) {
        console.warn('[PWA] getInstalledRelatedApps failed:', e);
      }
    }
    setIsInstalled(false);
    return false;
  };

  useEffect(() => {
    // 1. Guard: Don't show inside native app
    if (Capacitor.isNativePlatform()) {
      return;
    }

    // Initial check
    checkInstallation();

    // 2. Fetch latest APK url for download link
    setApkUrl('https://jbjtvosvwufimjcvvwcg.supabase.co/storage/v1/object/public/app-updates/SchoolOS_Plus.apk');

    // 3. Detect Platform details
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isMobile = isIOS || isAndroid || /mobi|webos|blackberry|iemobile|opera mini/i.test(ua);
    const isDesktop = !isMobile;
    const isChrome = /chrome|crios/.test(ua);
    const isSafari = /safari/.test(ua) && !isChrome; // Chrome userAgent contains Safari

    setPlatformInfo({ isIOS, isChrome, isSafari, isDesktop });

    // 4. Listen to native browser prompt event (Android / Chrome Desktop)
    const handleInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.deferredPrompt = e; // make it globally accessible
      setIsInstalled(false); // If prompt fires, we are definitely NOT installed (or uninstalled)

      // Only show automatically on mount if logged in and 24h cooldown has passed
      if (useAppStore.getState().user) {
        const dismissedTime = localStorage.getItem('sp_pwa_dismissed');
        if (!dismissedTime || Date.now() - Number(dismissedTime) > 24 * 60 * 60 * 1000) {
          setVisible(true);
        }
      }
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // Listen to appinstalled event (fired when user successfully installs)
    const handleAppInstalled = () => {
      console.info('[PWA] App installed successfully');
      setIsInstalled(true);
      setVisible(false);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Manual show-pwa-install-modal event listener
    const handleShowManual = () => {
      setVisible(true);
    };
    window.addEventListener('show-pwa-install-modal', handleShowManual);

    // If it's iOS (Safari/Chrome), we won't get beforeinstallprompt, so we check status manually
    if (isIOS) {
      setTimeout(async () => {
        const installed = await checkInstallation();
        if (!installed && useAppStore.getState().user) {
          const dismissedTime = localStorage.getItem('sp_pwa_dismissed');
          if (!dismissedTime || Date.now() - Number(dismissedTime) > 24 * 60 * 60 * 1000) {
            setVisible(true);
          }
        }
      }, 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('show-pwa-install-modal', handleShowManual);
    };
  }, []);

  // ── Post-Login Transition Detector ──
  useEffect(() => {
    const handleLoginChange = async () => {
      const isNowLoggedIn = !!user?.id;
      const wasLoggedOut = !prevUserRef.current?.id;
      prevUserRef.current = user;

      if (isNowLoggedIn && wasLoggedOut) {
        console.info('[PWA] Login detected. Checking installation...');
        const installed = await checkInstallation();
        if (!installed && !Capacitor.isNativePlatform()) {
          const activePrompt = deferredPrompt || window.deferredPrompt;
          if (activePrompt) {
            try {
              console.info('[PWA] Triggering native browser install prompt post-login...');
              await activePrompt.prompt();
              const { outcome } = await activePrompt.userChoice;
              console.info(`[PWA] Direct prompt outcome: ${outcome}`);
              setDeferredPrompt(null);
              window.deferredPrompt = null;
              setVisible(false);
            } catch (err) {
              console.warn('[PWA] Direct prompt requires user interaction, displaying card overlay:', err);
              setVisible(true);
            }
          } else {
            console.info('[PWA] Show visual guidance overlay post-login (iOS or no deferred prompt).');
            setVisible(true);
          }
        }
      }
    };
    handleLoginChange();
  }, [user?.id, deferredPrompt]);

  const handleInstallClick = async () => {
    const activePrompt = deferredPrompt || window.deferredPrompt;
    if (activePrompt) {
      // Direct native prompt on Android/Chrome
      try {
        await activePrompt.prompt();
        const { outcome } = await activePrompt.userChoice;
        console.log(`[PWA] Install choice outcome: ${outcome}`);
      } catch (err) {
        console.error('[PWA] Install prompt failed:', err);
      }
      setDeferredPrompt(null);
      window.deferredPrompt = null;
      setVisible(false);
    } else {
      // Show custom step-by-step visual guidance overlay on iOS or Desktop fallback
      setShowOverlay(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('sp_pwa_dismissed', Date.now().toString());
    setVisible(false);
  };

  if (!visible || isInstalled) return null;

  return (
    <div style={styles.overlayBg}>
      <div style={styles.modalCard}>
        {/* Close Button X at Top Right */}
        <button onClick={handleDismiss} className="pwa-btn-close" style={styles.closeBtn} title="Close">
          <X size={20} />
        </button>

        {!showOverlay ? (
          // Main Install Choice Modal
          <div style={styles.content}>
            <div style={styles.iconContainer}>
              {platformInfo.isDesktop ? (
                <Monitor size={32} color="var(--pwa-step-num-text)" />
              ) : (
                <Smartphone size={32} color="var(--pwa-step-num-text)" />
              )}
            </div>
            
            <h3 style={styles.title}>Install SchoolOS+</h3>
            <p style={styles.subtitle}>
              Enjoy a premium, standalone fullscreen experience, faster loading times, and instant notifications.
            </p>

            <div style={styles.buttonGroup}>
              <button onClick={handleInstallClick} className="pwa-btn-install" style={styles.btnInstall}>
                {platformInfo.isDesktop ? '💻 Install App' : '📱 Add to Home Screen (PWA)'}
              </button>
              
              {!platformInfo.isDesktop && apkUrl && (
                <a 
                  href={apkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleDismiss}
                  className="pwa-btn-apk"
                  style={styles.btnApk}
                >
                  <Download size={15} style={{ marginRight: '6px' }} /> Download Android APK
                </a>
              )}
            </div>

            <div style={styles.footer}>
              <Info size={14} color="var(--pwa-text-subtitle)" style={{ marginRight: '6px', flexShrink: 0 }} />
              <span>{platformInfo.isDesktop ? 'Installs instantly as a standalone desktop app.' : 'Installs instantly without using app store account.'}</span>
            </div>
          </div>
        ) : (
          // Onboarding Instructions Overlay (iOS or Desktop Manual Fallback)
          <div style={styles.content}>
            <button onClick={() => setShowOverlay(false)} style={styles.backBtn}>
              ← Back
            </button>

            <div style={styles.overlayHeader}>
              {platformInfo.isDesktop ? (
                <Monitor size={36} color="var(--pwa-step-num-text)" style={{ marginBottom: '10px' }} />
              ) : (
                <Smartphone size={36} color="var(--pwa-step-num-text)" style={{ marginBottom: '10px' }} />
              )}
              <h3 style={styles.title}>{platformInfo.isDesktop ? 'Install App' : 'Add to Home Screen'}</h3>
              <p style={styles.subtitle}>
                {platformInfo.isDesktop ? 'Follow these simple instructions to install SchoolOS+ on your PC.' : 'Follow these simple instructions to install SchoolOS+ on your device.'}
              </p>
            </div>

            <div style={styles.stepsContainer}>
              {platformInfo.isDesktop ? (
                <>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>1</div>
                    <div style={styles.stepText}>
                      Click the <strong>Install</strong> icon (monitor with down arrow or <strong>+</strong> sign) in the right side of your browser's address bar.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>2</div>
                    <div style={styles.stepText}>
                      Or click the browser's <strong>Options</strong> menu (three dots or lines) and select <strong>Save and share</strong> &rarr; <strong>Install page</strong> (or <strong>Install SchoolOS+</strong>).
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>3</div>
                    <div style={styles.stepText}>
                      Confirm the installation in the browser popup. The app will launch as a standalone desktop window!
                    </div>
                  </div>
                </>
              ) : platformInfo.isSafari ? (
                <>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>1</div>
                    <div style={styles.stepText}>
                      Tap the <strong>Share</strong> button <Share2 size={16} color="var(--pwa-step-num-text)" style={{ display: 'inline', margin: '0 4px', verticalAlign: 'text-bottom' }} /> in Safari's bottom toolbar.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>2</div>
                    <div style={styles.stepText}>
                      Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare size={16} color="var(--pwa-step-num-text)" style={{ display: 'inline', margin: '0 4px', verticalAlign: 'text-bottom' }} />.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>3</div>
                    <div style={styles.stepText}>
                      Tap <strong>Add</strong> in the top-right corner. The app icon will appear on your home screen!
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>1</div>
                    <div style={styles.stepText}>
                      Tap the <strong>Options</strong> icon (three dots <strong>...</strong>) in your browser's menu.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>2</div>
                    <div style={styles.stepText}>
                      Tap <strong>Add to Home Screen</strong> or <strong>Install App</strong>.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>3</div>
                    <div style={styles.stepText}>
                      Tap <strong>Add</strong> in the top-right corner. The app icon will appear on your home screen!
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={styles.footer}>
              <Info size={14} color="var(--pwa-text-subtitle)" style={{ marginRight: '6px', flexShrink: 0 }} />
              <span>{platformInfo.isDesktop ? 'Runs as a standalone desktop application.' : 'Runs as a standalone fullscreen native app.'}</span>
            </div>
          </div>
        )}
      </div>
      <style>{`
        /* ── PWA THEME VARIABLES ── */
        :root, [data-theme="dark"], html.dark {
          --pwa-overlay-bg: rgba(5, 5, 10, 0.75);
          --pwa-card-bg: linear-gradient(135deg, #101026, #070714);
          --pwa-card-border: rgba(99, 102, 241, 0.3);
          --pwa-text-title: #f8fafc;
          --pwa-text-subtitle: #94a3b8;
          --pwa-text-step: #cbd5e1;
          --pwa-close-btn-bg: rgba(255, 255, 255, 0.03);
          --pwa-close-btn-border: rgba(255, 255, 255, 0.08);
          --pwa-footer-bg: rgba(15, 23, 42, 0.3);
          --pwa-footer-border: rgba(255, 255, 255, 0.04);
          --pwa-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          --pwa-step-num-bg: rgba(99, 102, 241, 0.15);
          --pwa-step-num-border: rgba(99, 102, 241, 0.3);
          --pwa-step-num-text: #818cf8;
        }
        [data-theme="light"], html.light {
          --pwa-overlay-bg: rgba(244, 247, 251, 0.75);
          --pwa-card-bg: linear-gradient(135deg, #ffffff, #f1f5f9);
          --pwa-card-border: rgba(99, 102, 241, 0.25);
          --pwa-text-title: #0f172a;
          --pwa-text-subtitle: #475569;
          --pwa-text-step: #334155;
          --pwa-close-btn-bg: rgba(0, 0, 0, 0.03);
          --pwa-close-btn-border: rgba(0, 0, 0, 0.08);
          --pwa-footer-bg: rgba(226, 232, 240, 0.4);
          --pwa-footer-border: rgba(0, 0, 0, 0.04);
          --pwa-shadow: 0 20px 50px rgba(99, 102, 241, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.8);
          --pwa-step-num-bg: rgba(79, 70, 229, 0.08);
          --pwa-step-num-border: rgba(79, 70, 229, 0.2);
          --pwa-step-num-text: #4f46e5;
        }

        @keyframes pwaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pwaZoomIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .pwa-btn-install:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45) !important;
          filter: brightness(1.1);
        }
        .pwa-btn-apk:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4) !important;
          filter: brightness(1.1);
        }
        .pwa-btn-close:hover {
          background: var(--pwa-close-btn-border) !important;
          color: var(--pwa-text-title) !important;
          transform: rotate(90deg);
        }
      `}</style>
    </div>
  );
}

const styles = {
  overlayBg: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'var(--pwa-overlay-bg)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    animation: 'pwaFadeIn 0.25s ease-out',
  },
  modalCard: {
    width: '100%',
    maxWidth: '420px',
    background: 'var(--pwa-card-bg)',
    border: '1px solid var(--pwa-card-border)',
    borderRadius: '24px',
    padding: '28px',
    boxShadow: 'var(--pwa-shadow)',
    position: 'relative',
    animation: 'pwaZoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    boxSizing: 'border-box',
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'var(--pwa-close-btn-bg)',
    border: '1px solid var(--pwa-close-btn-border)',
    color: 'var(--pwa-text-subtitle)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--pwa-step-num-text)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    padding: '0 0 12px 0',
    display: 'flex',
    alignItems: 'center',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'var(--pwa-step-num-bg)',
    border: '1px solid var(--pwa-step-num-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 900,
    color: 'var(--pwa-text-title)',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--pwa-text-subtitle)',
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    marginBottom: '20px',
  },
  btnInstall: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    boxShadow: '0 6px 20px rgba(99, 102, 241, 0.3)',
  },
  btnApk: {
    background: 'linear-gradient(135deg, #059669, #10b981)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    padding: '14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.25)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--pwa-footer-bg)',
    border: '1px solid var(--pwa-footer-border)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '11px',
    color: 'var(--pwa-text-subtitle)',
    lineHeight: 1.4,
    width: '100%',
    boxSizing: 'border-box',
  },
  overlayHeader: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  stepsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginBottom: '24px',
    width: '100%',
    textAlign: 'left',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  stepNum: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: 'var(--pwa-step-num-bg)',
    border: '1px solid var(--pwa-step-num-border)',
    color: 'var(--pwa-step-num-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 800,
    flexShrink: 0,
  },
  stepText: {
    fontSize: '12.5px',
    color: 'var(--pwa-text-step)',
    lineHeight: 1.45,
  },
};
