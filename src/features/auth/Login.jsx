import React, { useState, useEffect } from 'react';
import { Lock, Mail, Loader2, AlertCircle, School, ArrowRight, ArrowLeft } from 'lucide-react';
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

  // Reset error when switching steps
  useEffect(() => setError(''), [step]);

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

      if (fetchError || !data) {
        throw new Error('Invalid School Code. Please check and try again.');
      }

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
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      const user = authData.user;
      
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id')
        .eq('id', user.id)
        .single();
        
      if (profileError) throw new Error('Could not fetch user profile details.');
      if (!profile) throw new Error('User profile completely missing.');

      const { role, school_id } = profile;

      // Verify school_id matches the identified school
      if (school_id !== schoolSettings.school_id) {
        await supabase.auth.signOut();
        throw new Error('This account does not belong to the selected school.');
      }

      if (schoolSettings.subscription_status === 'Expired') {
        await supabase.auth.signOut();
        throw new Error('Your school subscription has expired. Please contact administration.');
      }

      setUserAndRole(user, role);
      navigate(`/${role}`, { replace: true });

    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      {/* Decorative flair */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-indigo-100 blur-3xl opacity-50 -translate-y-1/2 translate-x-1/3"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-blue-100 blur-3xl opacity-50 translate-y-1/3 -translate-x-1/2"></div>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl p-8 relative z-10 mb-8 overflow-hidden">
        
        {step === 1 ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-50 flex items-center justify-center rounded-2xl mx-auto mb-4 border border-indigo-100 shadow-sm">
                <School className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Workspace Gate</h1>
              <p className="text-slate-500 mt-2 text-sm">Enter your School Code to proceed</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleIdentifySchool} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">School Code</label>
                <input
                  type="text"
                  required
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm font-bold tracking-widest text-center text-lg"
                  placeholder="e.g. LFS01"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all disabled:opacity-70 mt-2 hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Identify School <ArrowRight size={18} /></>}
              </button>
            </form>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            <button 
              onClick={() => setStep(1)}
              className="mb-6 flex items-center gap-1 text-xs font-bold text-muted hover:text-primary transition-colors uppercase tracking-widest"
            >
              <ArrowLeft size={14} /> Back to Gate
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-white flex items-center justify-center rounded-2xl mx-auto mb-4 border border-slate-100 shadow-sm p-2 overflow-hidden">
                {schoolSettings?.logo_url ? (
                  <img src={schoolSettings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <School className="w-8 h-8 text-primary" />
                )}
              </div>
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">{schoolSettings?.name}</h1>
              <p className="text-slate-500 mt-1 text-sm">Sign in to your dashboard</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="email">Email / Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <Mail size={18} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
                    placeholder="you@school.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="password">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <Lock size={18} />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all disabled:opacity-70 mt-4 hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter Dashboard'}
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="relative z-10 text-center">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Developed by Shubham Arun Hajare — Contact: 9022761401
        </p>
      </div>
    </div>
  );
}
