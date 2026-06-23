/**
 * VersionChecker.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * In-App OTA Update checker for SchoolOS+.
 *
 * Architecture (fixed):
 *  1. On mount (native Android only), fetches the latest row from the
 *     `app_versions` Supabase table ordered by version_code DESC.
 *  2. Compares against the device's real native versionCode via
 *     CapacitorApp.getInfo().build — NOT an env var.
 *  3. If remote version_code > local, shows a glassmorphic modal.
 *  4. "Download & Install" runs a 3-step in-app pipeline:
 *       Step 1 → CapacitorHttp downloads the APK binary (no browser tab)
 *       Step 2 → @capacitor/filesystem writes the APK to the device cache
 *       Step 3 → @capacitor/share opens the system APK installer intent
 *     The modal shows animated step progress throughout. No redirects.
 *
 * Placement: Rendered in App.jsx for all authenticated native sessions.
 * Renders null on web — zero web impact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { supabase } from '../config/supabaseClient';

const isMobileOrPWA = () => {
  if (Capacitor.isNativePlatform()) return true;
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileOS = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const hasTouch = navigator.maxTouchPoints > 0;
  return isMobileOS || hasTouch;
};

// ── Download state machine ────────────────────────────────────────────────────
const DL = {
  IDLE:        null,
  CONNECTING:  'connecting',
  DOWNLOADING: 'downloading',
  SAVING:      'saving',
  DONE:        'done',
  ERROR:       'error',
};

// ── Tiny spinner ──────────────────────────────────────────────────────────────
function Spin({ size = 13, color = '#818cf8' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: '2px solid transparent', borderTopColor: color,
      animation: 'vcSpin 0.75s linear infinite', flexShrink: 0,
    }} />
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────
function Step({ num, label, state }) { // state: 'done' | 'active' | 'idle'
  const done   = state === 'done';
  const active = state === 'active';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      opacity: state === 'idle' ? 0.35 : 1,
      transition: 'opacity 0.4s ease',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: done ? '14px' : '11px', fontWeight: 800,
        background: done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${done ? '#10b981' : active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
        color: done ? '#10b981' : active ? '#a5b4fc' : '#475569',
      }}>
        {done ? '✓' : active ? <Spin /> : num}
      </div>
      <span style={{
        fontSize: '13px', fontWeight: active ? 700 : 600,
        color: done ? '#34d399' : active ? '#e0e7ff' : '#475569',
      }}>
        {label}
      </span>
    </div>
  );
}

function stepState(current, target) {
  const order = [DL.CONNECTING, DL.DOWNLOADING, DL.SAVING, DL.DONE];
  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  if (ci > ti) return 'done';
  if (ci === ti) return 'active';
  return 'idle';
}

// ── Download progress panel (replaces action buttons while in flight) ─────────
function DownloadPanel({ dlState, errorMsg, onRetry, onDismiss, isCritical, progress }) {
  if (dlState === DL.ERROR) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'flex-start',
          padding: '13px 14px', borderRadius: '13px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
        }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>❌</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', marginBottom: '3px' }}>
              Download Failed
            </div>
            <div style={{ fontSize: '12px', color: '#fca5a5', lineHeight: 1.5 }}>
              {errorMsg || 'Could not download the update. Check your connection and try again.'}
            </div>
          </div>
        </div>
        <button id="btn-retry-download" onClick={onRetry} style={{
          width: '100%', padding: '14px', borderRadius: '13px',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          border: 'none', cursor: 'pointer', color: '#fff',
          fontSize: '14px', fontWeight: 800, letterSpacing: '0.02em',
          boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
        }}>
          ↺ Retry Download
        </button>
        {!isCritical && (
          <button id="btn-update-later-error" onClick={onDismiss} style={{
            width: '100%', padding: '12px', borderRadius: '13px',
            background: 'transparent', border: '1px solid rgba(99,102,241,0.22)',
            cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: 600,
          }}>
            Update Later
          </button>
        )}
      </div>
    );
  }

  if (dlState === DL.DONE) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '12px', padding: '8px 0',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
        }}>✅</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#34d399', marginBottom: '6px' }}>
            Download Complete!
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
            The system installer is opening.<br />
            Tap <strong style={{ color: '#c7d2fe' }}>Install</strong> when prompted to finish updating.
          </div>
        </div>
      </div>
    );
  }

  // Active steps view (connecting / downloading / saving)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Step num={1} label="Connecting to server…"   state={stepState(dlState, DL.CONNECTING)} />
      <Step num={2} label={progress > 0 ? `Downloading (${progress}%)…` : "Downloading update…"} state={stepState(dlState, DL.DOWNLOADING)} />
      <Step num={3} label="Opening installer…"      state={stepState(dlState, DL.SAVING)} />

      {/* Determinate progress bar */}
      <div style={{
        height: 6, borderRadius: 999, overflow: 'hidden',
        background: 'rgba(99,102,241,0.12)', marginTop: '8px',
        position: 'relative'
      }}>
        <div style={{
          height: '100%', width: `${progress}%`, borderRadius: 999,
          background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
          transition: 'width 0.3s ease-out',
        }} />
      </div>
    </div>
  );
}

