/**
 * VersionChecker.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * In-App Update checker for SchoolOS+.
 *
 * How it works:
 *  1. On mount (native Android only), fetches the latest row from the
 *     `app_versions` Supabase table ordered by version_code DESC.
 *  2. Compares it against APP_VERSION_CODE (the integer code baked in here,
 *     which must be kept in sync with the latest APK build).
 *  3. If the remote version_code > local version_code, shows a glassmorphic
 *     modal:
 *     - is_critical = true  → non-dismissible (user MUST update to proceed)
 *     - is_critical = false → dismissible via an "Update Later" button
 *  4. Download & Update opens the apk_url in the system browser using
 *     Capacitor Browser plugin so the user can sideload the new APK.
 *
 * Placement: Rendered inside NotificationProvider (or directly inside
 * protected layouts) — it renders null on web, so there's no web impact.
 *
 * ─── VERSION MANAGEMENT ──────────────────────────────────────────────────────
 * Update APP_VERSION_CODE every time you publish a new APK to Supabase:
 *   - Bump this integer here (e.g. 1 → 2)
 *   - Insert a new row in the app_versions table with that version_code
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../config/supabaseClient';

const APP_VERSION_CODE = parseInt(import.meta.env.VITE_APP_VERSION_CODE || '1', 10);
const APP_VERSION_NAME = import.meta.env.VITE_APP_VERSION_NAME || '1.0.0';

// ── Glassmorphic Update Modal ─────────────────────────────────────────────────
function UpdateModal({ version, onDismiss, onDownload }) {
  const isCritical = version.is_critical;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App Update Available"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fcmFadeIn 0.3s ease',
      }}
      // Only allow clicking backdrop to dismiss if NOT critical
      onClick={!isCritical ? onDismiss : undefined}
    >
      {/* Card — stop propagation so clicking inside doesn't dismiss */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '400px',
          borderRadius: '24px',
          background: 'linear-gradient(145deg, rgba(18,16,56,0.97) 0%, rgba(10,8,36,0.99) 100%)',
          border: '1px solid rgba(99,102,241,0.35)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
          padding: '32px 28px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          {/* Rocket icon */}
          <div style={{
            width: '56px', height: '56px', borderRadius: '18px', flexShrink: 0,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px',
            boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
          }}>
            🚀
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '18px', fontWeight: 900, color: '#f1f5f9',
              letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: '4px',
            }}>
              New Update Available!
            </div>
            <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: 700 }}>
              SchoolOS+ v{version.version_name}
              {isCritical && (
                <span style={{
                  marginLeft: '8px', padding: '2px 8px', borderRadius: '999px',
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#f87171', fontSize: '10px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Critical
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: '1px', background: 'rgba(99,102,241,0.18)' }} />

        {/* ── Release Notes ── */}
        {version.release_notes && (
          <div style={{
            padding: '14px 16px',
            borderRadius: '14px',
            background: 'rgba(79,70,229,0.08)',
            border: '1px solid rgba(99,102,241,0.18)',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
              What's New
            </div>
            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, margin: 0 }}>
              {version.release_notes}
            </p>
          </div>
        )}

        {/* ── Critical warning ── */}
        {isCritical && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 14px', borderRadius: '12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span style={{ fontSize: '12px', color: '#fca5a5', lineHeight: 1.4 }}>
              This is a <strong>required update</strong>. You must update before continuing to use the app.
            </span>
          </div>
        )}

        {/* ── Version info pill ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '999px',
            background: 'rgba(30,27,75,0.7)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>Installed</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>v{APP_VERSION_NAME}</span>
          </div>
          <span style={{ fontSize: '14px', color: '#4f46e5' }}>→</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '999px',
            background: 'rgba(79,70,229,0.12)',
            border: '1px solid rgba(99,102,241,0.3)',
          }}>
            <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 600 }}>Latest</span>
            <span style={{ fontSize: '11px', color: '#c7d2fe', fontWeight: 700 }}>v{version.version_name}</span>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Primary: Download & Update */}
          <button
            id="btn-download-update"
            onClick={onDownload}
            style={{
              width: '100%', padding: '15px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              border: 'none', cursor: 'pointer',
              color: 'white', fontSize: '14px', fontWeight: 800,
              letterSpacing: '0.02em',
              boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
              transition: 'all 0.3s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            ⬇️ Download &amp; Install Update
          </button>

          {/* Secondary: Later (only for non-critical) */}
          {!isCritical && (
            <button
              id="btn-update-later"
              onClick={onDismiss}
              style={{
                width: '100%', padding: '13px', borderRadius: '14px',
                background: 'transparent',
                border: '1px solid rgba(99,102,241,0.25)',
                cursor: 'pointer', color: '#64748b',
                fontSize: '13px', fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)';
                e.currentTarget.style.color = '#94a3b8';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              Update Later
            </button>
          )}
        </div>
      </div>

      {/* ── Inline keyframe animations ── */}
      <style>{`
        @keyframes fcmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp   { from { opacity: 0; transform: translateY(32px) scale(0.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

// Module-level singleton: prevents re-checking on component remount.
// App.jsx renders {user && <VersionChecker />} which unmounts/remounts on
// background auth refreshes. This flag ensures the Supabase query fires once
// per app session regardless of how many times the component mounts.
let versionCheckDone = false;

// ── Main Component ────────────────────────────────────────────────────────────
export default function VersionChecker() {
  const [updateInfo, setUpdateInfo]       = useState(null);
  const [dismissed, setDismissed]         = useState(false);

  useEffect(() => {
    // Only run on native Android (web builds are always "latest")
    if (!Capacitor.isNativePlatform()) return;
    // Singleton guard: if this module already ran the check this session, skip.
    if (versionCheckDone) return;
    versionCheckDone = true;
    let cancelled = false;

    async function checkVersion() {
      try {
        const info = await CapacitorApp.getInfo();
        const localVersionCode = parseInt(info.build, 10);

        const { data, error } = await supabase
          .from('app_versions')
          .select('version_code, version_name, apk_url, release_notes, is_critical')
          .order('version_code', { ascending: false })
          .limit(1)
          .single();

        if (error || !data || cancelled) return;

        if (data.version_code > localVersionCode) {
          console.info(
            `[VersionChecker] Update available: v${data.version_name} (code ${data.version_code}) > installed (code ${localVersionCode})`
          );
          setUpdateInfo(data);
        } else {
          console.info('[VersionChecker] App is up to date.');
        }
      } catch (err) {
        // Version check failure must never affect app usability
        console.warn('[VersionChecker] Version check failed (non-fatal):', err);
      }
    }

    checkVersion();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = useCallback(() => {
    if (!updateInfo?.apk_url) return;
    window.open(updateInfo.apk_url, '_system');
  }, [updateInfo]);

  const handleDismiss = useCallback(() => {
    if (updateInfo?.is_critical) return; // cannot dismiss critical updates
    setDismissed(true);
  }, [updateInfo]);

  // Don't render anything if:
  // - No update found
  // - User already dismissed (and it's non-critical)
  // - Running on web
  if (!updateInfo || dismissed || !Capacitor.isNativePlatform()) return null;

  return (
    <UpdateModal
      version={updateInfo}
      onDismiss={handleDismiss}
      onDownload={handleDownload}
    />
  );
}
