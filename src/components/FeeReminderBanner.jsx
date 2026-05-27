import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { X, IndianRupee, Bell } from 'lucide-react';

/**
 * FeeReminderBanner
 * Shows a dismissible in-app banner on the Student Dashboard
 * whenever there is at least one unread fee_reminder notification.
 * Clicking × marks all fee_reminder notifications as read.
 */
export default function FeeReminderBanner() {
  const { user } = useAppStore();
  const [reminder, setReminder] = useState(null);   // the most recent unread fee_reminder
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;

    const fetchReminder = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('to_user', user.email)
        .eq('is_read', false)
        .like('message', '[FEE_REMINDER]%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && data) {
        setReminder(data);
        setDismissed(false);
      }
    };

    fetchReminder();
    // Refresh every 30 s so newly sent reminders appear without a full reload
    const interval = setInterval(fetchReminder, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.email]);

  const handleDismiss = async () => {
    setDismissed(true);
    if (!user?.email) return;
    // Mark ALL fee_reminder notifications for this user as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('to_user', user.email)
      .like('message', '[FEE_REMINDER]%');
  };

  if (!reminder || dismissed) return null;

  // Strip the [FEE_REMINDER] prefix for display
  const displayMessage = reminder.message.replace('[FEE_REMINDER] ', '');

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        background: 'linear-gradient(135deg, #fff7ed, #fef3c7)',
        border: '1px solid #fcd34d',
        borderLeft: '4px solid #f59e0b',
        borderRadius: '16px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        boxShadow: '0 4px 16px rgba(245,158,11,0.12)',
        position: 'relative',
        animation: 'fadeIn 0.4s ease',
        marginBottom: '0',
      }}
    >
      {/* Icon */}
      <div style={{
        flexShrink: 0, width: '40px', height: '40px', borderRadius: '12px',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 10px rgba(245,158,11,0.3)',
      }}>
        <IndianRupee size={20} color="white" />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <Bell size={12} color="#92400e" />
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Fee Reminder from School
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: '13px', fontWeight: 600,
          color: '#78350f', lineHeight: 1.65,
          wordBreak: 'break-word',
        }}>
          {displayMessage}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#92400e', opacity: 0.75 }}>
          {new Date(reminder.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss fee reminder"
        title="Dismiss"
        style={{
          flexShrink: 0, background: 'rgba(245,158,11,0.12)', border: 'none',
          borderRadius: '8px', padding: '6px', cursor: 'pointer',
          color: '#92400e', transition: 'background 0.2s',
        }}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(245,158,11,0.25)'}
        onMouseOut={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
      >
        <X size={16} />
      </button>
    </div>
  );
}
