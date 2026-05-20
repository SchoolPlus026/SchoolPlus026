import React, { useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Megaphone, X, AlertTriangle, Info, CheckCircle } from 'lucide-react';

export default function GlobalBroadcastBanner() {
  const { role } = useAppStore();
  const [announcement, setAnnouncement] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!role) return;

    const fetchBroadcast = async () => {
      // Get the most recent announcement targeted at this role (or 'all')
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .in('target_role', ['all', role])
        // .eq('target_schools', 'all') // we could filter here, but we are keeping it simple
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        // Simple client-side dismissal using localStorage (so it doesn't show again until a new ID arrives)
        const dismissedIds = JSON.parse(localStorage.getItem('dismissed_broadcasts') || '[]');
        if (!dismissedIds.includes(data.id)) {
          setAnnouncement(data);
        }
      }
    };

    fetchBroadcast();

    // Optionally set up real-time listener if we want instant broadcasts without refresh
    const channel = supabase
      .channel('public:announcements')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, payload => {
         const newA = payload.new;
         if (newA.target_role === 'all' || newA.target_role === role) {
            setAnnouncement(newA);
            setDismissed(false);
         }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role]);

  if (!announcement || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    const dismissedIds = JSON.parse(localStorage.getItem('dismissed_broadcasts') || '[]');
    localStorage.setItem('dismissed_broadcasts', JSON.stringify([...dismissedIds, announcement.id]));
  };

  // Determine styles based on type_style ('info', 'warning', 'success')
  let bgClass = 'bg-indigo-600';
  let Icon = Info;
  
  if (announcement.type_style === 'warning') {
    bgClass = 'bg-red-600';
    Icon = AlertTriangle;
  } else if (announcement.type_style === 'success') {
    bgClass = 'bg-emerald-600';
    Icon = CheckCircle;
  }

  return (
    <div className={`relative w-full ${bgClass} text-white px-4 py-2 flex items-center justify-between shadow-md z-40 transition-all`}>
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-1.5 rounded-lg flex-shrink-0">
          <Icon size={16} />
        </div>
        <div className="text-sm font-medium pr-6 leading-tight">
          <span className="font-bold uppercase tracking-widest text-[10px] bg-white/20 px-2 py-0.5 rounded mr-2">Broadcast</span>
          {announcement.message}
        </div>
      </div>
      <button 
        onClick={handleDismiss}
        className="p-1 hover:bg-white/20 rounded-md transition-colors flex-shrink-0"
        title="Dismiss"
      >
        <X size={18} />
      </button>
    </div>
  );
}
