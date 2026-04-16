import React, { useState, useEffect } from 'react';
import { Lock, Mail, Loader2, AlertCircle, SchoolIcon, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [step, setStep] = useState(1); // 1: School Code, 2: Auth
  const [schoolCode, setSchoolCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      // ── Simple Demo Credentials Interception ──
      let loginEmail = email.trim();
      let loginPassword = password;
      
      if (loginEmail === 'admin') loginEmail = 'admin@demo.com';
      if (loginEmail === 'teacher') loginEmail = 'teacher@demo.com';
      if (loginEmail === 'student') loginEmail = 'student@demo.com';
      if (loginEmail === 'manager') loginEmail = 'manager@demo.com';
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
        email: loginEmail, 
        password: loginPassword 
      });
      if (authError) throw authError;

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id')
        .eq('id', authData.user.id)
        .single();

      if (profileError) throw new Error('Could not fetch user profile details.');
      if (!profile) throw new Error('User profile missing in public.users table.');

      if (profile.role !== 'app_manager' && profile.school_id !== schoolSettings?.school_id) {
        await supabase.auth.signOut();
        throw new Error('This account is not authorized for this school workspace.');
      }

      setUserAndRole(authData.user, profile.role);
      
      if (profile.role === 'app_manager') {
         navigate('/app-manager', { replace: true });
      } else {
         navigate(`/${profile.role}`, { replace: true });
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login');
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
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">Workspace Gate</h2>
              <p className="text-slate-500 text-xs mt-1 font-semibold uppercase tracking-widest">Verify your School Code to proceed</p>
            </div>

            {error && (
              <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 font-semibold">{error}</p>
              </div>
            )}

            <form onSubmit={handleIdentifySchool} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Organization Code</label>
                <input
                  type="text"
                  required
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                  className="sp-input text-center text-2xl font-black tracking-[0.3em]"
                  placeholder="DEMO01"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold"
              >
                {loading
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <>Continue to Login <ArrowRight size={16} /></>
                }
              </button>
            </form>
          </div>
        ) : (
          <div className="fade-in">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors mb-7 uppercase tracking-widest"
            >
              <ArrowLeft size={12} /> Back to Gate
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
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Email / Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <Mail size={16} />
                  </div>
                  <input
                    id="email"
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="sp-input pl-11"
                    placeholder="name@organization.com or Username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <Lock size={16} />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="sp-input pl-11"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 flex items-center justify-center text-sm font-bold mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter Portal'}
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
