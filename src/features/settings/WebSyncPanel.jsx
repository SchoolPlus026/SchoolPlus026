import React, { useState } from 'react';
import { supabase, safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Monitor, Smartphone, Loader2, CheckCircle2, ArrowRight, Copy, RefreshCw, Lock } from 'lucide-react';

/**
 * WebSyncPanel — Two-section settings panel for QR sync
 *
 * Section A (Flow B): Logged-in Mobile user → generates QR + 6-digit code → PC enters that code
 * Section B (legacy): Logged-in Mobile user → enters 6-char code shown on PC screen (old flow)
 */
export default function WebSyncPanel() {
  const { user } = useAppStore();

  // ── Section A: Generate code for PC login ──────────────────────────────
  const [genPassword, setGenPassword] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [genCode, setGenCode] = useState('');
  const [genExpiry, setGenExpiry] = useState('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(null);

  // ── Section B: Approve PC QR scan ─────────────────────────────────────
  const [approveCode, setApproveCode] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [approveSuccess, setApproveSuccess] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // Generate 6-digit code for PC login (Flow B: Mobile → PC)
  // ─────────────────────────────────────────────────────────────────────────
  const handleGenerateCode = async (e) => {
    e.preventDefault();
    setGenError('');
    setGenCode('');
    setGenExpiry('');

    if (!genPassword) {
      setGenError('Please enter your password to generate a sync code.');
      return;
    }

    setGenLoading(true);
    try {
      const data = await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'qr-generate-mobile',
        userId: user?.id,
        password: genPassword
      });

      setGenCode(data.displayCode);
      setGenExpiry(data.expiresAt);
      setGenPassword('');

      // Start countdown
      const expiry = new Date(data.expiresAt);
      const tick = () => {
        const remaining = Math.max(0, Math.floor((expiry - new Date()) / 1000));
        setCountdown(remaining);
        if (remaining > 0) setTimeout(tick, 1000);
        else { setGenCode(''); setCountdown(null); }
      };
      setTimeout(tick, 1000);
    } catch (err) {
      setGenError(err.message || 'Failed to generate sync code. Please try again.');
    } finally {
      setGenLoading(false);
    }
  };

  const handleCopy = () => {
    if (genCode) {
      navigator.clipboard.writeText(genCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Approve PC login — enter 6-char code from PC QR screen (legacy Flow)
  // ─────────────────────────────────────────────────────────────────────────
  const handleApproveSync = async (e) => {
    e.preventDefault();
    setApproveError('');
    setApproveSuccess('');

    if (approveCode.length < 6) {
      setApproveError('Please enter a valid 6-character sync code.');
      return;
    }

    setApproveLoading(true);
    try {
      await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'qr-approve',
        qrToken: approveCode.trim().toLowerCase(),
        mobileUserId: user?.id
      });
      setApproveSuccess('✅ Computer login approved! Your PC browser will sign in automatically.');
      setApproveCode('');
    } catch (err) {
      setApproveError(err.message || 'Failed to authorize computer login. Please check the code.');
    } finally {
      setApproveLoading(false);
    }
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">

      {/* ── Section A: Generate code for PC ───────────────────────────── */}
      <div className="card">
        <div className="settings-header" style={{ marginBottom: '16px' }}>
          <div className="icon-box" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <Monitor size={20} />
          </div>
          <div className="text-content">
            <h4>Login to PC from Mobile</h4>
            <p>Generate a 6-digit code on your phone and enter it on the PC login screen to sign in.</p>
          </div>
        </div>

        {genError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold">
            {genError}
          </div>
        )}

        {genCode ? (
          <div className="space-y-4">
            {/* Code display */}
            <div className="p-5 bg-violet-500/10 border-2 border-violet-500/30 rounded-2xl text-center space-y-2">
              <p className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">6-Digit Sync Code</p>
              <div className="text-4xl font-black tracking-[0.3em] text-white">{genCode}</div>
              <p className="text-xs text-slate-400">
                Expires in <span className={`font-bold ${countdown <= 60 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {countdown !== null ? formatCountdown(countdown) : '5:00'}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleCopy}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-all">
                {copied ? <><CheckCircle2 size={14} className="text-emerald-400" /> Copied!</> : <><Copy size={14} /> Copy Code</>}
              </button>
              <button onClick={() => { setGenCode(''); setCountdown(null); }}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 text-sm font-semibold text-slate-400 hover:bg-white/5 transition-all">
                <RefreshCw size={14} /> New Code
              </button>
            </div>

            <div className="p-3 bg-slate-800/50 rounded-xl text-xs text-slate-400 font-medium">
              <strong className="text-slate-300">How to use:</strong> On the PC login screen, tap <em>"Account Help &amp; Recovery"</em> → <em>"Sync Login with Mobile App"</em> → enter this 6-digit code.
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerateCode} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                <Lock size={10} className="inline mr-1" />Your Password
              </label>
              <input
                type="password"
                required
                value={genPassword}
                onChange={e => setGenPassword(e.target.value)}
                className="sp-input"
                placeholder="Enter your password to verify identity"
              />
              <p className="text-[10px] text-slate-500 mt-2 ml-1">Password is required to securely generate the sync code.</p>
            </div>
            <button type="submit" disabled={genLoading} className="btn accent w-full">
              {genLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  <span>Generating Code...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Monitor size={16} />
                  <span>Generate PC Login Code</span>
                </div>
              )}
            </button>
          </form>
        )}
      </div>

      {/* ── Section B: Approve PC QR scan (legacy) ────────────────────── */}
      <div className="card">
        <div className="settings-header" style={{ marginBottom: '16px' }}>
          <div className="icon-box" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
            <Smartphone size={20} />
          </div>
          <div className="text-content">
            <h4>Approve PC QR Scan</h4>
            <p>PC is showing a QR code? Enter the 6-character code from the QR screen to approve that login.</p>
          </div>
        </div>

        {approveError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold">
            {approveError}
          </div>
        )}

        {approveSuccess && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-semibold">
            {approveSuccess}
          </div>
        )}

        <form onSubmit={handleApproveSync} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
              6-Character Code from PC Screen
            </label>
            <input
              type="text"
              maxLength={6}
              required
              value={approveCode}
              onChange={e => setApproveCode(e.target.value.toUpperCase())}
              className="sp-input text-center text-lg tracking-[0.25em] font-black"
              placeholder="A1B2C3"
            />
            <p className="text-[10px] text-slate-500 mt-2 ml-1">
              Enter the 6-character code shown below the QR code on your computer screen.
            </p>
          </div>

          <button type="submit" disabled={approveLoading} className="btn accent w-full">
            {approveLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                <span>Authorizing PC...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>Approve PC Login</span>
                <ArrowRight size={16} />
              </div>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
