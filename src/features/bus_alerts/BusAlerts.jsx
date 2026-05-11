import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Loader2, CheckCircle2, Navigation } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

export default function BusAlerts() {
  const { user, role, schoolSettings } = useAppStore();
  const isAdmin = role === 'admin' || role === 'platform_admin';
  const [sentAlerts, setSentAlerts] = useState(new Set()); 

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['bus-students', schoolSettings.school_id, user.class],
    queryFn: async () => {
      let q = supabase.from('users').select('id, name, class').eq('school_id', schoolSettings.school_id).eq('role', 'student');
      if (!isAdmin && user?.class) q = q.eq('class', user.class);
      const { data } = await q.order('name');
      return data || [];
    },
  });

  const notifyMutation = useMutation({
    mutationFn: async (student) => {
      const { error } = await supabase.from('app_notifications_queue').insert({
        school_id: schoolSettings.school_id,
        sender_id: user.id,
        recipient_role: 'student', 
        recipient_id: student.id,
        type: 'bus_drop',
        title: 'Safe Drop Alert',
        body: `${student.name} has been dropped off safely.`,
        is_ephemeral: true,
        status: 'pending'
      });
      if (error) throw error;
    },
    onSuccess: (_, student) => {
      setSentAlerts(prev => new Set(prev).add(student.id));
    },
    onError: (err) => alert(err.message)
  });

  const handleNotify = (student) => {
    if (sentAlerts.has(student.id)) return;
    notifyMutation.mutate(student);
  };

  return (
    <ModuleGuard moduleName="bus_alerts">
      <div className="fade-in max-w-3xl mx-auto pb-12">
        
        {/* Header */}
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          padding: '28px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '18px',
        }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '15px', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={26} color="#fbbf24" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Bus Safe Drop</h2>
            <p style={{ color: 'rgba(253,230,138,0.65)', fontSize: '13px', margin: '4px 0 0' }}>
              Tap 'Dropped' to instantly send an ephemeral push notification to the parent.
            </p>
          </div>
        </div>

        {/* Student List */}
        <div className="card">
          <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={18} color="#f59e0b" /> Route Manifest {isAdmin ? '(All Classes)' : `(${user?.class || 'Assigned'})`}
          </h3>

          {isLoading ? (
            <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>
          ) : students.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No students found.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              {students.map(s => {
                const isSent = sentAlerts.has(s.id);
                const isCurrentPending = notifyMutation.isPending && notifyMutation.variables?.id === s.id;

                return (
                  <div key={s.id} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '16px', background: 'var(--bg-main)', borderRadius: '16px', 
                    border: `1px solid ${isSent ? 'rgba(16,185,129,0.3)' : 'var(--card-border)'}`,
                    transition: 'all 0.2s ease'
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-main)' }}>{s.name}</div>
                      {isAdmin && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>Class: {s.class}</div>}
                    </div>
                    
                    <button
                      onClick={() => handleNotify(s)}
                      disabled={isSent || isCurrentPending}
                      className={`btn ${isSent ? 'outline' : 'accent'}`}
                      style={{ 
                        width: 'auto', padding: '10px 24px', borderRadius: '12px',
                        background: isSent ? 'rgba(16,185,129,0.1)' : '#f59e0b',
                        borderColor: isSent ? '#10b981' : '#f59e0b',
                        color: isSent ? '#059669' : '#fff'
                      }}
                    >
                      {isCurrentPending ? <Loader2 size={16} className="animate-spin" /> : 
                       isSent ? <CheckCircle2 size={16} /> : 'Dropped'}
                      <span style={{ marginLeft: '6px' }}>{isSent ? 'Notified' : 'Tap to Notify'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModuleGuard>
  );
}