// ── Update Modal ──────────────────────────────────────────────────────────────
function UpdateModal({ version, onDismiss, onDownload, dlState, errorMsg, onRetry }) {
  const isCritical  = version.is_critical;
  const isInFlight  = dlState !== DL.IDLE && dlState !== DL.ERROR;

  return (
    <div
      role="dialog" aria-modal="true" aria-label="App Update Available"
      onClick={!isCritical && !isInFlight ? onDismiss : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)', animation: 'vcFadeIn 0.3s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '400px', borderRadius: '24px',
          background: 'linear-gradient(145deg, rgba(18,16,56,0.97) 0%, rgba(10,8,36,0.99) 100%)',
          border: '1px solid rgba(99,102,241,0.35)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
          padding: '32px 28px 28px',
          display: 'flex', flexDirection: 'column', gap: '20px',
          animation: 'vcSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '18px', flexShrink: 0,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px', boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
          }}>🚀</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '18px', fontWeight: 900, color: '#f1f5f9',
              letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: '4px',
            }}>
              {Capacitor.isNativePlatform() ? 'New Update Available!' : 'Get the Android App!'}
            </div>
            <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: 700 }}>
              {Capacitor.isNativePlatform() ? `SchoolOS+ v${version.version_name}` : `SchoolOS+ Android v${version.version_name}`}
              {isCritical && Capacitor.isNativePlatform() && (
                <span style={{
                  marginLeft: '8px', padding: '2px 8px', borderRadius: '999px',
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#f87171', fontSize: '10px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>Critical</span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(99,102,241,0.18)' }} />

        {/* Release notes */}
        {version.release_notes && (
          <div style={{
            padding: '13px 15px', borderRadius: '13px',
            background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(99,102,241,0.18)',
          }}>
            <div style={{
              fontSize: '10px', fontWeight: 800, color: '#818cf8',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '7px',
            }}>What's New</div>
            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, margin: 0 }}>
              {version.release_notes}
            </p>
          </div>
        )}

        {/* Critical warning */}
        {isCritical && Capacitor.isNativePlatform() && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 14px', borderRadius: '12px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span style={{ fontSize: '12px', color: '#fca5a5', lineHeight: 1.4 }}>
              This is a <strong>required update</strong>. You must update to continue using the app.
            </span>
          </div>
        )}

        {/* Version pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {Capacitor.isNativePlatform() && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 12px', borderRadius: '999px',
                background: 'rgba(30,27,75,0.7)', border: '1px solid rgba(99,102,241,0.2)',
              }}>
                <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>Installed</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>v{version.installed_name}</span>
              </div>
              <span style={{ fontSize: '14px', color: '#4f46e5' }}>→</span>
            </>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '999px',
            background: 'rgba(79,70,229,0.12)', border: '1px solid rgba(99,102,241,0.3)',
          }}>
            <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 600 }}>Latest</span>
            <span style={{ fontSize: '11px', color: '#c7d2fe', fontWeight: 700 }}>v{version.version_name}</span>
          </div>
        </div>

        {/* Action area — swaps between buttons and progress panel */}
        {dlState === DL.IDLE ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              id="btn-download-update"
              onClick={onDownload}
              style={{
                width: '100%', padding: '15px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                border: 'none', cursor: 'pointer', color: '#fff',
                fontSize: '14px', fontWeight: 800, letterSpacing: '0.02em',
                boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {Capacitor.isNativePlatform() ? '⬇️ Download & Install Update' : '⬇️ Download Android App (APK)'}
            </button>
            {!isCritical && (
              <button
                id="btn-update-later"
                onClick={onDismiss}
                style={{
                  width: '100%', padding: '13px', borderRadius: '14px',
                  background: 'transparent', border: '1px solid rgba(99,102,241,0.25)',
                  cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: 600,
                }}
              >
                Update Later
              </button>
            )}
          </div>
        ) : (
          <DownloadPanel
            dlState={dlState}
            errorMsg={errorMsg}
            onRetry={onRetry}
            onDismiss={onDismiss}
            isCritical={isCritical}
            progress={version.downloadProgress}
          />
        )}
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes vcFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vcSlideUp { from { opacity: 0; transform: translateY(32px) scale(0.96) } to { opacity: 1; transform: none } }
        @keyframes vcSpin    { to { transform: rotate(360deg) } }
        @keyframes vcSlide   { 0% { transform: translateX(-100%) } 50% { transform: translateX(160%) } 100% { transform: translateX(400%) } }
      `}</style>
    </div>
  );
}

// ── Singleton guard: prevents re-checking on component remount ────────────────
let versionCheckDone = false;

// ── Main Component ────────────────────────────────────────────────────────────
export default function VersionChecker() {
  const [updateInfo,  setUpdateInfo]  = useState(null);
  const [dismissed,  setDismissed]   = useState(false);
  const [dlState,    setDlState]     = useState(DL.IDLE);
  const [errorMsg,   setErrorMsg]    = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() && !isMobileOrPWA()) return;
    if (versionCheckDone) return;
    versionCheckDone = true;
    let cancelled = false;

    async function checkVersion() {
      try {
        let localCode = 0;
        let installedVersionName = 'Web';

        if (Capacitor.isNativePlatform()) {
          const info = await CapacitorApp.getInfo();
          localCode = parseInt(info.build, 10);
          installedVersionName = info.version;
        } else {
          const dismissedCode = localStorage.getItem('sp_pwa_dismissed_apk_version');
          localCode = dismissedCode ? parseInt(dismissedCode, 10) : 0;
        }

        const { data, error } = await supabase
          .from('app_versions')
          .select('version_code, version_name, apk_url, release_notes, is_critical')
          .order('version_code', { ascending: false })
          .limit(1)
          .single();

        if (error || !data || cancelled) return;

        if (Number(data.version_code) > Number(localCode)) {
          console.info(`[VersionChecker] Update available: ${data.version_name} (remote ${data.version_code} > local ${localCode})`);
          setUpdateInfo({ ...data, installed_name: installedVersionName, downloadProgress: 0 });
        } else {
          console.info('[VersionChecker] App is up to date.');
        }
      } catch (err) {
        console.warn('[VersionChecker] Version check failed (non-fatal):', err);
      }
    }

    checkVersion();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = useCallback(async () => {
    if (!updateInfo?.apk_url) return;

    if (!Capacitor.isNativePlatform()) {
      window.open(updateInfo.apk_url, '_blank');
      localStorage.setItem('sp_pwa_dismissed_apk_version', updateInfo.version_code.toString());
      setDismissed(true);
      return;
    }

    setDlState(DL.CONNECTING);
    setErrorMsg('');
    setDownloadProgress(0);

    let progressListener = null;

    try {
      // ── Step 1 & 2: Download APK directly to filesystem with progress ──────
      setDlState(DL.DOWNLOADING);
      const fileName = `SchoolOS_Update_v${updateInfo.version_name}.apk`;

      // Setup progress listener
      progressListener = await Filesystem.addListener('downloadProgress', (progress) => {
        if (progress.contentLength > 0) {
          const percent = Math.round((progress.bytes / progress.contentLength) * 100);
          setDownloadProgress(percent);
          setUpdateInfo(prev => ({ ...prev, downloadProgress: percent }));
        }
      });

      const downloadResult = await Filesystem.downloadFile({
        url: updateInfo.apk_url,
        path: fileName,
        directory: Directory.Cache,
        progress: true
      });

      // ── Step 3: Open system APK installer via FileOpener ──────────────────
      setDlState(DL.SAVING); // Reusing 'saving' state for 'preparing to install'
      await FileOpener.open({
        filePath: downloadResult.path,
        contentType: 'application/vnd.android.package-archive',
        openWithDefault: true
      });

      setDlState(DL.DONE);

    } catch (err) {
      console.error('[VersionChecker] In-app download failed:', err);
      setDlState(DL.ERROR);
      setErrorMsg(err?.message || 'Download failed. Please check your internet connection.');
    } finally {
      if (progressListener) {
        progressListener.remove();
      }
    }
  }, [updateInfo]);

  const handleRetry = useCallback(() => {
    setDlState(DL.IDLE);
    setErrorMsg('');
  }, []);

  const handleDismiss = useCallback(() => {
    if (updateInfo?.is_critical && Capacitor.isNativePlatform()) return;
    if (dlState !== DL.IDLE && dlState !== DL.ERROR && dlState !== DL.DONE) return; // don't dismiss mid-download
    if (!Capacitor.isNativePlatform() && updateInfo) {
      localStorage.setItem('sp_pwa_dismissed_apk_version', updateInfo.version_code.toString());
    }
    setDismissed(true);
  }, [updateInfo, dlState]);

  if (!updateInfo || dismissed || (!Capacitor.isNativePlatform() && !isMobileOrPWA())) return null;

  return (
    <UpdateModal
      version={updateInfo}
      onDismiss={handleDismiss}
      onDownload={handleDownload}
      onRetry={handleRetry}
      dlState={dlState}
      errorMsg={errorMsg}
    />
  );
}
