import React, { useState } from 'react';
import { supabase, safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Monitor, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

export default function WebSyncPanel() {
  const { user } = useAppStore();
  const [syncCode, setSyncCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApproveSync = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (syncCode.length < 6) {
      setError('Please enter a valid 6-character sync code.');
      return;
    }

    setLoading(true);
    try {
      const data = await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'qr-approve',
        qrToken: syncCode.trim().toLowerCase(),
        mobileUserId: user?.id
      });

      setSuccess('Computer login approved successfully! Your browser will sign in now.');
      setSyncCode('');
    } catch (err) {
      setError(err.message || 'Failed to authorize computer login. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="settings-header" style={{ marginBottom: '16px' }}>
        <div className="icon-box" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
          <Monitor size={20} />
        </div>
        <div className="text-content">
          <h4>Link Computer / PC Login</h4>
          <p>Authorize a login session on your computer using a 6-character sync code.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-semibold">
          {success}
        </div>
      )}

      <form onSubmit={handleApproveSync} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
            6-Character Sync Code
          </label>
          <input
            type="text"
            maxLength={6}
            required
            value={syncCode}
            onChange={e => setSyncCode(e.target.value.toUpperCase())}
            className="sp-input text-center text-lg tracking-[0.25em] font-black"
            placeholder="A1B2C3"
          />
          <p className="text-[10px] text-slate-500 mt-2 ml-1">
            Enter the 6-character code shown on your computer screen under the QR Code.
          </p>
        </div>

        <button type="submit" disabled={loading} className="btn accent w-full">
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Authorizing Computer...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Approve Computer Login</span>
              <ArrowRight size={16} />
            </div>
          )}
        </button>
      </form>
    </div>
  );
}
