import React, { useState } from 'react';
import { safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Users, Search, Key, CheckCircle2, AlertCircle, Copy, Loader2, X } from 'lucide-react';

/**
 * ColleagueAssistPanel — Teacher-to-Teacher help
 *
 * A logged-in teacher can generate a one-time password reset token
 * for a locked-out colleague in the same school.
 *
 * Flow:
 *  1. Teacher enters colleague's username
 *  2. System verifies colleague exists in same school (not a student)
 *  3. System generates a one-time token (stored in DB, expires in 30 mins)
 *  4. Teacher shares the 6-digit token with colleague verbally/physically
 *  5. Colleague uses the token on the login screen to reset their password
 */
export default function ColleagueAssistPanel() {
  const { user, schoolSettings } = useAppStore();

  const [colleagueUsername, setColleagueUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { token, colleagueName, expiresAt }
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!colleagueUsername.trim()) {
      setError('Please enter your colleague\'s username.');
      return;
    }

    setLoading(true);
    try {
      const data = await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'generate-colleague-token',
        helperUserId: user?.id,
        colleagueUsername: colleagueUsername.trim()
      });

      setResult(data);
      setColleagueUsername('');

      // Start countdown timer (30 minutes = 1800 seconds)
      const expiry = new Date(data.expiresAt);
      const tick = () => {
        const remaining = Math.max(0, Math.floor((expiry - new Date()) / 1000));
        setCountdown(remaining);
        if (remaining > 0) setTimeout(tick, 1000);
        else { setResult(null); setCountdown(null); }
      };
      setTimeout(tick, 1000);

    } catch (err) {
      setError(err.message || 'Failed to generate token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.token) {
      navigator.clipboard.writeText(result.token).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleReset = () => {
    setResult(null);
    setCountdown(null);
    setError('');
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="settings-header" style={{ marginBottom: '16px' }}>
        <div className="icon-box" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
          <Users size={20} />
        </div>
        <div className="text-content">
          <h4>Assist a Colleague</h4>
          <p>Generate a one-time reset token to help a locked-out colleague in your school.</p>
        </div>
      </div>

      {/* How it works notice */}
      <div style={{
        padding: '12px 14px',
        background: 'rgba(16, 185, 129, 0.07)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '12px',
        marginBottom: '16px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        lineHeight: 1.7
      }}>
        <strong style={{ color: 'var(--text-main)' }}>How it works:</strong><br />
        1. Enter your colleague's <strong>username</strong> below.<br />
        2. A <strong>6-digit one-time token</strong> will be generated (valid 30 mins).<br />
        3. Share this token with your colleague — they enter it on the login screen under <em>"Account Help &amp; Recovery"</em> to reset their password.
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: '12px', padding: '10px 14px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px'
        }}>
          <AlertCircle size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: '1px' }} />
          <p style={{ margin: 0, fontSize: '13px', color: '#fca5a5', fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* Result: Token display */}
      {result ? (
        <div style={{ space: '12px' }}>
          <div style={{
            padding: '20px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '2px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '16px',
            textAlign: 'center',
            marginBottom: '12px'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
              ✅ One-Time Reset Token for {result.colleagueName}
            </div>
            <div style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '0.3em', color: 'var(--text-main)', marginBottom: '6px' }}>
              {result.token}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Expires in{' '}
              <span style={{ fontWeight: 700, color: countdown <= 300 ? '#f87171' : '#10b981' }}>
                {countdown !== null ? formatCountdown(countdown) : '30:00'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <button onClick={handleCopy} className="btn outline" style={{ fontSize: '13px' }}>
              {copied
                ? <><CheckCircle2 size={14} style={{ color: '#10b981' }} /> Copied!</>
                : <><Copy size={14} /> Copy Token</>
              }
            </button>
            <button onClick={handleReset} className="btn ghost" style={{ fontSize: '13px' }}>
              <X size={14} /> Clear &amp; New
            </button>
          </div>

          <div style={{
            padding: '10px 12px',
            background: 'var(--bg-main)',
            borderRadius: '10px',
            border: '1px solid var(--card-border)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            lineHeight: 1.7
          }}>
            📋 <strong>Tell your colleague:</strong> Go to the login screen → tap <em>"Account Help &amp; Recovery"</em> → <em>"Use Colleague Token"</em> → enter this 6-digit code to reset their password.
          </div>
        </div>
      ) : (
        /* Input form */
        <form onSubmit={handleGenerateToken} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Colleague's Username
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                value={colleagueUsername}
                onChange={e => setColleagueUsername(e.target.value)}
                className="sp-input"
                placeholder="e.g. teacher.ravi or staff.meera"
                style={{ paddingLeft: '40px' }}
              />
              <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '2px' }}>
              Enter the exact username of the teacher/staff you want to help. Students are not eligible for peer-assisted recovery.
            </p>
          </div>

          <button type="submit" disabled={loading} className="btn accent w-full">
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                Generating Token...
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Key size={15} />
                Generate One-Time Token
              </div>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
