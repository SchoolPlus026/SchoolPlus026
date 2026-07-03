import React, { useState, useEffect } from 'react';
import { supabase, safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Fingerprint, Trash2, Loader2, Plus, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorPasskey } from '@capgo/capacitor-passkey';
import { registerWebAuthnWeb } from '../../utils/webauthnWeb';

const isMobileOrPWA = () => {
  if (Capacitor.isNativePlatform()) return true;
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileOS = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const hasTouch = navigator.maxTouchPoints > 0;
  return isMobileOS || hasTouch;
};

export default function BiometricSetup() {
  const { user } = useAppStore();
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Only render on native app or mobile web/PWA
  if (!isMobileOrPWA()) {
    return null;
  }

  const fetchPasskeys = async () => {
    setFetching(true);
    try {
      const { data, error: err } = await supabase
        .from('user_passkeys')
        .select('*')
        .eq('user_id', user.id);
      
      if (err) throw err;
      setPasskeys(data || []);
    } catch (err) {
      console.error("Failed to fetch passkeys", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchPasskeys();
  }, [user.id]);

  // Helper: invoke Edge Function and surface the real server-side error message
  // instead of the generic "Edge Function returned a non-2xx status code".
  const invokeEdgeFn = async (fnName, body) => {
    return safeInvokeEdgeFn(fnName, body);
  };

  const handleEnroll = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // 1. Get registration options from Edge Function
      const options = await invokeEdgeFn('webauthn-start', {
        action: 'register',
        userId: user.id,
        email: user.email,
      });

      // 2. Call Native Capacitor Passkey Bridge or standard WebAuthn — triggers fingerprint prompt
      let passkeyResponse;
      try {
        if (Capacitor.isNativePlatform()) {
          passkeyResponse = await CapacitorPasskey.createCredential({ publicKey: options });
        } else {
          passkeyResponse = await registerWebAuthnWeb(options);
        }
      } catch (nativeError) {
        // User cancelled or device does not support biometrics
        const msg = nativeError?.message || JSON.stringify(nativeError) || 'Unknown error';
        if (msg.toLowerCase().includes('cancel') || msg.includes('user cancelled')) {
          setError('Biometric setup was cancelled.');
          return;
        }
        throw new Error(`Device Error: ${msg}`);
      }

      if (!passkeyResponse || typeof passkeyResponse !== 'object' || (!passkeyResponse.id && !passkeyResponse.rawId)) {
        throw new Error('Invalid or empty biometric payload received from device.');
      }

      // 3. Verify registration with Edge Function
      const verifyData = await invokeEdgeFn('webauthn-verify', {
        action: 'registration',
        userId: user.id,
        response: passkeyResponse,
      });
      if (!verifyData?.success) throw new Error('Server verification failed — please try again.');

      setSuccess('Biometric login enabled successfully!');
      fetchPasskeys();
    } catch (err) {
      console.error('[BiometricSetup] enroll error:', err);
      setError(err.message || 'Failed to enroll biometrics.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm("Are you sure you want to remove this biometric login?")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('user_passkeys').delete().eq('id', id);
      if (error) throw error;
      setSuccess('Biometric login removed.');
      fetchPasskeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`card transition-all duration-300 ${!isCollapsed ? 'card-expanded-highlight' : ''}`}>
      <div 
        className="settings-header cursor-pointer flex justify-between items-center" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ marginBottom: isCollapsed ? '0' : '16px' }}
      >
        <div className="flex items-center gap-3">
          <div className="icon-box" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
            <Fingerprint size={20} />
          </div>
          <div className="text-content">
            <h4>Biometric Login</h4>
            <p>Use Fingerprint or FaceID to sign in instantly.</p>
          </div>
        </div>
        <div>
          {isCollapsed ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 border-t border-[var(--card-border)] pt-4">

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '14px' }}>
          {error}
        </div>
      )}
      
      {success && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: '8px', fontSize: '14px' }}>
          {success}
        </div>
      )}

      {fetching ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : passkeys.length > 0 ? (
        <div className="space-y-3">
          {passkeys.map(pk => (
            <div key={pk.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-emerald-500" size={18} />
                <div>
                  <div className="font-semibold text-sm">Enrolled Device</div>
                  <div className="text-xs text-slate-500">Added {new Date(pk.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <button 
                onClick={() => handleRemove(pk.id)} 
                disabled={loading}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button onClick={handleEnroll} disabled={loading} className="btn outline w-full mt-2">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Enroll Another Device
          </button>
        </div>
      ) : (
        <div className="text-center p-4">
          <button onClick={handleEnroll} disabled={loading} className="btn accent w-full">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Fingerprint size={16} />}
            Enable Biometric Login
          </button>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
