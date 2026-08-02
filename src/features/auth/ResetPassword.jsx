import React, { useState, useEffect } from 'react';
import { Lock, Loader2, AlertCircle, CheckCircle2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../config/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a session (meaning the recovery link worked)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // We stay on this page
      }
    });
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: userProfile } = await supabase.from('users').select('school_id').eq('id', currentUser.id).maybeSingle();
        if (userProfile?.school_id) {
          const { data: sch } = await supabase.from('school_settings').select('school_code').eq('school_id', userProfile.school_id).maybeSingle();
          const { data: plat } = await supabase.from('platform_settings').select('allow_demo_edit').maybeSingle();
          if (sch?.school_code === '100' && !plat?.allow_demo_edit) {
            throw new Error('🔒 Demo Account Protection: Password reset is disabled for sandbox demo accounts.');
          }
        }
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      // Clean recovery modal flag from localStorage so optional password sync does not fire
      localStorage.removeItem('show_sync_password_reset');
      
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-x-hidden overflow-y-auto"
      style={{ background: 'radial-gradient(800px 400px at 30% 20%, rgba(124, 58, 237, 0.15), transparent), linear-gradient(180deg, #0b1020 0%, #061233 100%)' }}
    >
      <div className="w-full max-w-md relative z-10 sp-card shadow-2xl">
        <div className="mb-8">
          <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">Reset Password</h2>
          <p className="text-slate-500 text-xs mt-1 font-semibold uppercase tracking-widest">Create a new secure password for your account</p>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300 font-semibold">{error}</p>
          </div>
        )}

        {success ? (
          <div className="text-center py-8 animate-in zoom-in duration-500">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-white font-bold text-xl mb-2">Password Updated!</h3>
            <p className="text-slate-400 text-sm mb-6">Your password has been changed successfully. Redirecting you to login...</p>
            <button
              onClick={() => navigate('/login')}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold"
            >
              Go to Login <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="sp-input pl-11 pr-11"
                  placeholder="••••••••"
                  autoFocus
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                   {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Confirm New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="sp-input pl-11 pr-11"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                   {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
