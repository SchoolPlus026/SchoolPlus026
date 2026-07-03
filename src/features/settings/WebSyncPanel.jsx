import React, { useState } from 'react';
import { safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Monitor, Smartphone, Loader2, CheckCircle2, Copy, RefreshCw, ShieldAlert, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

/**
 * WebSyncPanel — Rebuilt Sync Settings Panel for Admins
 *
 * Exclusively for Platform Admin and School Admin.
 *
 * Flow:
 *  1. Admin clicks "Generate Code"
 *  2. Invoke 'get-sync-questions'
 *  3. If skipVerification: true, show final code/QR directly
 *  4. Else show MCQ + DOB/Contact inputs. Verification succeeds -> show final code/QR
 */
export default function WebSyncPanel() {
  const { user, role } = useAppStore();
  const cleanRole = (role || '').toLowerCase();
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Guard: Admin only
  if (cleanRole !== 'admin' && cleanRole !== 'platform_admin') {
    return null;
  }

  // Pre-generation Quiz states
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizSessionId, setQuizSessionId] = useState('');
  const [mcqQuestion, setMcqQuestion] = useState(null); // { question, options }
  const [mcqAnswer, setMcqAnswer] = useState('');
  const [dynamicQuestion, setDynamicQuestion] = useState(null); // { type, question }
  const [dynamicAnswer, setDynamicAnswer] = useState('');

  // Generated Code states
  const [genCode, setGenCode] = useState('');
  const [qrTokenState, setQrTokenState] = useState('');
  const [genExpiry, setGenExpiry] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const startCountdownTimer = (expiresAt) => {
    const expiry = new Date(expiresAt);
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiry - new Date()) / 1000));
      setCountdown(remaining);
      if (remaining > 0) {
        window.syncCountdownTimeout = setTimeout(tick, 1000);
      } else {
        setGenCode('');
        setQrTokenState('');
        setCountdown(null);
      }
    };
    if (window.syncCountdownTimeout) clearTimeout(window.syncCountdownTimeout);
    tick();
  };

  const handleGenerateCode = async (e) => {
    if (e) e.preventDefault();
    setGenError('');
    setGenCode('');
    setQrTokenState('');
    setCountdown(null);
    setMcqAnswer('');
    setDynamicAnswer('');
    setShowQuiz(false);

    setGenLoading(true);
    try {
      const clientPlatform = Capacitor.isNativePlatform() ? 'mobile' : 'pc';
      const data = await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'get-sync-questions',
        userId: user?.id,
        clientPlatform
      });

      if (data.skipVerification) {
        setGenCode(data.displayCode);
        setGenExpiry(data.expiresAt);
        if (data.qrToken) {
          setQrTokenState(data.qrToken);
        }
        startCountdownTimer(data.expiresAt);
      } else {
        setQuizSessionId(data.sessionId);
        setMcqQuestion(data.mcqQuestion);
        setDynamicQuestion(data.dynamicQuestion);
        setShowQuiz(true);
      }
    } catch (err) {
      setGenError(err.message || 'Failed to initialize sync code generation.');
    } finally {
      setGenLoading(false);
    }
  };

  const handleVerifyQuiz = async (e) => {
    e.preventDefault();
    setGenError('');

    if (!mcqAnswer) {
      setGenError('Please identify the staff member.');
      return;
    }
    if (!dynamicAnswer.trim()) {
      setGenError('Please enter the answer to the profile question.');
      return;
    }

    setGenLoading(true);
    try {
      const clientPlatform = Capacitor.isNativePlatform() ? 'mobile' : 'pc';
      const data = await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'verify-sync-questions',
        sessionId: quizSessionId,
        staffAnswer: mcqAnswer,
        dynamicAnswer: dynamicAnswer.trim(),
        clientPlatform
      });

      setGenCode(data.displayCode);
      setGenExpiry(data.expiresAt);
      if (data.qrToken) {
        setQrTokenState(data.qrToken);
      }
      setShowQuiz(false);
      startCountdownTimer(data.expiresAt);
    } catch (err) {
      setGenError(err.message || 'Verification failed. Please try again.');
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

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isNative = Capacitor.isNativePlatform();

  return (
    <div className={`card transition-all duration-300 ${!isCollapsed ? 'card-expanded-highlight' : ''}`}>
      <div 
        className="settings-header cursor-pointer flex justify-between items-center" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ marginBottom: isCollapsed ? '0' : '16px' }}
      >
        <div className="flex items-center gap-3">
          <div className="icon-box" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            {isNative ? <Smartphone size={20} /> : <Monitor size={20} />}
          </div>
          <div className="text-content">
            <h4>{isNative ? 'Link PC Login (Admin Only)' : 'Link Mobile Login (Admin Only)'}</h4>
            <p>
              {isNative
                ? 'Generate a sync code to log in on your computer without a password.'
                : 'Generate a QR code or 6-digit sync code to log in on your mobile app.'}
            </p>
          </div>
        </div>
        <div>
          {isCollapsed ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 border-t border-[var(--card-border)] pt-4">

      {genError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold flex gap-2">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          <span>{genError}</span>
        </div>
      )}

      {showQuiz ? (
        <form onSubmit={handleVerifyQuiz} className="space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h5 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Identity Verification Required</h5>
            <button type="button" onClick={() => setShowQuiz(false)} className="text-slate-400 hover:text-white p-1">
              <X size={16} />
            </button>
          </div>

          <div style={{
            padding: '14px',
            background: 'var(--bg-main)',
            border: '1px solid var(--card-border)',
            borderRadius: '16px'
          }} className="space-y-4">
            {/* MCQ Staff Question */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Question 1: {mcqQuestion?.question}
              </label>
              <div className="space-y-2">
                {mcqQuestion?.options.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer text-sm text-slate-200 transition-all">
                    <input
                      type="radio"
                      name="staffMcq"
                      required
                      value={opt}
                      checked={mcqAnswer === opt}
                      onChange={e => setMcqAnswer(e.target.value)}
                      className="accent-violet-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Dynamic Info Question */}
            <div className="space-y-2 pt-3 border-t border-white/5">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Question 2: {dynamicQuestion?.question}
              </label>
              {dynamicQuestion?.type === 'dob' ? (
                <input
                  type="date"
                  required
                  value={dynamicAnswer}
                  onChange={e => setDynamicAnswer(e.target.value)}
                  className="sp-input text-sm"
                />
              ) : (
                <input
                  type="text"
                  required
                  value={dynamicAnswer}
                  onChange={e => setDynamicAnswer(e.target.value)}
                  className="sp-input"
                  placeholder="e.g. 9876543210"
                />
              )}
            </div>
          </div>

          <button type="submit" disabled={genLoading} className="btn accent w-full">
            {genLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                <span>Verifying...</span>
              </div>
            ) : (
              <span>Verify &amp; Generate Code</span>
            )}
          </button>
        </form>
      ) : genCode ? (
        <div className="space-y-4">
          {/* QR code (PC only) */}
          {!isNative && qrTokenState && (
            <div className="p-4 bg-white rounded-2xl w-48 h-48 mx-auto flex items-center justify-center shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrTokenState}`}
                alt="PC sync QR"
                className="w-40 h-40"
              />
            </div>
          )}

          {/* Code display */}
          <div className="p-5 bg-violet-500/10 border-2 border-violet-500/30 rounded-2xl text-center space-y-2">
            <p className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">
              6-Digit Sync Code
            </p>
            <div className="text-4xl font-black tracking-[0.3em] text-white ml-[0.3em]">{genCode}</div>
            <p className="text-xs text-slate-400 font-medium">
              Expires in{' '}
              <span className={`font-bold ${countdown <= 60 ? 'text-red-400' : 'text-emerald-400'}`}>
                {countdown !== null ? formatCountdown(countdown) : '5:00'}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleCopy} className="btn outline">
              {copied ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>Copied!</span>
                </div>
              ) : (
                <span>Copy Code</span>
              )}
            </button>
            <button onClick={handleGenerateCode} className="btn ghost text-slate-400">
              <RefreshCw size={14} /> New Code
            </button>
          </div>

          <div className="p-3 bg-slate-800/50 rounded-xl text-xs text-slate-400 font-medium leading-relaxed">
            <strong className="text-slate-300">How to use:</strong>{' '}
            {isNative ? (
              <span>
                On your PC login screen, tap <em>"Scan QR / Enter Code to Login (Only for Admin)"</em> and enter this 6-digit code.
              </span>
            ) : (
              <span>
                On your mobile app login screen, tap <em>"Scan QR / Enter Code to Login (Only for Admin)"</em> and scan this QR code or enter the 6-digit code manually.
              </span>
            )}
          </div>
        </div>
      ) : (
        <button onClick={handleGenerateCode} disabled={genLoading} className="btn accent w-full">
          {genLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Initializing...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              {isNative ? <Smartphone size={16} /> : <Monitor size={16} />}
              <span>Generate Sync Code</span>
            </div>
          )}
        </button>
      )}
      </div>
      )}
    </div>
  );
}
