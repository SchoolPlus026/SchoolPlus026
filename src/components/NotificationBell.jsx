import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { usePlan } from '../hooks/usePlan';
import { useTieredCache } from '../hooks/useTieredCache';

export default function NotificationBell() {
  const { user } = useAppStore();
  const { isFree } = usePlan();
  const cacheConfig = useTieredCache({
    freeStaleTime: 10 * 60 * 1000,
    premiumStaleTime: 30 * 1000,
    premiumRefetchInterval: 60000
  });
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // The legacy uses username as to_user. We use the auth user's email as identifier
  // since the new system uses Supabase Auth (email), but the notifications table uses to_user text.
  const identifier = user?.email;

  // 1. Load from localStorage cache on mount
  useEffect(() => {
    if (!identifier) return;
    const cacheKey = `unread_notifications_${identifier}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setNotifications(JSON.parse(cached));
      } catch (e) {
        console.warn('Failed to parse cached notifications:', e);
      }
    }
  }, [identifier]);

  // Helper to save notifications to cache
  const updateNotifications = (newList) => {
    setNotifications(newList);
    if (identifier) {
      localStorage.setItem(`unread_notifications_${identifier}`, JSON.stringify(newList));
    }
  };

  const fetchNotifications = async () => {
    if (!identifier) return;
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('to_user', identifier)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      updateNotifications(data || []);
    } catch (err) {
      console.warn('Failed to fetch notifications:', err.message);
    }
  };

  // 2. Setup periodic polling & listen to FCM events
  useEffect(() => {
    if (!identifier) return;

    // Fetch once on mount
    fetchNotifications();

    // Setup polling based on caching engine refetchInterval
    let interval = null;
    if (cacheConfig.refetchInterval) {
      interval = setInterval(fetchNotifications, cacheConfig.refetchInterval);
    }

    // 3. Listen to FCM foreground pushes to increment counter client-side
    const handlePushReceived = (e) => {
      const notification = e.detail;
      const virtualNotification = {
        id: `fcm-${Date.now()}`,
        message: notification.body || notification.title || 'New notification received',
        created_at: new Date().toISOString(),
        is_read: false
      };
      setNotifications((prev) => {
        const updated = [virtualNotification, ...prev];
        localStorage.setItem(`unread_notifications_${identifier}`, JSON.stringify(updated));
        return updated;
      });
    };

    window.addEventListener('sp-push-received', handlePushReceived);

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener('sp-push-received', handlePushReceived);
    };
  }, [identifier, isFree, cacheConfig.refetchInterval]);

  // Fetch when user opens the bell to ensure fresh data
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open]);

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
    try {
      // Filter out virtual IDs before hitting database update
      const dbIds = notifications
        .filter(n => !n.id.toString().startsWith('fcm-'))
        .map(n => n.id);
      
      if (dbIds.length > 0) {
        await supabase.from('notifications').update({ is_read: true }).in('id', dbIds);
      }
      // Clean up virtual notifications that don't exist in DB too
      await supabase.from('notifications').update({ is_read: true }).eq('to_user', identifier);
      
      updateNotifications([]);
      setOpen(false);
    } catch (err) {
      console.warn('Failed to mark all read:', err.message);
    }
  };

  const markOneRead = async (id) => {
    try {
      if (!id.toString().startsWith('fcm-')) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      }
      updateNotifications(notifications.filter(n => n.id !== id));
    } catch (err) {
      console.warn('Failed to mark one read:', err.message);
    }
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
        <div className="fixed sm:absolute top-16 sm:top-12 left-4 right-4 sm:left-auto sm:right-0 sm:w-80 max-h-96 overflow-y-auto rounded-2xl shadow-2xl z-50 border border-white/10"
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
