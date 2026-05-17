/**
 * BiometricSetup.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings panel component for managing biometric (passkey) enrollment.
 *
 * Features:
 *   • Shows/hides based on device support (graceful degradation)
 *   • Lists all enrolled devices with last-used date
 *   • "Enable on This Device" button runs registration ceremony
 *   • "Remove" button per device with confirmation
 *   • Maximum 3 passkeys per account (soft cap)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Fingerprint, Loader2, Trash2, Plus, ShieldCheck, AlertCircle, CheckCircle2, Smartphone } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useBiometric } from '../../hooks/useBiometric';

const MAX_PASSKEYS = 3;

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BiometricSetup() {
  const { user } = useAppStore();
  const { loading, error, isSupported, registerPasskey, listPasskeys, removePasskey } = useBiometric();

  const [supported, setSupported]   = useState(null); // null = checking
  const [passkeys, setPasskeys]     = useState([]);
  const [fetchError, setFetchError] = useState('');
  const [toast, setToast]           = useState('');
  const [removing, setRemoving]     = useState(null); // id of row being removed
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError]     = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  // ── Show a quick toast for 3 seconds ──
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // ── Check support on mount ──
  useEffect(() => {
    isSupported().then(setSupported);
  }, [isSupported]);

  // ── Load passkeys on mount and after changes ──
  const refresh = useCallback(async () => {
    try {
      const list = await listPasskeys();
      setPasskeys(list);
      setFetchError('');
    } catch (e) {
      setFetchError(e.message);
    }
  }, [listPasskeys]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  // ── Register this device ──
  const handleRegister = async () => {
    if (!deviceName.trim()) return;
    setRegistering(true);
    setRegError('');
    setRegSuccess('');

    const username = user?.email?.split('@')[0] ?? user?.id;
    const result = await registerPasskey(user.id, username, deviceName.trim());

    setRegistering(false);

    if (result.success) {
      setRegSuccess('✅ Biometric login enabled for this device!');
      setShowNameInput(false);
      setDeviceName('');
      await refresh();
    } else {
      setRegError(result.error ?? 'Enrollment failed. Please try again.');
    }
  };

  // ── Remove a passkey ──
  const handleRemove = async (passkeyId, friendlyName) => {
    const confirmed = window.confirm(`Remove "${friendlyName}" from your biometric devices?\n\nYou will need to re-enroll this device to use biometric login on it again.`);
    if (!confirmed) return;

    setRemoving(passkeyId);
    try {
      await removePasskey(passkeyId);
      showToast(`"${friendlyName}" removed.`);
      await refresh();
    } catch (e) {
      showToast('❌ Failed to remove device: ' + e.message);
    } finally {
      setRemoving(null);
    }
  };

  // ── Render: checking support ──
  if (supported === null) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        <span className="muted small">Checking biometric support…</span>
      </div>
    );
  }

  // ── Render: not supported ──
  if (!supported) {
    return (
      <div className="card" style={{ padding: '16px 20px', opacity: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="icon-box">
            <Fingerprint size={20} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Biometric Login</h4>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Not available on this device or browser. Use Chrome on Android or Safari on iOS.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: supported ──
  const atLimit = passkeys.length >= MAX_PASSKEYS;

  return (
    <div className="card fade-in">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '30px',
          fontWeight: 600, fontSize: '14px', zIndex: 1000, boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="settings-header">
        <div className="icon-box" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
          <Fingerprint size={20} />
        </div>
        <div className="text-content">
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Biometric Login</h4>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Use fingerprint or Face ID to sign in instantly
          </p>
        </div>
        {passkeys.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(16,185,129,0.1)', color: '#10b981',
            borderRadius: '20px', padding: '4px 10px', fontSize: '12px', fontWeight: 700
          }}>
            <ShieldCheck size={13} />
            <span>Active</span>
          </div>
        )}
      </div>

      {/* Success message */}
      {regSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', marginBottom: '14px' }}>
          <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '13px', color: '#6ee7b7', fontWeight: 600 }}>{regSuccess}</p>
        </div>
      )}

      {/* Error message */}
      {(regError || fetchError) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', marginBottom: '14px' }}>
          <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0, fontSize: '13px', color: '#fca5a5', fontWeight: 600 }}>{regError || fetchError}</p>
        </div>
      )}

      {/* Enrolled devices list */}
      {passkeys.length > 0 ? (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Enrolled Devices ({passkeys.length}/{MAX_PASSKEYS})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {passkeys.map((pk) => (
              <div key={pk.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', background: 'var(--bg-main)',
                borderRadius: '12px', border: '1px solid var(--card-border)'
              }}>
                <div style={{ padding: '8px', background: 'rgba(99,102,241,0.1)', borderRadius: '10px', flexShrink: 0 }}>
                  <Smartphone size={16} style={{ color: '#818cf8' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pk.friendly_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Added {formatDate(pk.created_at)}
                    {pk.last_used_at && ` · Last used ${formatDate(pk.last_used_at)}`}
                    {pk.backed_up && ' · ☁️ Synced'}
                  </div>
                </div>
                <button
                  id={`btn-remove-passkey-${pk.id}`}
                  onClick={() => handleRemove(pk.id, pk.friendly_name)}
                  disabled={removing === pk.id}
                  title="Remove this device"
                  style={{
                    padding: '7px', background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px',
                    cursor: 'pointer', color: '#f87171', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: removing === pk.id ? 0.5 : 1
                  }}
                >
                  {removing === pk.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: '12px' }}>
          <Fingerprint size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No devices enrolled yet. Add this device to enable biometric login.
          </p>
        </div>
      )}

      {/* Add device button / form */}
      {!atLimit && !showNameInput && (
        <button
          id="btn-enable-biometric"
          onClick={() => { setShowNameInput(true); setRegError(''); setRegSuccess(''); }}
          className="btn accent w-full"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Plus size={16} /> Enable on This Device
        </button>
      )}

      {atLimit && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
          Maximum of {MAX_PASSKEYS} devices reached. Remove one to add another.
        </p>
      )}

      {showNameInput && (
        <div className="fade-in" style={{ marginTop: '4px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            Give this device a name
          </p>
          <input
            id="input-biometric-device-name"
            type="text"
            placeholder="e.g. My Android Phone"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            className="sp-input block w-full"
            style={{ marginBottom: '10px' }}
            autoFocus
            maxLength={40}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { setShowNameInput(false); setDeviceName(''); setRegError(''); }}
              className="btn ghost"
              style={{ flex: 1 }}
              disabled={loading || registering}
            >
              Cancel
            </button>
            <button
              id="btn-confirm-biometric-enroll"
              onClick={handleRegister}
              className="btn accent"
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={!deviceName.trim() || loading || registering}
            >
              {registering
                ? <><Loader2 size={15} className="animate-spin" /> Enrolling…</>
                : <><Fingerprint size={15} /> Enroll with Biometric</>
              }
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
            Your fingerprint or Face ID never leaves your device.
          </p>
        </div>
      )}
    </div>
  );
}
