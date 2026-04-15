import React, { useState } from 'react';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { setUserAndRole, setSchoolSettings } = useAppStore();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Authenticate user via Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      const user = authData.user;
      
      // 2. Fetch User Profile to derive the specific role and school_id
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, school_id')
        .eq('id', user.id)
        .single();
        
      if (profileError) throw new Error('Could not fetch user profile details.');
      if (!profile) throw new Error('User profile completely missing.');

      const { role, school_id } = profile;

      // 3. Fetch Tenant Settings for dynamic gating
      const { data: settings, error: settingsError } = await supabase
        .from('school_settings')
        .select('*')
        .eq('school_id', school_id)
        .single();

      if (settingsError) throw new Error('Could not fetch school dynamic workspace settings.');
      if (!settings) throw new Error('School settings unconfigured mapping. Contact support.');

      // 4. Evaluate School Subscription Payment Status
      if (settings.subscription_status === 'Expired') {
        // Kick them out immediately
        await supabase.auth.signOut();
        throw new Error('Your school subscription has expired. Please contact administration.');
      }

      // 5. Success! Populate Zustand global scope state and redirect
      setSchoolSettings(settings);
      setUserAndRole(user, role);
      
      // Declarative router push based on role
      navigate(`/${role}`, { replace: true });

    } catch (err) {
      setError(err.message || 'An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-surface border border-glass rounded-2xl shadow-2xl p-8 relative overflow-hidden">
        {/* Decorative flair behind login elements */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-primary/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 rounded-full bg-accent/10 blur-2xl"></div>

        <div className="text-center mb-8 relative z-10">
          <div className="w-16 h-16 bg-[#1a2b5c] flex items-center justify-center rounded-2xl mx-auto mb-4 border border-glass shadow-md">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h1>
          <p className="text-muted mt-2 text-sm">Sign in to your digital workspace</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 relative z-10">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5 relative z-10">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="email">
              Email Address / Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-500" />
              </div>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 bg-[#0a1435] border border-glass rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="you@school.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-500" />
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 bg-[#0a1435] border border-glass rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2 hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
