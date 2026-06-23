import React, { useState, useEffect } from 'react';
import { Smartphone, Share2, PlusSquare, ArrowRight, X, Info } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [platformInfo, setPlatformInfo] = useState({ isIOS: false, isChrome: false, isSafari: false });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. Guard: Don't show inside native app or if already running in standalone PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (Capacitor.isNativePlatform() || isStandalone) {
      return;
    }

    // 2. Guard: Don't show if dismissed by user within last 7 days
    const dismissedTime = localStorage.getItem('sp_pwa_dismissed');
    if (dismissedTime && Date.now() - Number(dismissedTime) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

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
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // If it's iOS (Safari/Chrome), we won't get beforeinstallprompt, so we display the banner manually
    if (isIOS) {
      // Small timeout to not clutter user immediately
      const timer = setTimeout(() => {
        setVisible(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Direct native prompt on Android/Chrome
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] Install choice outcome: ${outcome}`);
      setDeferredPrompt(null);
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
    <>
      {/* Bottom PWA Prompt Banner */}
      <div style={styles.bannerContainer}>
        <div style={styles.iconContainer}>
          <Smartphone size={24} color="#6366f1" />
        </div>
        <div style={styles.textContainer}>
          <div style={styles.bannerTitle}>Install SchoolOS+ App</div>
          <div style={styles.bannerSub}>Add to Home Screen for standalone fullscreen experience & instant alerts.</div>
        </div>
        <div style={styles.buttonGroup}>
          <button onClick={handleInstallClick} style={styles.btnInstall}>
            Install <ArrowRight size={14} style={{ marginLeft: '4px' }} />
          </button>
          <button onClick={handleDismiss} style={styles.btnDismiss} title="Dismiss">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* iOS Step-by-Step Onboarding Overlay Banner */}
      {showOverlay && (
        <div style={styles.overlayBg}>
          <div style={styles.overlayCard}>
            <button onClick={() => setShowOverlay(false)} style={styles.closeOverlayBtn}>
              <X size={20} />
            </button>

            <div style={styles.overlayHeader}>
              <Smartphone size={36} color="#818cf8" style={{ marginBottom: '10px' }} />
              <h3 style={styles.overlayTitle}>Add to Home Screen</h3>
              <p style={styles.overlaySubtitle}>Follow these simple instructions to install SchoolOS+ on your iPhone/iPad.</p>
            </div>

            <div style={styles.stepsContainer}>
              {platformInfo.isSafari ? (
                // iOS Safari Steps
                <>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>1</div>
                    <div style={styles.stepText}>
                      Tap the <strong>Share</strong> button <Share2 size={16} color="#6366f1" style={{ display: 'inline', margin: '0 4px', verticalAlign: 'text-bottom' }} /> in Safari's bottom toolbar.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>2</div>
                    <div style={styles.stepText}>
                      Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare size={16} color="#6366f1" style={{ display: 'inline', margin: '0 4px', verticalAlign: 'text-bottom' }} />.
                    </div>
                  </div>
                </>
              ) : (
                // iOS Chrome / Other browsers
                <>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>1</div>
                    <div style={styles.stepText}>
                      Tap the <strong>Options</strong> icon (three dots <strong>...</strong>) in Chrome's top or bottom menu.
                    </div>
                  </div>
                  <div style={styles.stepRow}>
                    <div style={styles.stepNum}>2</div>
                    <div style={styles.stepText}>
                      Tap <strong>Add to Home Screen</strong> or <strong>Install</strong> from the list.
                    </div>
                  </div>
                </>
              )}
              <div style={styles.stepRow}>
                <div style={styles.stepNum}>3</div>
                <div style={styles.stepText}>
                  Tap <strong>Add</strong> in the top-right corner. The app will sit cleanly on your screen!
                </div>
              </div>
            </div>

            <div style={styles.overlayFooter}>
              <Info size={14} color="#94a3b8" style={{ marginRight: '6px', flexShrink: 0 }} />
              <span>Installs without Play Store approvals, warnings, or downloads.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  bannerContainer: {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '90%',
    maxWidth: '500px',
    background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.95), rgba(10, 10, 25, 0.95))',
    border: '1px solid rgba(99, 102, 241, 0.35)',
    borderRadius: '20px',
    padding: '16px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(16px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  iconContainer: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    fontWeight: 800,
    fontSize: '14px',
    color: '#f8fafc',
    marginBottom: '2px',
  },
  bannerSub: {
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: 1.3,
  },
  buttonGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnInstall: {
    background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
  },
  btnDismiss: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
  },
  overlayBg: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(5, 5, 10, 0.85)',
    backdropFilter: 'blur(8px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  overlayCard: {
    width: '100%',
    maxWidth: '400px',
    background: 'linear-gradient(135deg, #10101f, #080811)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: '28px',
    padding: '28px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
    position: 'relative',
    animation: 'zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  closeOverlayBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayHeader: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  overlayTitle: {
    fontSize: '20px',
    fontWeight: 900,
    color: '#f8fafc',
    margin: '0 0 6px',
    letterSpacing: '-0.02em',
  },
  overlaySubtitle: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: 0,
    lineHeight: 1.4,
  },
  stepsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  stepNum: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#818cf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
    flexShrink: 0,
  },
  stepText: {
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: 1.4,
  },
  overlayFooter: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(15, 23, 42, 0.4)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '10px',
    color: '#94a3b8',
    lineHeight: 1.3,
  }
};
