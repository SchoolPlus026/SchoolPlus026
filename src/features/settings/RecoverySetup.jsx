import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { KeyRound, ShieldCheck, Loader2, Save, Lock, ChevronDown, ChevronUp } from 'lucide-react';

const QUESTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is the name of your favorite pet?",
  "What city were you born in?",
  "What is your favorite food?"
];

export default function RecoverySetup() {
  const { user } = useAppStore();
  const [profile, setProfile] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [q1, setQ1] = useState(QUESTIONS[0]);
  const [a1, setA1] = useState('');
  const [q2, setQ2] = useState(QUESTIONS[1]);
  const [a2, setA2] = useState('');

  const [answersRevealed, setAnswersRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const fetchProfile = async () => {
    setFetching(true);
    try {
      const { data, error: err } = await supabase
        .from('recovery_profiles')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (err) throw err;
      if (data) {
        setProfile(data);
        setPin('');
        setConfirmPin('');
        setQ1(data.security_question_1 || QUESTIONS[0]);
        setQ2(data.security_question_2 || QUESTIONS[1]);
        setAnswersRevealed(false);
        setA1('');
        setA2('');
      }
    } catch (err) {
      console.error("Failed to fetch recovery profile", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchProfile();
    }
  }, [user?.id]);

  const handleRevealAnswers = async () => {
    setError('');
    setSuccess('');
    if (!currentPassword) {
      setError('Please enter your current password to reveal security answers.');
      return;
    }
    setRevealing(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: currentPassword
      });
      if (authErr) throw new Error('Incorrect password. Authorization failed.');

      if (profile) {
        setA1(profile.security_answer_1_hash || '');
        setA2(profile.security_answer_2_hash || '');
        setAnswersRevealed(true);
        setSuccess('Security answers revealed successfully.');
      } else {
        setError('No recovery profile configured yet.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRevealing(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Please enter your current password to authorize changes.');
      return;
    }

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setError('Recovery PIN must be exactly 6 digits.');
      return;
    }

    if (pin !== confirmPin) {
      setError('Recovery PINs do not match.');
      return;
    }

    if ((answersRevealed || !profile?.setup_completed) && (!a1.trim() || !a2.trim())) {
      setError('Please provide answers for both security questions.');
      return;
    }

    if (q1 === q2) {
      setError('Please select two different security questions.');
      return;
    }

    setLoading(true);
    try {
      // 1. Re-authenticate user to verify password
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: currentPassword
      });

      if (authErr) {
        throw new Error('Incorrect current password. Authorization failed.');
      }

      // 2. Build payload securely using existing answers if they were not revealed/changed
      const payload = {
        user_id: user?.id,
        school_id: user?.user_metadata?.school_id || null,
        pin_hash: pin, // Stores PIN
        security_question_1: q1,
        security_answer_1_hash: answersRevealed || !profile?.setup_completed ? a1.trim().toLowerCase() : profile.security_answer_1_hash,
        security_question_2: q2,
        security_answer_2_hash: answersRevealed || !profile?.setup_completed ? a2.trim().toLowerCase() : profile.security_answer_2_hash,
        setup_completed: true,
        updated_at: new Date().toISOString()
      };

      const { error: dbErr } = await supabase
        .from('recovery_profiles')
        .upsert(payload, { onConflict: 'user_id' });

      if (dbErr) throw dbErr;

      setSuccess('Recovery credentials configured successfully!');
      setCurrentPassword('');
      fetchProfile();

      // Notify the nudge banner to hide immediately
      window.dispatchEvent(new Event('recovery-setup-completed'));
    } catch (err) {
      setError(err.message || 'Failed to configure recovery profile.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="card flex items-center justify-center p-6">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className={`card transition-all duration-300 ${!isCollapsed ? 'card-expanded-highlight' : ''}`}>
      <div 
        className="settings-header cursor-pointer flex justify-between items-center" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ marginBottom: isCollapsed ? '0' : '16px' }}
      >
        <div className="flex items-center gap-3">
          <div className="icon-box" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <KeyRound size={20} />
          </div>
          <div className="text-content">
            <h4>Account Recovery PIN</h4>
            <p>Configure a secure PIN and backup questions to recover your password without emails.</p>
          </div>
        </div>
        <div>
          {isCollapsed ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 border-t border-[var(--card-border)] pt-4">
          {profile?.setup_completed ? (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-sm text-emerald-400 font-semibold">
              <ShieldCheck size={18} />
              <span>Account Recovery is active. You can update your PIN below anytime.</span>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-sm text-amber-400 font-semibold">
              <span>⚠️ Recovery setup is pending. Please configure your PIN and backup questions.</span>
            </div>
          )}

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

          <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Current Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
              <Lock size={16} />
            </div>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="sp-input pl-11"
              placeholder="Enter current password to verify"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">6-Digit Recovery PIN</label>
            <input
              type="password"
              pattern="\d*"
              maxLength={6}
              required
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="sp-input text-center text-lg tracking-[0.2em] font-bold"
              placeholder="••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Confirm PIN</label>
            <input
              type="password"
              pattern="\d*"
              maxLength={6}
              required
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="sp-input text-center text-lg tracking-[0.2em] font-bold"
              placeholder="••••••"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
          <div className="flex justify-between items-center mb-3">
            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Backup Questions</h5>
            {profile?.setup_completed && !answersRevealed && (
              <button
                type="button"
                disabled={revealing}
                onClick={handleRevealAnswers}
                className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1"
              >
                {revealing ? <Loader2 size={10} className="animate-spin" /> : '👁️'} Reveal Saved Answers
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <select 
                disabled={profile?.setup_completed && !answersRevealed}
                value={q1} 
                onChange={e => setQ1(e.target.value)} 
                className="sp-input w-full text-sm mb-2"
              >
                {QUESTIONS.map((q, i) => <option key={i} value={q}>{q}</option>)}
              </select>
              <input
                type={answersRevealed || !profile?.setup_completed ? "text" : "password"}
                required={!profile?.setup_completed || answersRevealed}
                value={a1}
                onChange={e => setA1(e.target.value)}
                className="sp-input w-full text-sm"
                placeholder={answersRevealed || !profile?.setup_completed ? "Enter Answer 1" : "•••••••• (Hashed - Reveal to view/edit)"}
                disabled={profile?.setup_completed && !answersRevealed}
              />
            </div>

            <div>
              <select 
                disabled={profile?.setup_completed && !answersRevealed}
                value={q2} 
                onChange={e => setQ2(e.target.value)} 
                className="sp-input w-full text-sm mb-2"
              >
                {QUESTIONS.map((q, i) => <option key={i} value={q}>{q}</option>)}
              </select>
              <input
                type={answersRevealed || !profile?.setup_completed ? "text" : "password"}
                required={!profile?.setup_completed || answersRevealed}
                value={a2}
                onChange={e => setA2(e.target.value)}
                className="sp-input w-full text-sm"
                placeholder={answersRevealed || !profile?.setup_completed ? "Enter Answer 2" : "•••••••• (Hashed - Reveal to view/edit)"}
                disabled={profile?.setup_completed && !answersRevealed}
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn accent w-full mt-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Saving Configuration...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Save size={16} />
              <span>Save Recovery PIN</span>
            </div>
          )}
        </button>
      </form>
      </div>
      )}
    </div>
  );
}
