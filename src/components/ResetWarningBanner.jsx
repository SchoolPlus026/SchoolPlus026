import React, { useState, useEffect } from 'react';
import { supabase, safeInvokeEdgeFn } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export default function ResetWarningBanner() {
  const { user } = useAppStore();
  const [showAlert, setShowAlert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkRecentReset = async () => {
      try {
        const { data, error } = await supabase
          .from('recovery_profiles')
          .select('password_updated_at, recovery_locked_until')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (error) throw error;
        if (!data) return;

        // Check if locked
        if (data.recovery_locked_until && new Date(data.recovery_locked_until) > new Date()) {
          setLocked(true);
        }

        // Check if password_updated_at is within the last 24 hours
        if (data.password_updated_at) {
          const updatedTime = new Date(data.password_updated_at).getTime();
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

          if (updatedTime > oneDayAgo) {
            setShowAlert(true);
          }
        }
      } catch (err) {
        console.error('[ResetWarningBanner] error:', err);
      }
    };

    checkRecentReset();
  }, [user]);

  const handleItsNotMe = async () => {
    setLoading(true);
    try {
      const data = await safeInvokeEdgeFn('hybrid-recovery-handler', {
        action: 'lock-recovery',
        userId: user?.id
      });

      setLocked(true);
      alert("🔒 Security Action Taken: Password recovery features for this account have been locked for 24 hours. Your current session remains active and safe.");
    } catch (err) {
      alert("Error locking recovery: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!showAlert) return null;

  return (
    <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white py-3 px-4 shadow-lg border-b border-red-500 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
      <div className="flex items-center gap-2.5">
        <ShieldAlert className="flex-shrink-0 text-red-100" size={18} />
        <span className="text-sm font-semibold tracking-wide">
          ⚠️ **Password Changed:** Your account password was changed recently. If this wasn't you, lock your recovery options immediately.
        </span>
      </div>
      <div className="flex items-center gap-2">
        {locked ? (
          <span className="bg-red-800 border border-red-600 text-red-100 text-xs px-3 py-1.5 rounded-full font-bold">
            🔒 Recovery Locked
          </span>
        ) : (
          <button
            onClick={handleItsNotMe}
            disabled={loading}
            className="bg-white text-red-700 hover:bg-red-50 px-4 py-1.5 rounded-full text-xs font-black shadow-md hover:shadow-lg transition-all"
          >
            {loading ? 'Securing...' : "It's Not Me"}
          </button>
        )}
      </div>
    </div>
  );
}
