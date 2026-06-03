import React, { useEffect, useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AlertTriangle, Loader2, UserX } from 'lucide-react';

// ─── Attendance JSONB Decode Codec (v82_attendance_jsonb_compression) ───
// Checks both compressed day key ("31") and legacy full ISO date key ("2026-05-31")
// and decodes status codes back to full labels for comparison.
const STATUS_DECODE = { P: 'Present', A: 'Absent', L: 'Late', H: 'Half_day', V: 'Leave' };
function getStatusForDate(attendanceData, isoDate) {
  if (!attendanceData) return null;
  // Try compressed key first (new format after v82)
  const dayKey = String(parseInt(isoDate.split('-')[2], 10));
  if (attendanceData[dayKey]) return STATUS_DECODE[attendanceData[dayKey]] || attendanceData[dayKey];
  // Fallback: legacy full ISO date key
  if (attendanceData[isoDate]) return attendanceData[isoDate];
  return null;
}


export default function OffClasses() {
  const { role, schoolSettings } = useAppStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const userRole = (role || '').toLowerCase();

  useEffect(() => {
    if (userRole !== 'admin' && userRole !== 'teacher') { setLoading(false); return; }
    if (schoolSettings?.school_id) loadOffClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSettings?.school_id]);

  async function loadOffClasses() {
    setLoading(true);
    const now = new Date();
    // Build local YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    const monthYear = `${year}-${month}`;
    const todayDay = now.toLocaleString('en-us', { weekday: 'long' });

    // Step 1: Get ALL attendance records for this month
    const { data: monthAtt, error: attErr } = await supabase
      .from('attendance')
      .select('user_id, attendance_data')
      .eq('school_id', schoolSettings.school_id)
      .eq('month_year', monthYear);

    if (attErr) { console.error('OffClasses attendance error:', attErr); setData([]); setLoading(false); return; }

    // Filter to find who is absent or on leave TODAY
    // Uses codec-aware helper to handle both compressed ("31":"A") and legacy ("2026-05-31":"Absent") formats
    const absentUserIds = (monthAtt || [])
      .filter(a => {
        const status = getStatusForDate(a.attendance_data, today);
        return status === 'Absent' || status === 'Leave';
      })
      .map(a => a.user_id);

    if (absentUserIds.length === 0) { setData([]); setLoading(false); return; }

    // Step 2: Fetch teacher names and verify they are actually teachers
    const { data: teacherProfiles } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', absentUserIds)
      .eq('role', 'teacher');

    if (!teacherProfiles || teacherProfiles.length === 0) { setData([]); setLoading(false); return; }

    const actualTeacherIds = teacherProfiles.map(t => t.id);

    // Build a name map: { uuid → name }
    const nameMap = {};
    teacherProfiles.forEach(t => { nameMap[t.id] = t.name; });

    // Step 3: Get timetable periods assigned to these teacher UUIDs today
    const { data: periods, error: ttErr } = await supabase
      .from('timetable')
      .select('*')
      .in('teacher', actualTeacherIds)
      .eq('day', todayDay)
      .order('period_order');

    if (ttErr) { console.error('OffClasses timetable error:', ttErr); }

    // Attach teacher name to each period row for display
    const enriched = (periods || []).map(p => ({
      ...p,
      teacher_name: nameMap[p.teacher] || 'Unknown Teacher',
    }));

    setData(enriched);
    setLoading(false);
  }

  if (userRole !== 'admin' && userRole !== 'teacher') {
    return (
      <div className="sp-card text-slate-400 text-sm">Access Denied. Only for Admins &amp; Teachers.</div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <div className="flex items-center gap-3 mb-1">
          <AlertTriangle size={18} className="text-amber-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Off Classes — Teachers Absent/On Leave</h3>
        </div>
        <p className="text-xs text-slate-500 font-semibold">
          Showing off-periods for teachers marked absent or on leave today ({today}).
        </p>
      </div>

      <div className="sp-card">
        {loading ? (
          <div className="space-y-4 py-2">
            {[1, 2, 3].map(idx => (
              <div key={idx} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-10 rounded animate-shimmer"></div>
                  <div className="h-4 w-16 rounded animate-shimmer"></div>
                </div>
                <div className="h-4 w-12 rounded animate-shimmer"></div>
                <div className="h-4 w-20 rounded animate-shimmer"></div>
                <div className="h-4 w-32 rounded animate-shimmer"></div>
              </div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <UserX size={32} className="text-slate-600" />
            <p className="text-sm text-slate-500 italic">
              No teachers are marked absent or on leave today, or absent teachers have no classes scheduled.
            </p>
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
                      <span className="inline-block bg-slate-700 text-slate-200 text-xs font-black px-2 py-0.5 rounded-md mr-2">#{p.period_order}</span>
                      <span className="text-slate-500 text-xs">{p.period_label || ''}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-200">{p.class}</td>
                    <td className="py-3 px-4 text-slate-300">{p.subject}</td>
                    <td className="py-3 px-4 font-bold text-red-400 flex items-center gap-2">
                      <UserX size={14} /> {p.teacher_name}
                    </td>
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
