import React, { useState, useEffect } from 'react';
import { Lock, User, Loader2, AlertCircle, SchoolIcon, ArrowRight, ArrowLeft, Eye, EyeOff, Fingerprint, RefreshCw, Key, HelpCircle, ChevronRight } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorPasskey } from '@capgo/capacitor-passkey';
import { supabase, safeInvokeEdgeFn } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [step, setStep] = useState(1); // 1: School Code, 2: Auth, 3: Recovery Center, 4: School Code Rec, 5: Username Rec, 6: Password Rec, 7: QR Sync PC Screen
  const [schoolCode, setSchoolCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Recovery UI state variables
  const [recoveryRole, setRecoveryRole] = useState('student');
  const [recoveryName, setRecoveryName] = useState('');
  const [recoveryContact, setRecoveryContact] = useState('');
  const [recoveryDob, setRecoveryDob] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  
  // Q&A Wizard states
  const [qaSessionId, setQaSessionId] = useState('');
  const [qaQuestions, setQaQuestions] = useState([]);
  const [currentQaIndex, setCurrentQaIndex] = useState(0);
  const [qaAnswers, setQaAnswers] = useState({});
  const [qaIncorrectList, setQaIncorrectList] = useState([]);
  const [qaAttempts, setQaAttempts] = useState(0);
  const [newRecoveryPassword, setNewRecoveryPassword] = useState('');
  const [confirmRecoveryPassword, setConfirmRecoveryPassword] = useState('');

  // Pin Recovery
  const [recoveryPin, setRecoveryPin] = useState('');

  // QR Sync State
  const [qrToken, setQrToken] = useState('');
  const [qrPollInterval, setQrPollInterval] = useState(null);

  const [globalApp, setGlobalApp] = useState({ name: 'SchoolOS+', logo: null });
  const { setUserAndRole, setSchoolSettings, schoolSettings } = useAppStore();
  const navigate = useNavigate();

  // On mount: reset session
  useEffect(() => {
    setSchoolSettings(null);
    supabase.from('platform_settings').select('app_name, logo_url').single()
      .then(({ data }) => {
        if (data) setGlobalApp({ name: data.app_name || 'SchoolOS+', logo: data.logo_url });
      }).catch(console.error);
  }, [setSchoolSettings]);

  useEffect(() => {
    return () => {
      if (qrPollInterval) clearInterval(qrPollInterval);
    };
  }, [qrPollInterval]);

  const invokeEdgeFn = async (action, body) => {
    if (action === 'webauthn-start' || action === 'webauthn-verify') {
      return safeInvokeEdgeFn(action, body);
    }
    return safeInvokeEdgeFn('hybrid-recovery-handler', { action, ...body });
  };

  const handleIdentifySchool = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (schoolCode.toUpperCase() === 'PLATFORM') {
         setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
         setStep(2);
         return;
      }

      const { data, error: fetchError } = await supabase
        .from('school_settings')
        .select('*')
        .eq('school_code', schoolCode.toUpperCase())
        .maybeSingle();
      
      if (fetchError) throw new Error(fetchError.message);
      if (!data) throw new Error('Invalid School Code. Please check and try again.');
      
      setSchoolSettings(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SUBMIT (WITH BRUTE-FORCE LOCKOUT INTERCEPTION)
  // ─────────────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const rawInput = username.trim();

      // 1. Intercept Check Brute-Force Lockout (Fail-Open)
      try {
        const bfCheck = await invokeEdgeFn('check-brute-force', { username: rawInput });
        if (bfCheck?.locked) {
          const unlockTime = new Date(bfCheck.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          throw new Error(`🔒 Account Temporarily Locked: Too many incorrect login attempts. For security, this username is locked for 2 hours. Please try again after ${unlockTime}.`);
        }
      } catch (bfErr) {
        if (bfErr.message?.includes('Account Temporarily Locked')) {
          throw bfErr;
        }
        console.warn('Brute-force check failed to execute. Failing open:', bfErr);
      }

      // Resolve email from username
      let loginEmail = '';
      if (rawInput.includes('@')) {
        loginEmail = rawInput;
      } else {
        const { data: lookupData, error: lookupError } = await supabase
          .rpc('get_email_by_username', { p_username: rawInput });

        if (lookupError || !lookupData) {
          throw new Error(`No account found for username "${rawInput}". Please check your username.`);
        }
        loginEmail = lookupData;
      }

      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (authError) {
        // Log failure to brute-force monitor (Fail-Open)
        try {
          await invokeEdgeFn('log-failure', { username: rawInput });
        } catch (bfErr) {
          console.warn('Failed to log brute-force failure:', bfErr);
        }
        throw new Error('Incorrect password or account not found.');
      }

      // Reset brute force counter on successful sign-in (Fail-Open)
      try {
        await invokeEdgeFn('reset-failures', { username: rawInput });
      } catch (bfErr) {
        console.warn('Failed to reset brute-force failures:', bfErr);
      }

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id, name')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        throw new Error('Could not load your profile. Please contact your administrator.');
      }

      // School validation (skip for platform_admin)
      if (profile.role !== 'platform_admin') {
        if (profile.school_id !== schoolSettings?.school_id) {
          await supabase.auth.signOut();
          throw new Error('This account does not belong to the selected school workspace.');
        }
      }

      if (profile.role === 'platform_admin' && !schoolSettings) {
        setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
      }

      setUserAndRole(authData.user, profile.role);
      navigate(profile.role === 'platform_admin' ? '/platform-admin' : `/${profile.role}`, { replace: true });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SCHOOL CODE RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecoverSchoolCode = async (e) => {
    e.preventDefault();
    if (!recoveryContact.trim() && !recoveryDob) {
      setError('Please provide either your Registered Contact Number or Date of Birth.');
      return;
    }
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('recover-school-code', {
        name: recoveryName,
        role: recoveryRole,
        contact: recoveryContact.trim() || null,
        dob: recoveryDob || null
      });
      setQaQuestions([{ id: 1, question: data.challengeQuestion, options: data.options }]);
      setQaSessionId(data.sessionId);
      setCurrentQaIndex(0);
      setStep(42); // Challenge screen
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmitSchoolCodeChallenge = async (answer) => {
    setLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('verify-school-code', {
        sessionId: qaSessionId,
        answer
      });
      setSuccess(`Your School Code is: ${data.schoolCode}`);
      setSchoolCode(data.schoolCode);
      setStep(1);
      setTimeout(() => {
        setSuccess('');
      }, 10000); // 10 seconds autohide
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // USERNAME RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecoverUsername = async (e) => {
    e.preventDefault();
    if (!recoveryContact.trim() && !recoveryDob) {
      setError('Please provide either your Registered Contact Number or Date of Birth.');
      return;
    }
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('initiate-recovery', {
        credential_type: 'username',
        school_code: schoolCode,
        password: recoveryPassword,
        name: recoveryName,
        dob: recoveryDob || null,
        contact: recoveryContact.trim() || null
      });
      setQaQuestions(data.questions);
      setQaSessionId(data.sessionId);
      setCurrentQaIndex(0);
      setQaAnswers({});
      setStep(52); // Sequential Q&A screen
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PASSWORD RECOVERY
  // ─────────────────────────────────────────────────────────────────────────
  const handleRecoverPassword = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('initiate-recovery', {
        credential_type: 'password',
        username: username,
        school_code: schoolCode
      });
      setQaQuestions(data.questions);
      setQaSessionId(data.sessionId);
      setCurrentQaIndex(0);
      setQaAnswers({});
      setStep(62); // Question wizard
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // Final evaluation for recovery Q&A
  const handleEvaluateQARecovery = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (qaQuestions.length === 5 && Object.keys(qaAnswers).length < 5) {
        throw new Error('Please answer all 5 questions first.');
      }

      const isPasswordRec = step === 62;

      if (isPasswordRec) {
        if (newRecoveryPassword !== confirmRecoveryPassword) throw new Error('Passwords do not match');
        if (newRecoveryPassword.length < 6) throw new Error('Password must be at least 6 characters');
      }

      const data = await invokeEdgeFn('submit-recovery-answers', {
        sessionId: qaSessionId,
        answers: qaAnswers,
        newPassword: isPasswordRec ? newRecoveryPassword : null
      });

      if (isPasswordRec) {
        setSuccess('Password updated successfully! Redirecting you to login...');
        setTimeout(() => {
          setSuccess('');
          setStep(2);
        }, 3000);
      } else {
        setSuccess(`Your Username is: ${data.username}`);
        setUsername(data.username);
        setStep(2);
        setTimeout(() => {
          setSuccess('');
        }, 10000); // 10 seconds
      }
    } catch (err) {
      // Handle Student strict abort
      if (err.message.includes('aborted') || err.message.includes('Class Teacher')) {
        setError('Verification Failed. Please contact your Class Teacher to reset your password.');
        setQaQuestions([]);
        return;
      }
      setError(err.message);
      // Highlight incorrect questions
      if (err.incorrectQuestions) {
        setQaIncorrectList(err.incorrectQuestions);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // UNIVERSAL QR CODE WEB-SYNC LOGIC
  // ─────────────────────────────────────────────────────────────────────────
  const handleInitiateQrSync = async () => {
    setForgotLoading(true);
    setError('');
    try {
      const data = await invokeEdgeFn('qr-generate', {});
      setQrToken(data.qrToken);
      setStep(7); // Show PC QR Screen

      // Start polling status
      const interval = setInterval(async () => {
        try {
          const status = await invokeEdgeFn('qr-poll', { qrToken: data.qrToken });
          if (status.expired) {
            clearInterval(interval);
            setError('QR session expired. Please refresh.');
          } else if (status.verified) {
            clearInterval(interval);
            setSuccess('Device verified successfully! Logging you in...');
            // Redirect magic link
            window.location.href = status.loginUrl;
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
      setQrPollInterval(interval);
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!Capacitor.isNativePlatform()) return;
    setLoading(true);
    setError('');
    try {
      const startData = await invokeEdgeFn('webauthn-start', { action: 'authenticate', username });
      const { options, sessionKey } = startData;
      let nativeResponse = await CapacitorPasskey.getCredential({ publicKey: options, mediation: 'optional' });
      const verifyData = await invokeEdgeFn('webauthn-verify', {
        action: 'authentication',
        sessionKey,
        response: nativeResponse,
      });

      const { data: authData, error: authError } = await supabase.auth.verifyOtp({
        token_hash: verifyData.token_hash,
        type: 'magiclink',
      });

      if (authError) throw authError;

      const { data: profile } = await supabase.from('users').select('role, school_id').eq('id', authData.user.id).single();
      setUserAndRole(authData.user, profile.role);
      navigate(`/${profile.role}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Biometric verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(800px 400px at 30% 20%, rgba(124, 58, 237, 0.15), transparent), linear-gradient(180deg, #0b1020 0%, #061233 100%)' }}
    >
      <div className="mb-8 text-center relative z-10">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl border border-white/10 overflow-hidden"
          style={{ background: globalApp.logo ? 'transparent' : 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          {globalApp.logo ? (
             <img src={globalApp.logo} alt="Global Logo" className="w-full h-full object-contain" />
          ) : (
             <SchoolIcon size={32} className="text-white" />
          )}
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          {step === 2 && schoolSettings?.name ? schoolSettings.name : globalApp.name}
        </h1>
        <p className="text-slate-400 text-sm mt-1 font-medium">Digital School Workspace</p>
      </div>

      <div className="w-full max-w-md relative z-10 sp-card shadow-2xl">
        {error && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 font-semibold">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
            <div className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5">✓</div>
            <p className="text-sm text-emerald-300 font-semibold">{success}</p>
          </div>
        )}

        {/* 1. School Code Step */}
        {step === 1 && (
          <div className="fade-in">
            <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight mb-5">Enter School Code</h2>
            <form onSubmit={handleIdentifySchool} className="space-y-5">
              <input
                type="text"
                required
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                className="sp-input text-center text-2xl font-black tracking-[0.3em]"
                placeholder="DEMO01"
                autoFocus
              />
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
              </button>
            </form>
            <button onClick={() => setStep(4)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider block mt-4 text-center w-full">
              Forgot School Code?
            </button>
          </div>
        )}

        {/* 2. Login Step */}
        {step === 2 && (
          <div className="fade-in">
            <button onClick={() => { setStep(1); setSchoolSettings(null); }} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors mb-7 uppercase tracking-widest">
              <ArrowLeft size={12} /> Change School
            </button>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Username</label>
                <input id="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="sp-input pl-4" placeholder="e.g. admin or teacher" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="sp-input pl-4 pr-11" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <button type="button" onClick={() => setStep(3)} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">
                  Trouble logging in?
                </button>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
              </button>
            </form>
            {Capacitor.isNativePlatform() && (
              <button onClick={handleBiometricLogin} className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold rounded-xl border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 transition-colors mt-4">
                <Fingerprint size={18} /> Biometric Login
              </button>
            )}
          </div>
        )}

        {/* 3. Account Recovery Center */}
        {step === 3 && (
          <div className="fade-in space-y-4">
            <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back to Login
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-2">Account Help & Recovery</h3>
            <button onClick={() => setStep(6)} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200">
              <span>🔑 Forgot Password?</span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setStep(5)} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200">
              <span>👤 Forgot Username?</span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setStep(4)} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-slate-200">
              <span>🏫 Forgot School Code?</span>
              <ChevronRight size={16} />
            </button>
            {!Capacitor.isNativePlatform() && (
              <button onClick={handleInitiateQrSync} className="w-full py-3 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl text-left text-sm font-semibold flex items-center justify-between text-indigo-300">
                <span>📲 Sync Login with Mobile App (QR Code)</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}

        {/* 4. Recover School Code */}
        {step === 4 && (
          <form onSubmit={handleRecoverSchoolCode} className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Find School Code</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Your Role</label>
              <select value={recoveryRole} onChange={e => setRecoveryRole(e.target.value)} className="sp-input text-sm">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="staff">Staff Member</option>
                <option value="driver">Bus Driver</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</label>
              <input type="text" required value={recoveryName} onChange={e => setRecoveryName(e.target.value)} className="sp-input" placeholder="As registered in school records" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Contact Number</label>
                <input type="tel" value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Mobile Number" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date of Birth</label>
                <input type="date" value={recoveryDob} onChange={e => setRecoveryDob(e.target.value)} className="sp-input text-sm" />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 ml-1">
              Provide at least one: Registered Contact Number or Date of Birth.
            </p>
            <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
              {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
            </button>
          </form>
        )}

        {/* 42. School Code Challenge */}
        {step === 42 && (
          <div className="fade-in space-y-4">
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-2">School Verification</h3>
            <p className="text-xs text-slate-300 font-semibold mb-4">{qaQuestions[0]?.question}</p>
            <div className="space-y-3">
              {qaQuestions[0]?.options.map((opt, i) => (
                <button key={i} onClick={() => handleSubmitSchoolCodeChallenge(opt)} className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm font-semibold text-slate-200">
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 5. Recover Username */}
        {step === 5 && (
          <form onSubmit={handleRecoverUsername} className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Recover Username</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">School Code</label>
              <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} className="sp-input text-center text-lg font-black tracking-widest" placeholder="DEMO01" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Password</label>
              <input type="password" required value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} className="sp-input" placeholder="Enter password to cross-verify" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</label>
              <input type="text" required value={recoveryName} onChange={e => setRecoveryName(e.target.value)} className="sp-input" placeholder="Registered full name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date of Birth</label>
                <input type="date" value={recoveryDob} onChange={e => setRecoveryDob(e.target.value)} className="sp-input text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mobile Number</label>
                <input type="tel" value={recoveryContact} onChange={e => setRecoveryContact(e.target.value)} className="sp-input" placeholder="Registered number" />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 col-span-2 ml-1">
              Provide at least one: Registered Contact Number or Date of Birth.
            </p>
            <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
              {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Identity'}
            </button>
          </form>
        )}

        {/* 6. Recover Password Initial */}
        {step === 6 && (
          <form onSubmit={handleRecoverPassword} className="fade-in space-y-4">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Back
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Reset Password</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Username</label>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="sp-input" placeholder="Enter username" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">School Code</label>
              <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} className="sp-input text-center text-lg font-black tracking-widest" placeholder="DEMO01" />
            </div>
            <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
              {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Get Recovery Questions'}
            </button>
          </form>
        )}

        {/* 52 & 62. Sequential 5-Question Recovery Wizard */}
        {(step === 52 || step === 62) && qaQuestions.length > 0 && (
          <div className="fade-in space-y-4">
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-2">Identity Verification</h3>
            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Question {currentQaIndex + 1} of 5</div>
            <p className="text-xs font-semibold text-slate-200 mt-2 mb-4">{qaQuestions[currentQaIndex]?.question}</p>
            
            {qaQuestions[currentQaIndex]?.options && qaQuestions[currentQaIndex]?.options.length > 0 ? (
              <div className="space-y-3">
                {qaQuestions[currentQaIndex].options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQaAnswers({ ...qaAnswers, [qaQuestions[currentQaIndex].id]: opt });
                      if (currentQaIndex < 4) {
                        setCurrentQaIndex(currentQaIndex + 1);
                      }
                    }}
                    className={`w-full py-3 px-4 border rounded-xl text-left text-sm font-semibold transition-all ${
                      qaAnswers[qaQuestions[currentQaIndex].id] === opt 
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' 
                        : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={qaAnswers[qaQuestions[currentQaIndex].id] || ''}
                  onChange={e => setQaAnswers({ ...qaAnswers, [qaQuestions[currentQaIndex].id]: e.target.value })}
                  className="sp-input"
                  placeholder="Type your answer here..."
                />
                <button
                  onClick={() => {
                    if (currentQaIndex < 4) {
                      setCurrentQaIndex(currentQaIndex + 1);
                    }
                  }}
                  className="btn-primary w-full py-2.5 text-xs font-bold"
                >
                  Save & Next
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
              <button
                disabled={currentQaIndex === 0}
                onClick={() => setCurrentQaIndex(currentQaIndex - 1)}
                className="text-xs text-slate-500 hover:text-slate-300 font-semibold disabled:opacity-30"
              >
                Previous
              </button>
              <button
                disabled={currentQaIndex === 4}
                onClick={() => setCurrentQaIndex(currentQaIndex + 1)}
                className="text-xs text-slate-500 hover:text-slate-300 font-semibold disabled:opacity-30"
              >
                Next
              </button>
            </div>

            {/* Final Submission Block */}
            {Object.keys(qaAnswers).length === 5 && (
              <form onSubmit={handleEvaluateQARecovery} className="space-y-4 pt-4 border-t border-white/10">
                {step === 62 && (
                  <>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Create New Password</h4>
                    <div>
                      <input type="password" required value={newRecoveryPassword} onChange={e => setNewRecoveryPassword(e.target.value)} className="sp-input text-sm" placeholder="New Password (min 6 chars)" />
                    </div>
                    <div>
                      <input type="password" required value={confirmRecoveryPassword} onChange={e => setConfirmRecoveryPassword(e.target.value)} className="sp-input text-sm" placeholder="Confirm New Password" />
                    </div>
                  </>
                )}
                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center font-bold">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Answers'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 7. PC Web QR Sync Screen */}
        {step === 7 && (
          <div className="fade-in text-center space-y-4">
            <button onClick={() => { setStep(3); if (qrPollInterval) clearInterval(qrPollInterval); }} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 mb-4 uppercase tracking-widest">
              <ArrowLeft size={12} /> Cancel Sync
            </button>
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Sync with Mobile App</h3>
            <p className="text-xs text-slate-400">Scan this QR code using your logged-in SchoolOS+ mobile application to sign in instantly.</p>
            
            {qrToken ? (
              <div className="p-4 bg-white rounded-2xl w-64 h-64 mx-auto flex items-center justify-center shadow-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrToken}`}
                  alt="Sync QR Code"
                  className="w-48 h-48"
                />
              </div>
            ) : (
              <div className="w-64 h-64 mx-auto bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
                <Loader2 className="animate-spin text-slate-400" />
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Or enter Sync Code in mobile app:</p>
              <div className="bg-white/10 border border-white/10 rounded-xl py-2 px-4 inline-block text-lg font-black tracking-[0.2em] text-indigo-300">
                {qrToken ? qrToken.slice(0, 6).toUpperCase() : '------'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 text-center mt-8 space-y-3">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">SchoolOS+ Multi-Tenant Platform</p>
      </div>
    </div>
  );
}
