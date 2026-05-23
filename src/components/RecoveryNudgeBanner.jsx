import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export default function RecoveryNudgeBanner() {
  const { user, role } = useAppStore();
  const navigate = useNavigate();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if recovery profile setup is completed
    const checkRecoveryStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('recovery_profiles')
          .select('setup_completed')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        // If no record exists or setup is incomplete, show the nudge
        if (!data || !data.setup_completed) {
          setShowBanner(true);
        } else {
          setShowBanner(false);
        }
      } catch (err) {
        console.error('[RecoveryNudgeBanner] error checking status:', err);
      }
    };

    checkRecoveryStatus();
  }, [user]);

  if (!showBanner) return null;

  const handleRedirect = () => {
    const cleanRole = (role || '').toLowerCase();
    if (cleanRole === 'admin') navigate('/admin/settings');
    else if (cleanRole === 'teacher') navigate('/teacher/settings');
    else if (cleanRole === 'student') navigate('/student/settings');
    else if (cleanRole === 'staff') navigate('/staff/settings');
    else if (cleanRole === 'driver') navigate('/driver/settings');
  };

  return (
    <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white py-3 px-4 shadow-lg border-b border-orange-500 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left animate-pulse">
      <div className="flex items-center gap-2.5">
        <ShieldAlert className="flex-shrink-0 text-amber-100" size={18} />
        <span className="text-sm font-semibold tracking-wide">
          🔒 Keep Your Account Safe! Setup your 6-digit Recovery PIN and Fingerprint so you can easily reset your password if you ever forget it.
        </span>
      </div>
      <button
        onClick={handleRedirect}
        className="flex items-center gap-1 bg-white text-orange-700 hover:bg-orange-50 px-4 py-1.5 rounded-full text-xs font-black shadow-md hover:shadow-lg transition-all"
      >
        Setup Now <ArrowRight size={14} />
      </button>
    </div>
  );
}
