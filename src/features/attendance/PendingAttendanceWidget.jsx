import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Radar, Loader2, Send, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

// ─── Attendance JSONB Decode Codec (v82_attendance_jsonb_compression) ───
// Checks both compressed day key ("31") and legacy full ISO date key ("2026-05-31")
function hasAttendanceForDate(attendanceData, isoDate) {
  if (!attendanceData) return false;
  // Compressed key: strip month prefix, parse integer (strips leading zero)
  const dayKey = String(parseInt(isoDate.split('-')[2], 10));
  return !!(attendanceData[dayKey] || attendanceData[isoDate]);
}


export default function PendingAttendanceWidget({ forceShow = false }) {
  const { schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return !!localStorage.getItem(`dismissed_duty_${today}`);
  });

  const { data: missingData = { missing: [], totalSubmitted: 0 }, isLoading: loading } = useQuery({
    queryKey: ['attendance', 'duty_radar_client', schoolSettings?.school_id],
    queryFn: async () => {
      if (!schoolSettings?.school_id) return { missing: [], totalSubmitted: 0 };
      
      const { data: freshSettings } = await supabase
        .from('school_settings')
        .select('classes')
        .eq('school_id', schoolSettings.school_id)
        .single();
        
      let activeClasses = freshSettings?.classes || schoolSettings.classes || [];
      if (typeof activeClasses === 'string') {
        try { activeClasses = JSON.parse(activeClasses); }
        catch { activeClasses = activeClasses.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')); }
      }
      
      if (!activeClasses || activeClasses.length === 0) return { missing: [], totalSubmitted: 0 };
      
      const todayDate = new Date().toISOString().split('T')[0];
      const monthYear = todayDate.substring(0, 7);
      
      const [attRes, stuRes, teacherRes] = await Promise.all([
        supabase
          .from('attendance')
          .select('user_id, attendance_data')
          .eq('school_id', schoolSettings.school_id)
          .eq('month_year', monthYear),
        supabase
          .from('users')
          .select('id, class')
          .eq('role', 'student')
          .eq('school_id', schoolSettings.school_id),
          supabase
            .from('users')
            .select('name, class')
            .in('role', ['teacher', 'staff'])
          .eq('school_id', schoolSettings.school_id)
      ]);
      
      if (attRes.error) throw attRes.error;
      if (stuRes.error) throw stuRes.error;
      if (teacherRes.error) throw teacherRes.error;
      
      const attendanceData = attRes.data || [];
      const students = stuRes.data || [];
      const teachers = teacherRes.data || [];
      
      const submittedClasses = new Set();
      
      attendanceData.forEach(a => {
         if (hasAttendanceForDate(a.attendance_data, todayDate)) {
            const student = students.find(s => s.id === a.user_id);
            if (student && student.class) {
               submittedClasses.add(student.class);
            }
         }
      });
      
      const missingClassNames = activeClasses.filter(c => !submittedClasses.has(c));
      
      const missing = missingClassNames.map(className => {
         const teacher = teachers.find(t => {
           if (!t.class) return false;
           let tClasses = [];
           if (typeof t.class === 'string') {
             try {
               const parsed = JSON.parse(t.class);
               if (Array.isArray(parsed)) tClasses = parsed;
               else tClasses = t.class.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
             } catch (e) {
               tClasses = t.class.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
             }
           } else if (Array.isArray(t.class)) {
             tClasses = t.class;
           }
           return tClasses.some(tc => tc?.toString().trim().toLowerCase() === className?.toString().trim().toLowerCase());
         });
         
         return {
            teacher_name: teacher ? teacher.name : 'Unassigned',
            class_name: className,
            period_label: 'Daily Attendance'
         };
      });
      
      return { missing, totalSubmitted: submittedClasses.size };
    },
    enabled: !!schoolSettings?.school_id && !dismissed,
    refetchInterval: 60000,
  });

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(`dismissed_duty_${today}`, 'true');
    setDismissed(true);
    if (forceShow) {
      navigate(-1);
    }
  };

  if (dismissed && !forceShow) return null;

  const { missing, totalSubmitted } = missingData;

  if (loading && missing.length === 0) {
    return (
      <div className="sp-card flex justify-center py-6">
        <Loader2 className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="sp-card relative overflow-hidden mb-6">
      <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
            <Radar size={20} className={missing.length > 0 ? "animate-pulse" : ""} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Staff Pending Duty</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Missing Attendance Logs</p>
          </div>
        </div>
        {!forceShow && (
          <button onClick={handleDismiss} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {missing.length === 0 && totalSubmitted > 0 ? (
        <div className="text-center py-4 bg-slate-800/30 rounded-xl border border-white/5">
          <p className="text-emerald-400 text-sm font-bold">All clear!</p>
          <p className="text-xs text-slate-500 font-medium">All active classes have submitted attendance.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {missing.length === 0 ? (
             <div className="text-center py-4 text-slate-400 text-sm">No active classes defined in system.</div>
          ) : (
             missing.map((m, i) => (
               <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-xl transition-colors">
                 <div>
                   <p className="text-sm font-bold text-slate-200">{m.teacher_name}</p>
                   <div className="flex items-center gap-2 mt-1">
                     <span className="text-[10px] font-black bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded uppercase tracking-wider">
                       {m.class_name}
                     </span>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">
                       {m.period_label || `Period ${m.period_order}`}
                     </span>
                   </div>
                 </div>
                 <button 
                   className="w-full sm:w-auto px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                   onClick={() => alert(`Reminder sent to ${m.teacher_name}.`)}
                 >
                   Send Reminder <Send size={12} />
                 </button>
               </div>
             ))
          )}
        </div>
      )}
    </div>
  );
}
