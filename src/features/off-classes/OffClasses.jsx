import React, { useEffect, useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function OffClasses() {
  const { role } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const userRole = (role || '').toLowerCase();

  useEffect(() => {
    if (userRole !== 'admin' && userRole !== 'teacher') { setLoading(false); return; }
    loadOffClasses();
  }, []);

  async function loadOffClasses() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const todayDay = new Date().toLocaleString('en-us', { weekday: 'long' });

    // 1. Get absent teachers today (attendance.who stores username, role='Teacher')
    const { data: absentRecs } = await supabase
      .from('attendance')
      .select('who')
      .eq('role', 'Teacher')
      .eq('date', today)
      .eq('status', 'Absent');

    if (!absentRecs || absentRecs.length === 0) { setData([]); setLoading(false); return; }

    const absentUsernames = absentRecs.map(a => a.who);

    // 2. Get their full names (timetable stores teacher NAME, not username)
    const { data: users } = await supabase
      .from('users')
      .select('username, name')
      .in('username', absentUsernames);

    const absentNames = (users || []).map(u => u.name).filter(Boolean);

    // 3. Get timetable periods for those teacher names today
    const { data: periods } = await supabase
      .from('timetable')
      .select('*')
      .in('teacher', absentNames)
      .eq('day', todayDay)
      .order('period_order');

    setData(periods || []);
    setLoading(false);
  }

  if (userRole !== 'admin' && userRole !== 'teacher') {
    return (
      <div className="sp-card text-slate-400 text-sm">Access Denied. Only for Admins & Teachers.</div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <div className="flex items-center gap-3 mb-1">
          <AlertTriangle size={18} className="text-amber-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Off Classes — Teachers Absent</h3>
        </div>
        <p className="text-xs text-slate-500 font-semibold">
          Showing off-periods for teachers marked absent today ({today}).
        </p>
      </div>

      <div className="sp-card">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-slate-500 italic text-center py-8">
            No teachers are marked absent today, or absent teachers have no classes scheduled.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Period', 'Class', 'Subject', 'Teacher (Absent)'].map(h => (
                    <th key={h} className="text-left text-xs font-black text-slate-500 uppercase tracking-widest py-3 px-4 border-b border-white/5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="py-3 px-4">
                      <span className="inline-block bg-slate-700 text-slate-200 text-xs font-black px-2 py-0.5 rounded-md mr-2">{p.period_order}</span>
                      <span className="text-slate-500 text-xs">{p.period_label || ''}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-200">{p.class}</td>
                    <td className="py-3 px-4 text-slate-300">{p.subject}</td>
                    <td className="py-3 px-4 font-bold text-red-400">{p.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
