import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Loader2, Navigation, MapPin } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

export default function BusAlerts() {
  const { user, schoolSettings } = useAppStore();
  const [activeRoute, setActiveRoute] = useState(false);

  // Fetch all student IDs for the school
  const { data: studentIds = [] } = useQuery({
    queryKey: ['all-students', schoolSettings.school_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('school_id', schoolSettings.school_id)
        .eq('role', 'student');
      return data?.map(s => s.id) || [];
    },
  });

  // Fetch all admin and teacher IDs for the school
  const { data: staffIds = [] } = useQuery({
    queryKey: ['all-staff', schoolSettings.school_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, role')
        .eq('school_id', schoolSettings.school_id)
        .in('role', ['admin', 'teacher']);
      return data || [];
    },
  });

  const startRouteMutation = useMutation({
    mutationFn: async () => {
      if (!studentIds.length) throw new Error("No students found in school.");
      
      const payloads = studentIds.map(id => ({
        school_id: schoolSettings.school_id,
        sender_id: user.id,
        recipient_role: 'student',
        recipient_id: id,
        type: 'bus_route_start',
        title: 'Bus Alert: Route Started',
        body: 'The bus has departed from the school.',
        is_ephemeral: true,
        status: 'pending'
      }));

      // Batch insert is supported natively by passing an array
      const { error } = await supabase.from('app_notifications_queue').insert(payloads);
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveRoute(true);
      alert('Route Started! Notifications sent to all parents.');
    },
    onError: (err) => alert(err.message)
  });

  const endRouteMutation = useMutation({
    mutationFn: async () => {
      if (!staffIds.length) return;
      
      const payloads = staffIds.map(staff => ({
        school_id: schoolSettings.school_id,
        sender_id: user.id,
        recipient_role: staff.role,
        recipient_id: staff.id,
        type: 'bus_route_end',
        title: 'Bus Alert: Route Completed',
        body: 'Route completed safely.',
        is_ephemeral: true,
        status: 'pending'
      }));

      const { error } = await supabase.from('app_notifications_queue').insert(payloads);
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveRoute(false);
      alert('Route Ended! Staff notified.');
    },
    onError: (err) => alert(err.message)
  });

  return (
    <ModuleGuard moduleName="bus_alerts" alwaysVisible={user.role === 'driver'}>
      <div className="fade-in max-w-md mx-auto pb-12 px-4" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          padding: '24px', marginTop: '24px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={24} color="#fbbf24" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '18px', margin: 0 }}>Bus Control</h2>
            <p style={{ color: 'rgba(253,230,138,0.7)', fontSize: '12px', margin: '2px 0 0' }}>
              Safe Drop 2-Tap System
            </p>
          </div>
        </div>

        {/* 2-Tap Massive Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'center' }}>
          
          <button
            onClick={() => startRouteMutation.mutate()}
            disabled={activeRoute || startRouteMutation.isPending}
            style={{
              padding: '40px 20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              background: activeRoute ? 'var(--input-bg)' : '#10b981',
              border: `4px solid ${activeRoute ? 'var(--card-border)' : '#059669'}`,
              color: activeRoute ? 'var(--text-faint)' : '#fff',
              transform: activeRoute ? 'scale(0.98)' : 'scale(1)',
              transition: 'all 0.2s ease', cursor: activeRoute ? 'not-allowed' : 'pointer'
            }}
          >
            {startRouteMutation.isPending ? <Loader2 size={48} className="animate-spin" /> : <Navigation size={48} />}
            <span style={{ fontSize: '24px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Start Route
            </span>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>Notifies All Parents (Departing)</span>
          </button>

          <button
            onClick={() => endRouteMutation.mutate()}
            disabled={!activeRoute || endRouteMutation.isPending}
            style={{
              padding: '40px 20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              background: !activeRoute ? 'var(--input-bg)' : '#f59e0b',
              border: `4px solid ${!activeRoute ? 'var(--card-border)' : '#d97706'}`,
              color: !activeRoute ? 'var(--text-faint)' : '#fff',
              transform: !activeRoute ? 'scale(0.98)' : 'scale(1)',
              transition: 'all 0.2s ease', cursor: !activeRoute ? 'not-allowed' : 'pointer'
            }}
          >
            {endRouteMutation.isPending ? <Loader2 size={48} className="animate-spin" /> : <MapPin size={48} />}
            <span style={{ fontSize: '24px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              End Route
            </span>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>Notifies Admin/Teachers (Completed)</span>
          </button>

        </div>
      </div>
    </ModuleGuard>
  );
}
