import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';

export default function NotificationBell() {
  const { user } = useAppStore();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // The legacy uses username as to_user. We use the auth user's email as identifier
  // since the new app uses Supabase Auth (email), but the notifications table uses to_user text.
  // We'll match on user.email (which acts as the username in the new system).
  const identifier = user?.email;

  const fetchNotifications = async () => {
    if (!identifier) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('to_user', identifier)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [identifier]);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    if (!identifier || notifications.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).eq('to_user', identifier);
    setNotifications([]);
    setOpen(false);
  };

  const markOneRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-12 right-0 w-80 max-h-96 overflow-y-auto rounded-2xl shadow-2xl z-50 border border-white/10"
          style={{ background: 'rgba(15,23,42,0.97)', backdropFilter: 'blur(16px)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs font-black text-slate-200 uppercase tracking-widest">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500 italic">No new notifications.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map(n => (
                <div key={n.id} className="px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer group"
                  onClick={() => markOneRead(n.id)}>
                  <p className="text-sm text-slate-200 font-semibold leading-snug">{n.message}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
