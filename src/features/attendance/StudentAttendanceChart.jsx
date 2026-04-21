import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, CalendarHeart } from 'lucide-react';

export default function StudentAttendanceChart() {
  const { user, schoolSettings } = useAppStore();

  const { data: attendance, isLoading } = useQuery({
    queryKey: ['my-attendance', user?.id, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !!schoolSettings?.school_id
  });

  if (isLoading) {
    return (
      <div className="bg-surface border border-glass rounded-2xl p-6 h-64 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const total = attendance?.length || 0;
  const present = attendance?.filter(a => a.status === 'Present').length || 0;
  const absent = attendance?.filter(a => a.status === 'Absent').length || 0;
  const late = attendance?.filter(a => a.status === 'Late').length || 0;
  
  const presentPercentage = total > 0 ? Math.round((present / total) * 100) : 0;
  const absentPercentage = total > 0 ? Math.round((absent / total) * 100) : 0;
  const latePercentage = total > 0 ? Math.round((late / total) * 100) : 0;
  const otherPercentage = total > 0 ? Math.round(((total - present - absent - late) / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="card fade-in">
        <div className="section-title">
          <CalendarHeart className="text-accent" />
          <h3>Attendance Overview</h3>
        </div>
        
        <div style={{ display: 'flex', gap: '40px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: '150px', height: '150px', borderRadius: '50%', background: `conic-gradient(var(--accent) ${presentPercentage}%, var(--glass) 0)`, display: 'grid', placeItems: 'center', position: 'relative' }}>
                <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '24px' }}>{presentPercentage}%</h2>
                      <span className="muted small">Present</span>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                    <span className="muted">Total Days</span>
                    <strong>{total}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                    <span className="muted">Present</span>
                    <strong style={{ color: '#6ee7b7' }}>{present}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                    <span className="muted">Absent</span>
                    <strong style={{ color: '#fca5a5' }}>{absent}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px' }}>
                    <span className="muted">Late</span>
                    <strong style={{ color: '#fcd34d' }}>{late}</strong>
                </div>
            </div>
        </div>
      </div>
{/* Legacy Table rendering down here */}
      <div className="card fade-in">
        <div className="section-title">
            <h3>Recent History</h3>
        </div>
        <div className="table-responsive">
           <table className="legacy-table">
              <thead>
                <tr>
                   <th>Date</th>
                   <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance?.map(a => (
                  <tr key={a.id}>
                     <td>{a.date}</td>
                     <td>
                       <span className={`badge ${a.status === 'Present' ? 'badge-success' : a.status === 'Absent' ? 'badge-danger' : 'badge-warn'}`}>
                          {a.status}
                       </span>
                     </td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
}
