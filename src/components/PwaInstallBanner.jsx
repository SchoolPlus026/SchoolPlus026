import React, { useState, useEffect } from 'react';
import { Smartphone, Share2, PlusSquare, ArrowRight, X, Info, Download } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../config/supabaseClient';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [platformInfo, setPlatformInfo] = useState({ isIOS: false, isChrome: false, isSafari: false });
  const [visible, setVisible] = useState(false);
  const [apkUrl, setApkUrl] = useState(null);

  useEffect(() => {
    // 1. Guard: Don't show inside native app or if already running in standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (Capacitor.isNativePlatform() || isStandalone) {
      return;
    }

    // 2. Fetch latest APK url for download link
    supabase.from('app_versions')
      .select('apk_url')
      .order('version_code', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.apk_url) setApkUrl(data.apk_url);
      });

    // 3. Detect Platform details
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isChrome = /chrome|crios/.test(ua);
    const isSafari = /safari/.test(ua) && !isChrome; // Chrome userAgent contains Safari

    setPlatformInfo({ isIOS, isChrome, isSafari });

    // 4. Listen to native browser prompt event (Android / Chrome Desktop)
    const handleInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.deferredPrompt = e; // make it globally accessible
      
      // Don't show automatically if user recently dismissed it
      const dismissedTime = localStorage.getItem('sp_pwa_dismissed');
      if (dismissedTime && Date.now() - Number(dismissedTime) < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // Manual show-pwa-install-modal event listener
    const handleShowManual = () => {
      setVisible(true);
    };
    window.addEventListener('show-pwa-install-modal', handleShowManual);

    // If it's iOS (Safari/Chrome), we won't get beforeinstallprompt, so we display the banner manually
    if (isIOS) {
      const dismissedTime = localStorage.getItem('sp_pwa_dismissed');
      if (!dismissedTime || Date.now() - Number(dismissedTime) > 7 * 24 * 60 * 60 * 1000) {
        const timer = setTimeout(() => {
          setVisible(true);
        }, 4000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('show-pwa-install-modal', handleShowManual);
    };
  }, []);

  const handleInstallClick = async () => {
    const activePrompt = deferredPrompt || window.deferredPrompt;
    if (activePrompt) {
      // Direct native prompt on Android/Chrome
      activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      console.log(`[PWA] Install choice outcome: ${outcome}`);
      setDeferredPrompt(null);
      window.deferredPrompt = null;
      setVisible(false);
    } else {
      // Show custom step-by-step visual guidance overlay on iOS
      setShowOverlay(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('sp_pwa_dismissed', Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={styles.overlayBg}>
      <div style={styles.modalCard}>
        {/* Close Button X at Top Right */}
        <button onClick={handleDismiss} style={styles.closeBtn} title="Close">
          <X size={20} />
        </button>

        {!showOverlay ? (
          // Main Install Choice Modal
          <div style={styles.content}>
            <div style={styles.iconContainer}>
              <Smartphone size={32} color="#818cf8" />
            </div>
            
            <h3 style={styles.title}>Install SchoolOS+</h3>
            <p style={styles.subtitle}>
              Enjoy a premium, standalone fullscreen experience, faster loading times, and instant notifications.
            </p>

            <div style={styles.buttonGroup}>
              <button onClick={handleInstallClick} style={styles.btnInstall}>
                📱 Add to Home Screen (PWA)
              </button>
              
              {apkUrl && (
                <a 
                  href={apkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleDismiss}
                  style={styles.btnApk}
                >
                  <Download size={15} style={{ marginRight: '6px' }} /> Download Android APK
                </a>
              )}
            </div>

            <div style={styles.footer}>
              <Info size={14} color="#94a3b8" style={{ marginRight: '6px', flexShrink: 0 }} />
              <span>Installs instantly without using app store account.</span>
            </div>
          </div>
        ) : (
          // iOS Onboarding Instructions Overlay
          <div style={styles.content}>
            <button onClick={() => setShowOverlay(false)} style={styles.backBtn}>
              ← Back
            </button>

            <div style={styles.overlayHeader}>
              <Smartphone size={36} color="#818cf8" style={{ marginBottom: '10px' }} />
              <h3 style={styles.title}>Add to Home Screen</h3>
              <p style={styles.subtitle}>Follow these simple instructions to install SchoolOS+ on your device.</p>
            </div>

            <div style={styles.stepsContainer}>
              {platformInfo.isSafari ? (
                <>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>1</div>
                    <div style={styles.stepText}>
                      Tap the <strong>Share</strong> button <Share2 size={16} color="#818cf8" style={{ display: 'inline', margin: '0 4px', verticalAlign: 'text-bottom' }} /> in Safari's bottom toolbar.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>2</div>
                    <div style={styles.stepText}>
                      Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare size={16} color="#818cf8" style={{ display: 'inline', margin: '0 4px', verticalAlign: 'text-bottom' }} />.
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
                </>
              )}
              <div style={styles.stepRow}>
                <div style={styles.stepNum}>3</div>
                <div style={styles.stepText}>
                  Tap <strong>Add</strong> in the top-right corner. The app icon will appear on your home screen!
                </div>
              </div>
            </div>

            <div style={styles.footer}>
              <Info size={14} color="#94a3b8" style={{ marginRight: '6px', flexShrink: 0 }} />
              <span>Runs as a standalone fullscreen native app.</span>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pwaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pwaZoomIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
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
    background: 'rgba(5, 5, 10, 0.75)',
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
    background: 'linear-gradient(135deg, #101026, #070714)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: '24px',
    padding: '28px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
    position: 'relative',
    animation: 'pwaZoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    boxSizing: 'border-box',
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#818cf8',
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
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 900,
    color: '#f8fafc',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '13px',
    color: '#94a3b8',
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
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#f1f5f9',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '14px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(15, 23, 42, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '11px',
    color: '#94a3b8',
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
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#818cf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 800,
    flexShrink: 0,
  },
  stepText: {
    fontSize: '12.5px',
    color: '#cbd5e1',
    lineHeight: 1.45,
  },
};
