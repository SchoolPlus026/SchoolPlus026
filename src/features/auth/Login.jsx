import React, { useState, useEffect } from 'react';
import { Lock, User, Loader2, AlertCircle, SchoolIcon, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [step, setStep] = useState(1); // 1: School Code, 2: Auth
  const [schoolCode, setSchoolCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { setUserAndRole, setSchoolSettings, schoolSettings } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (schoolSettings?.school_id && step === 1) {
      setStep(2);
    }
  }, [schoolSettings, step]);

  const handleIdentifySchool = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('school_settings')
        .select('*')
        .eq('school_code', schoolCode.toUpperCase())
        .single();
      if (fetchError || !data) throw new Error('Invalid School Code. Please check and try again.');
      if (data.subscription_status === 'Expired') throw new Error('This school subscription has expired. Please contact support.');
      setSchoolSettings(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const rawInput = username.trim();

      // ── Step 1: Resolve email from username ──
      // If the input already looks like an email, use it directly.
      // Otherwise, look up the email from the public.users table by username.
      let loginEmail = '';

      if (rawInput.includes('@')) {
        // It's already an email
        loginEmail = rawInput;
      } else {
        // Username lookup — we query public.users to find the linked auth email.
        // We use a public-readable RPC or the anon key select.
        // Since users table has RLS, we call a helper or use auth metadata.
        // Strategy: query auth.users via a known email pattern first (demo), 
        // then fall back to a username→email lookup via the resolve_email_by_username function.
        const { data: lookupData, error: lookupError } = await supabase
          .rpc('get_email_by_username', { p_username: rawInput });

        if (lookupError || !lookupData) {
          throw new Error(`No account found for username "${rawInput}". Please use your email instead.`);
        }
        loginEmail = lookupData;
      }

      // ── Step 2: Sign in with Supabase Auth ──
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });
      if (authError) throw new Error('Incorrect password or account not found.');

      // ── Step 3: Fetch user profile ──
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id, name')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        throw new Error('Could not load your profile. Please contact your administrator.');
      }

      // ── Step 4: School validation (skip for app_manager) ──
      if (profile.role !== 'app_manager') {
        if (profile.school_id !== schoolSettings?.school_id) {
          await supabase.auth.signOut();
          throw new Error('This account does not belong to the selected school workspace.');
        }
      }

      // ── Step 5: For app_manager, load school settings from their own record ──
      if (profile.role === 'app_manager' && !schoolSettings) {
        // App manager has no school; just set a placeholder so the store isn't null
        setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'MANAGER' });
      }

      setUserAndRole(authData.user, profile.role);

      if (profile.role === 'app_manager') {
        navigate('/app-manager', { replace: true });
      } else {
        navigate(`/${profile.role}`, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(800px 400px at 30% 20%, rgba(124, 58, 237, 0.15), transparent), linear-gradient(180deg, #0b1020 0%, #061233 100%)' }}
    >
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: '#60a5fa' }} />

      {/* App header branding */}
      <div className="mb-8 text-center relative z-10">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl border border-white/10"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          <SchoolIcon size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          {step === 2 && schoolSettings?.name ? schoolSettings.name : 'SchoolPro'}
        </h1>
        <p className="text-slate-400 text-sm mt-1 font-medium">
          Digital School — Portal for Students, Teachers &amp; Admin
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10 sp-card shadow-2xl">

        {step === 1 ? (
          <div className="fade-in">
            <div className="mb-8">
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">Enter School Code</h2>
              <p className="text-slate-500 text-xs mt-1 font-semibold uppercase tracking-widest">Use the code provided by your administrator</p>
            </div>

            {error && (
              <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 font-semibold">{error}</p>
              </div>
            )}

            <form onSubmit={handleIdentifySchool} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">School Code</label>
                <input
                  type="text"
                  required
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                  className="sp-input text-center text-2xl font-black tracking-[0.3em]"
                  placeholder="DEMO01"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold"
              >
                {loading
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <>Continue <ArrowRight size={16} /></>
                }
              </button>
            </form>
          </div>
        ) : (
          <div className="fade-in">
            <button
              onClick={() => { setStep(1); setError(''); }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors mb-7 uppercase tracking-widest"
            >
              <ArrowLeft size={12} /> Change School
            </button>

            {/* School identity display */}
            {schoolSettings && (
              <div className="flex items-center gap-3 mb-7 pb-5 border-b border-white/5">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {schoolSettings.logo_url
                    ? <img src={schoolSettings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                    : <SchoolIcon size={18} className="text-indigo-300" />
                  }
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-200">{schoolSettings.name}</div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Authorized Access Only</div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 font-semibold">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <User size={16} />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="sp-input pl-11"
                    placeholder="e.g. admin or teacher"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-600 mt-1 ml-1">Enter your username or full email address</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <Lock size={16} />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="sp-input pl-11 pr-11"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 flex items-center justify-center text-sm font-bold mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center mt-8">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          Developed by Shubham Arun Hajare — 9022761401
        </p>
      </div>
    </div>
  );
}
