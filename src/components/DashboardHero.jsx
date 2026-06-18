import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { Bell, Calendar, Loader2, Megaphone, Sparkles } from 'lucide-react';
import { useTieredCache } from '../hooks/useTieredCache';

export default function DashboardHero() {
  const { schoolSettings, user } = useAppStore();

  const schoolId = schoolSettings?.school_id ?? null;

  const noticeCacheKey = `sp_latest_notice_${schoolId || 'default'}`;
  const initialNotice = React.useMemo(() => {
    try {
      const cached = localStorage.getItem(noticeCacheKey);
      return cached ? JSON.parse(cached) : undefined;
    } catch {
      return undefined;
    }
  }, [noticeCacheKey]);

  const tieredCacheNotice = useTieredCache();

  const { data: latestNotice, isLoading: noticeLoading } = useQuery({
    queryKey: ['latest-notice', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      
      const res = data || null;
      try {
        localStorage.setItem(noticeCacheKey, JSON.stringify(res));
      } catch (e) {
        console.warn("Failed to write notice cache:", e);
      }
      return res;
    },
    enabled: !!schoolId,
    initialData: initialNotice,
    ...tieredCacheNotice
  });

  const eventsCacheKey = `sp_upcoming_events_${schoolId || 'default'}`;
  const initialEvents = React.useMemo(() => {
    try {
      const cached = localStorage.getItem(eventsCacheKey);
      return cached ? JSON.parse(cached) : undefined;
    } catch {
      return undefined;
    }
  }, [eventsCacheKey]);

  const tieredCacheEvents = useTieredCache();

  const { data: upcomingEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['upcoming-events', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('school_id', schoolId)
        .gte('start_date', new Date().toISOString().split('T')[0])
        .order('start_date', { ascending: true })
        .limit(2);
      if (error) throw error;
      
      try {
        localStorage.setItem(eventsCacheKey, JSON.stringify(data || []));
      } catch (e) {
        console.warn("Failed to write events cache:", e);
      }
      return data || [];
    },
    enabled: !!schoolId,
    initialData: initialEvents,
    ...tieredCacheEvents
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '8px' }}>

      {/* ── Hero Header Card — always uses the gradient (same in both modes) ── */}
      <div
        className="fade-in"
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          borderRadius: '20px',
          padding: '28px 32px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(79, 70, 229, 0.35)',
        }}
      >
        {/* Decorative blobs */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '220px', height: '220px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '160px', height: '160px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)', filter: 'blur(30px)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: '10px', color: 'rgba(199,210,254,0.85)',
            fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', fontSize: '10px',
          }}>
            <Sparkles size={11} />
            Digital School Portal
          </div>
          <h1 style={{
            margin: '0 0 8px', fontSize: 'clamp(20px, 4vw, 28px)',
            fontWeight: 900, letterSpacing: '-0.02em', color: '#fff',
          }}>
            Welcome to {schoolSettings?.name || 'School Portal'}
          </h1>
          <p style={{
            margin: 0, fontSize: '13px', color: 'rgba(199,210,254,0.9)',
            maxWidth: '480px', lineHeight: 1.55,
          }}>
            Digital School — Portal for Students, Teachers &amp; Admin
          </p>
        </div>
      </div>

      {/* ── Info Widgets Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

        {/* Latest Notice */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#f59e0b', flexShrink: 0,
            }}>
              <Megaphone size={16} />
            </div>
            <h3 style={{
              margin: 0, fontSize: '11px', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}>
              Latest Notice
            </h3>
          </div>

          {noticeLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-faint)' }} />
            </div>
          ) : latestNotice ? (
            <div style={{ flex: 1 }}>
              <h4 style={{
                margin: '0 0 6px', fontSize: '14px', fontWeight: 700,
                color: 'var(--text-main)', lineHeight: 1.3,
              }}>
                {latestNotice.title}
              </h4>
              <p className="clamp-2" style={{
                fontSize: '12px', color: 'var(--text-muted)',
                margin: '0 0 10px', lineHeight: 1.6,
              }}>
                {latestNotice.content}
              </p>
              <div style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text-faint)',
              }}>
                Posted {new Date(latestNotice.created_at).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="sp-notice-empty">No recent announcements.</div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(20, 184, 166, 0.12)',
              border: '1px solid rgba(20, 184, 166, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#14b8a6', flexShrink: 0,
            }}>
              <Calendar size={16} />
            </div>
            <h3 style={{
              margin: 0, fontSize: '11px', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}>
              Upcoming Events
            </h3>
          </div>

          {eventsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-faint)' }} />
            </div>
          ) : upcomingEvents && upcomingEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              {upcomingEvents.map(event => (
                <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Mini date chip */}
                  <div style={{
                    background: 'var(--icon-bg)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '10px',
                    padding: '6px 10px',
                    textAlign: 'center',
                    minWidth: '48px',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                      letterSpacing: '0.05em', color: 'var(--text-faint)', lineHeight: 1,
                    }}>
                      {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{
                      fontSize: '18px', fontWeight: 900, color: 'var(--text-main)',
                      lineHeight: 1.1, marginTop: '2px',
                    }}>
                      {new Date(event.start_date).getDate()}
                    </div>
                  </div>
                  <div>
                    <h4 style={{
                      margin: '0 0 2px', fontSize: '13px',
                      fontWeight: 700, color: 'var(--text-main)',
                    }}>
                      {event.title}
                    </h4>
                    <p style={{
                      margin: 0, fontSize: '11px',
                      color: 'var(--text-muted)', textTransform: 'capitalize',
                    }}>
                      {event.type}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sp-notice-empty">No upcoming events scheduled.</div>
          )}
        </div>

      </div>
    </div>
  );
}
