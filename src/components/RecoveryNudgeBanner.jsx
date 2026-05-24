import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, X } from 'lucide-react';

/**
 * RecoveryNudgeBanner
 * - Shows orange banner when user has not set up Recovery PIN
 * - Has an X button to dismiss for the current session
 * - Reappears on next page load / next login (session storage key)
 */
export default function RecoveryNudgeBanner() {
  const { user, role } = useAppStore();
  const navigate = useNavigate();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if user dismissed it this session already
    const sessionKey = `recovery_banner_dismissed_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const checkRecoveryStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('recovery_profiles')
          .select('setup_completed')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        // Show banner if no profile or setup incomplete
        if (!data || !data.setup_completed) {
          setShowBanner(true);
        }
      } catch (err) {
        console.error('[RecoveryNudgeBanner] error checking status:', err);
      }
    };

    checkRecoveryStatus();
  }, [user]);

  const handleDismiss = () => {
    // Hide for this session
    if (user?.id) {
      sessionStorage.setItem(`recovery_banner_dismissed_${user.id}`, '1');
    }
    setShowBanner(false);
  };

  const handleRedirect = () => {
    const cleanRole = (role || '').toLowerCase();
    if (cleanRole === 'admin') navigate('/admin/settings');
    else if (cleanRole === 'teacher') navigate('/teacher/settings');
    else if (cleanRole === 'student') navigate('/student/settings');
    else if (cleanRole === 'staff') navigate('/staff/settings');
    else if (cleanRole === 'driver') navigate('/driver/settings');
  };

  if (!showBanner) return null;

  return (
    <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white py-3 px-4 shadow-lg border-b border-orange-500 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
      <div className="flex items-center gap-2.5 flex-1">
        <ShieldAlert className="flex-shrink-0 text-amber-100" size={18} />
        <span className="text-sm font-semibold tracking-wide">
          🔒 Keep Your Account Safe! Setup your 6-digit Recovery PIN and Fingerprint so you can easily reset your password if you ever forget it.
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRedirect}
          className="flex items-center gap-1 bg-white text-orange-700 hover:bg-orange-50 px-4 py-1.5 rounded-full text-xs font-black shadow-md hover:shadow-lg transition-all"
        >
          Setup Now <ArrowRight size={14} />
        </button>
        <button
          onClick={handleDismiss}
          title="Dismiss for this session"
          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-all flex-shrink-0"
          aria-label="Close banner"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
