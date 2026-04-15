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

  // On mount, check if there's already a school identified in the store
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
      
      // Verification: Ensure the user record in public.users matches the school_id identified
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id')
        .eq('id', user.id)
        .single();
        
      if (profileError) throw new Error('Could not fetch user profile details.');
      if (!profile) throw new Error('User profile missing in public.users table.');

      const { role, school_id } = profile;

      if (school_id !== schoolSettings.school_id) {
        await supabase.auth.signOut();
        throw new Error('This account is not authorized for this school workspace.');
      }

      setUserAndRole(user, role);
      navigate(`/${role}`, { replace: true });

    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToStep1 = () => {
    setStep(1);
    // Optional: clearIdentifiedSchool if you want them to start completely fresh
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      {/* Background flare */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-60 -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-60 -ml-20 -mb-20"></div>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/50 p-8 relative z-10 mb-8 overflow-hidden transform transition-all duration-300">
        
        {step === 1 ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-indigo-50 flex items-center justify-center rounded-2xl mx-auto mb-4 border border-indigo-100 shadow-sm">
                <School className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Workspace Gate</h1>
              <p className="text-slate-500 mt-2 font-medium">Verify your School Code to proceed</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-semibold">{error}</p>
              </div>
            )}

            <form onSubmit={handleIdentifySchool} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Organization Code</label>
                <input
                  type="text"
                  required
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                  className="block w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-inner font-black tracking-[0.2em] text-center text-xl"
                  placeholder="e.g. DEMO01"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl shadow-lg shadow-indigo-200 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all disabled:opacity-70 group"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue to Login <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
              </button>
            </form>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            <button 
              onClick={handleBackToStep1}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-primary transition-colors mb-8 group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" /> Back to Gate
            </button>

            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-white shadow-sm border border-slate-100 rounded-3xl mx-auto mb-4 p-3 flex items-center justify-center overflow-hidden">
                {schoolSettings?.logo_url ? (
                  <img src={schoolSettings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <School className="w-10 h-10 text-primary opacity-20" />
                )}
              </div>
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">{schoolSettings?.name}</h1>
              <p className="text-slate-500 mt-1 font-medium italic">Authorized Access Only</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-semibold">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1" htmlFor="email">Email / Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-inner"
                    placeholder="name@organization.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1" htmlFor="password">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-inner"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center py-4 px-4 rounded-2xl shadow-xl shadow-primary/20 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all disabled:opacity-70 mt-4 active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter Portal'}
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="relative z-10 text-center">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Developed by Shubham Arun Hajare — Contact: 9022761401
        </p>
      </div>
    </div>
  );
}
