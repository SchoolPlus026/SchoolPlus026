import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Fingerprint, Trash2, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorPasskey } from '@capgo/capacitor-passkey';

export default function BiometricSetup() {
  const { user } = useAppStore();
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Only render on native Android/iOS
  if (!Capacitor.isNativePlatform()) {
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

  const handleEnroll = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // 1. Get options from Edge Function
      const { data: startData, error: startError } = await supabase.functions.invoke('webauthn-start', {
        body: { action: 'register', userId: user.id, email: user.email }
      });
      if (startError) throw startError;

      // Ensure startData is not stringified JSON inside data
      const options = typeof startData === 'string' ? JSON.parse(startData) : startData;

      // 2. Call Native Capacitor Passkey Bridge
      const nativeResponse = await CapacitorPasskey.createCredential({ publicKey: options });

      // 3. Verify with Edge Function
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('webauthn-verify', {
        body: { action: 'registration', userId: user.id, response: nativeResponse }
      });
      if (verifyError) throw verifyError;
      if (!verifyData?.success) throw new Error("Verification failed on server");

      setSuccess('Biometric login enabled successfully!');
      fetchPasskeys();
    } catch (err) {
      console.error(err);
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
    <div className="card">
      <div className="settings-header" style={{ marginBottom: '16px' }}>
        <div className="icon-box" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
          <Fingerprint size={20} />
        </div>
        <div className="text-content">
          <h4>Biometric Login</h4>
          <p>Use Fingerprint or FaceID to sign in instantly.</p>
        </div>
      </div>

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
  );
}
