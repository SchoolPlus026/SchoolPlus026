import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Bell, Calendar, Loader2, Megaphone, Sparkles } from 'lucide-react';

export default function DashboardHero() {
  const { schoolSettings, user } = useAppStore();

  // ── SAFETY: Use safe fallback in queryKey to avoid null dereference ──
  const schoolId = schoolSettings?.school_id ?? null;

  const { data: latestNotice, isLoading: noticeLoading } = useQuery({
    queryKey: ['latest-notice', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
    enabled: !!schoolId
  });

  const { data: upcomingEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['upcoming-events', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('start_date', new Date().toISOString().split('T')[0])
        .order('start_date', { ascending: true })
        .limit(2);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId
  });

  return (
    <div className="space-y-5 mb-2">
      {/* ── Hero Header Card (gradient, matches legacy style) ── */}
      <div
        className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
      >
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/10 rounded-full -ml-12 -mb-12 blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3 text-indigo-200/80 font-semibold tracking-widest uppercase text-[10px]">
            <Sparkles size={12} />
            Global Workspace Dashboard
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 text-white">
            Welcome to {schoolSettings?.name || 'School Portal'}
          </h1>
          <p className="text-indigo-200/90 max-w-xl text-sm leading-relaxed">
            Digital School — Portal for Students, Teachers &amp; Admin
          </p>
        </div>
      </div>

      {/* ── Info Widgets Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Latest Notice */}
        <div className="sp-card flex flex-col group hover:border-indigo-500/30 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Megaphone size={16} />
            </div>
            <h3 className="font-bold text-slate-200 text-sm uppercase tracking-widest">Latest Notice</h3>
          </div>

          {noticeLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : latestNotice ? (
            <div className="flex-1">
              <h4 className="font-bold text-slate-100 mb-1 text-sm group-hover:text-indigo-400 transition-colors">
                {latestNotice.title}
              </h4>
              <p className="text-xs text-slate-400 clamp-2 mb-3 leading-relaxed">
                {latestNotice.content}
              </p>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Posted {new Date(latestNotice.created_at).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic border border-dashed border-slate-700 rounded-xl py-6">
              No recent announcements.
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="sp-card flex flex-col group hover:border-indigo-500/30 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
              <Calendar size={16} />
            </div>
            <h3 className="font-bold text-slate-200 text-sm uppercase tracking-widest">Upcoming Events</h3>
          </div>

          {eventsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-3 flex-1">
              {upcomingEvents.map(event => (
                <div key={event.id} className="flex items-start gap-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-center min-w-[46px]">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                      {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-base font-black text-slate-100 leading-none mt-1">
                      {new Date(event.start_date).getDate()}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200 mb-0.5">{event.title}</h4>
                    <p className="text-[11px] text-slate-500 capitalize">{event.type}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic border border-dashed border-slate-700 rounded-xl py-6">
              No upcoming events scheduled.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
