import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Users, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

/**
 * AdminBusMonitor — Read-only route status monitor for the School Admin.
 * Shows the latest bus event (start/end) and a snapshot of notification delivery.
 * This is NOT the driver control panel. Admin observes; Driver acts.
 */
export default function AdminBusMonitor() {
  const { schoolSettings } = useAppStore();

  const { data: latestEvents = [], isLoading } = useQuery({
    queryKey: ['bus-events-admin', schoolSettings?.school_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_notifications_queue')
        .select('type, title, body, status, created_at')
        .eq('school_id', schoolSettings.school_id)
        .in('type', ['bus_route_start', 'bus_route_end'])
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: driverCount = 0 } = useQuery({
    queryKey: ['driver-count', schoolSettings?.school_id],
    queryFn: async () => {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolSettings.school_id)
        .eq('role', 'driver');
      return count || 0;
    },
  });

  const latestStart = latestEvents.find(e => e.type === 'bus_route_start');
  const latestEnd = latestEvents.find(e => e.type === 'bus_route_end');

  const routeActive = latestStart && (!latestEnd || new Date(latestStart.created_at) > new Date(latestEnd.created_at));

  return (
    <div className="fade-in max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div style={{
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
        padding: '28px 32px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', gap: '18px',
      }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '15px',
          background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Bus size={26} color="#fbbf24" />
        </div>
        <div>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Bus Route Monitor</h2>
          <p style={{ color: 'rgba(253,230,138,0.6)', fontSize: '13px', margin: '4px 0 0' }}>
            Live read-only status for school transport.
          </p>
        </div>
      </div>

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ borderLeft: `4px solid ${routeActive ? '#10b981' : '#64748b'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            {routeActive
              ? <CheckCircle2 size={20} color="#10b981" />
              : <AlertCircle size={20} color="#64748b" />}
            <span style={{ fontWeight: 900, fontSize: '13px', color: 'var(--text-main)' }}>Route Status</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: routeActive ? '#10b981' : 'var(--text-muted)' }}>
            {routeActive ? 'IN PROGRESS' : 'COMPLETED'}
          </div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #818cf8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={20} color="#818cf8" />
            <span style={{ fontWeight: 900, fontSize: '13px', color: 'var(--text-main)' }}>Registered Drivers</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#818cf8' }}>{driverCount}</div>
        </div>
      </div>

      {/* Event Log */}
      <div className="card">
        <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} /> Recent Bus Events
        </h3>

        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-slate-400" size={28} /></div>
        ) : latestEvents.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '32px 0', fontSize: '13px' }}>
            No bus events recorded yet. Events appear here once a Driver starts or ends a route.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {latestEvents.map((ev, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '12px 16px', borderRadius: '12px',
                background: ev.type === 'bus_route_start' ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
                border: `1px solid ${ev.type === 'bus_route_start' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                  background: ev.type === 'bus_route_start' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bus size={16} color={ev.type === 'bus_route_start' ? '#10b981' : '#f59e0b'} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>{ev.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ev.body}</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', textAlign: 'right', flexShrink: 0 }}>
                  {new Date(ev.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  <br />
                  {new Date(ev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
