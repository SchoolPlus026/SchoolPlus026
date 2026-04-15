import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Bell, Calendar, Loader2, Sparkles, Megaphone } from 'lucide-react';

export default function DashboardHero() {
  const { schoolSettings, user } = useAppStore();

  const { data: latestNotice, isLoading: noticeLoading } = useQuery({
    queryKey: ['latest-notice', schoolSettings?.school_id],
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
    enabled: !!schoolSettings?.school_id
  });

  const { data: upcomingEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['upcoming-events', schoolSettings?.school_id],
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
    enabled: !!schoolSettings?.school_id
  });

  return (
    <div className="space-y-6 mb-8">
      {/* Hero Header */}
      <div className="bg-primary rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-primary/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2 text-primary-foreground/80 font-semibold tracking-wide uppercase text-xs">
            <Sparkles size={14} /> Global Workspace Dashboard
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            Welcome to {schoolSettings?.name || 'School Portal'}
          </h1>
          <p className="text-primary-foreground/90 max-w-2xl text-lg">
            Manage your educational operations, broadcast notices, and track school performance in real-time.
          </p>
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Latest Notice Card */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col hover:border-primary/30 transition-colors group">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100">
                <Megaphone size={20} />
              </div>
              <h3 className="font-bold text-text">Latest Notice</h3>
            </div>
          </div>
          
          {noticeLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted" /></div>
          ) : latestNotice ? (
            <div className="flex-1">
              <h4 className="font-bold text-slate-800 mb-1 group-hover:text-primary transition-colors">{latestNotice.title}</h4>
              <p className="text-sm text-muted line-clamp-2 mb-3">{latestNotice.content}</p>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Posted on {new Date(latestNotice.created_at).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted italic border-2 border-dashed border-slate-50 rounded-xl">
              No recent announcements found.
            </div>
          )}
        </div>

        {/* Upcoming Events Card */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col hover:border-primary/30 transition-colors group">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-500 flex items-center justify-center border border-teal-100">
                <Calendar size={20} />
              </div>
              <h3 className="font-bold text-text">Upcoming Events</h3>
            </div>
          </div>

          {eventsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted" /></div>
          ) : upcomingEvents.length > 0 ? (
            <div className="space-y-4 flex-1">
              {upcomingEvents.map(event => (
                <div key={event.id} className="flex items-start gap-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-center min-w-[50px]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-lg font-black text-slate-800 leading-none mt-1">
                      {new Date(event.start_date).getDate()}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-0.5">{event.title}</h4>
                    <p className="text-[11px] text-muted line-clamp-1 capitalize">{event.type}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted italic border-2 border-dashed border-slate-50 rounded-xl">
              No upcoming events scheduled.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
