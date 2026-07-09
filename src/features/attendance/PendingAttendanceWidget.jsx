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


import { useTieredCache } from '../../hooks/useTieredCache';

function getLocalTodayDate() {
  const localDate = new Date();
  const offset = localDate.getTimezoneOffset();
  const localToday = new Date(localDate.getTime() - (offset * 60 * 1000));
  return localToday.toISOString().split('T')[0];
}

export default function PendingAttendanceWidget({ forceShow = false }) {
  const { schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    const today = getLocalTodayDate();
    return !!localStorage.getItem(`dismissed_duty_${today}`);
  });

  const cacheConfig = useTieredCache({
    freeStaleTime: 10 * 60 * 1000,
    premiumStaleTime: 30 * 1000,
    premiumRefetchInterval: 60000
  });

  const { data: missingData = { missing: [], totalSubmitted: 0 }, isLoading: loading } = useQuery({
    queryKey: ['attendance', 'duty_radar_client', schoolSettings?.school_id],
    queryFn: async () => {
      if (!schoolSettings?.school_id) return { missing: [], totalSubmitted: 0 };
      
      try {
        const todayDate = getLocalTodayDate();
        const monthYear = todayDate.substring(0, 7);
        
        console.log("PendingAttendanceWidget - Querying date:", todayDate, "month_year:", monthYear);

        const [attRes, stuRes, teacherRes, settingsRes] = await Promise.all([
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
            .select('id, name, class')
            .in('role', ['teacher', 'staff'])
            .eq('school_id', schoolSettings.school_id),
          supabase
            .from('school_settings')
            .select('classes')
            .eq('school_id', schoolSettings.school_id)
            .maybeSingle()
        ]);
        
        if (attRes.error) throw attRes.error;
        if (stuRes.error) throw stuRes.error;
        if (teacherRes.error) throw teacherRes.error;
        
        const attendanceData = attRes.data || [];
        const students = stuRes.data || [];
        const teachers = teacherRes.data || [];
        
        let activeClasses = settingsRes?.data?.classes || schoolSettings?.classes || [];
        if (typeof activeClasses === 'string') {
          try { activeClasses = JSON.parse(activeClasses); }
          catch { activeClasses = activeClasses.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')); }
        }
        
        // Fallback classes if still empty (check student list first, then teacher list)
        if (!activeClasses || activeClasses.length === 0) {
          activeClasses = Array.from(new Set(students.map(s => s.class).filter(Boolean)));
          console.log("PendingAttendanceWidget - Falling back to classes from student list:", activeClasses);
        }
        if (!activeClasses || activeClasses.length === 0) {
          const teacherClasses = [];
          teachers.forEach(t => {
            if (!t.class) return;
            if (typeof t.class === 'string') {
              try {
                const parsed = JSON.parse(t.class);
                if (Array.isArray(parsed)) teacherClasses.push(...parsed);
                else teacherClasses.push(...t.class.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')));
              } catch (e) {
                teacherClasses.push(...t.class.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, '')));
              }
            } else if (Array.isArray(t.class)) {
              teacherClasses.push(...t.class);
            }
          });
          activeClasses = Array.from(new Set(teacherClasses.filter(Boolean)));
          console.log("PendingAttendanceWidget - Falling back to classes from teacher list:", activeClasses);
        }
        
        if (!activeClasses || activeClasses.length === 0) {
          console.warn("PendingAttendanceWidget - No classes found, fallback empty.");
          return { missing: [], totalSubmitted: 0 };
        }
        
        const submittedClasses = new Set();
        
        attendanceData.forEach(a => {
           if (hasAttendanceForDate(a.attendance_data, todayDate)) {
              const student = students.find(s => s.id === a.user_id);
              if (student && student.class) {
                 submittedClasses.add(student.class.toString().trim().toLowerCase());
              }
           }
        });
        
        const missingClassNames = activeClasses.filter(c => !submittedClasses.has(c.toString().trim().toLowerCase()));
        
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
              teacher_id: teacher ? teacher.id : null,
              class_name: className,
              period_label: 'Daily Attendance'
           };
        });

        const completed = [];
        submittedClasses.forEach(className => {
          const teacher = teachers.find(t => {
            if (!t.class) return false;
            let tClasses = [];
            if (typeof t.class === 'string') {
              try {
                const parsed = JSON.parse(t.class);
                tClasses = Array.isArray(parsed) ? parsed : [parsed];
              } catch (e) {
                tClasses = t.class.replace(/^{|}$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
              }
            } else if (Array.isArray(t.class)) {
              tClasses = t.class;
            }
            return tClasses.some(tc => tc?.toString().trim().toLowerCase() === className.trim().toLowerCase());
          });
          completed.push({
            class_name: className.toUpperCase(),
            teacher_name: teacher ? teacher.name : 'Unassigned'
          });
        });
        
        console.log("PendingAttendanceWidget - Finished calculation. Missing count:", missing.length, "Total submitted classes:", submittedClasses.size);
        return { missing, totalSubmitted: submittedClasses.size, completed };
      } catch (err) {
        console.error("PendingAttendanceWidget - Error calculating pending attendance:", err);
        return { missing: [], totalSubmitted: 0, completed: [] };
      }
    },
    enabled: !!schoolSettings?.school_id && (!dismissed || forceShow),
    ...cacheConfig
  });

  const handleDismiss = () => {
    const today = getLocalTodayDate();
    localStorage.setItem(`dismissed_duty_${today}`, 'true');
    setDismissed(true);
    if (forceShow) {
      navigate(-1);
    }
  };

  if (dismissed && !forceShow) return null;

  const { missing, totalSubmitted, completed = [] } = missingData;

  const [sendingReminder, setSendingReminder] = useState(null);
  const [sendingAll, setSendingAll] = useState(false);

  const handleSendReminder = async (m, idx) => {
    if (!m.teacher_id) {
      alert("No teacher is currently assigned to cover this class.");
      return;
    }
    setSendingReminder(idx);
    try {
      const { error } = await supabase.from('app_notifications_queue').insert({
        school_id: schoolSettings.school_id,
        recipient_id: m.teacher_id,
        title: '📋 Missing Attendance Log',
        body: `Please submit the daily attendance log for Class ${m.class_name}.`,
        is_ephemeral: false,
        status: 'pending'
      });
      if (error) throw error;
      alert(`Reminder sent to ${m.teacher_name}.`);
    } catch (err) {
      alert(`Failed to send reminder: ${err.message}`);
    } finally {
      setSendingReminder(null);
    }
  };

  const handleRemindAll = async () => {
    const validMissing = missing.filter(m => m.teacher_id);
    if (validMissing.length === 0) {
      alert("No pending teachers to remind.");
      return;
    }
    setSendingAll(true);
    try {
      const reminders = validMissing.map(m => ({
        school_id: schoolSettings.school_id,
        recipient_id: m.teacher_id,
        title: '📋 Missing Attendance Log',
        body: `Please submit the daily attendance log for Class ${m.class_name}.`,
        is_ephemeral: false,
        status: 'pending'
      }));
      const { error } = await supabase.from('app_notifications_queue').insert(reminders);
      if (error) throw error;
      alert("Reminders sent successfully to all pending staff!");
    } catch (err) {
      alert(`Failed to send reminders: ${err.message}`);
    } finally {
      setSendingAll(false);
    }
  };

  if (loading && missing.length === 0) {
    return (
      <div className="sp-card flex justify-center py-6">
        <Loader2 className="animate-spin text-slate-500" />
      </div>
    );
  }
  return (
    <div className={forceShow ? "space-y-6" : "sp-card relative overflow-hidden mb-6"}>
      {!forceShow && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      )}
      
      {/* Widget Header (Compact or Full Page) */}
      {forceShow ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-6 rounded-3xl border border-glass shadow-xl relative overflow-hidden">
          <div className="absolute left-0 bottom-0 w-32 h-32 bg-rose-500/10 blur-3xl rounded-full -ml-16 -mb-16 pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl">
              <Radar size={24} className={missing.length > 0 ? "animate-pulse" : ""} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight mb-1">Staff Pending Duty</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Duty radar tracking active class attendance logs</p>
            </div>
          </div>
          <div className="relative z-10 flex flex-col sm:items-end gap-3 w-full sm:w-auto">
            <div className="flex gap-3 w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center min-w-[110px]">
                <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Pending Classes</div>
                <div className="text-lg font-black text-rose-200 mt-0.5">{missing.length}</div>
              </div>
              <div className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center min-w-[110px]">
                <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Completed Classes</div>
                <div className="text-lg font-black text-emerald-200 mt-0.5">{totalSubmitted}</div>
              </div>
            </div>
            {missing.length > 0 && (
              <button 
                onClick={handleRemindAll} 
                disabled={sendingAll}
                className="w-full px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-850 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer border-0"
              >
                {sendingAll ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Remind All
              </button>
            )}
          </div>
        </div>
      ) : (
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
          <div className="flex items-center gap-2">
            {missing.length > 0 && (
              <button 
                onClick={handleRemindAll} 
                disabled={sendingAll}
                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-850 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-1 cursor-pointer border-0"
              >
                {sendingAll ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                Remind All
              </button>
            )}
            <button onClick={handleDismiss} className="text-slate-500 hover:text-slate-300 transition-colors bg-transparent border-0 cursor-pointer p-1">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Widget Body */}
      {missing.length === 0 ? (
        <div className="text-center py-12 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 shadow-inner">
          <Radar size={40} className="mx-auto text-emerald-500 mb-3 opacity-60" />
          <p className="text-emerald-400 text-base font-black uppercase tracking-wider">All duties cleared!</p>
          <p className="text-xs text-slate-400 font-bold mt-1">Every active class has successfully submitted attendance logs today.</p>
        </div>
      ) : (
        <div className={forceShow ? "" : "max-h-[300px] overflow-y-auto pr-2 custom-scrollbar"}>
          {forceShow ? (
            /* Premium Grid Layout for Full Page View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              {missing.map((m, i) => (
                <div key={i} className="flex flex-col justify-between p-6 bg-slate-900 border border-slate-800 rounded-3xl hover:border-rose-500/40 transition-all hover:scale-[1.01] hover:shadow-lg relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-colors pointer-events-none" />
                  <div>
                    <h4 className="text-base font-black text-slate-200 tracking-tight">{m.teacher_name}</h4>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Assigned Class Teacher</p>
                    
                    <div className="flex items-center gap-2 mt-4">
                      <span className="text-[10px] font-black bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                        Class {m.class_name}
                      </span>
                      <span className="text-[10px] font-black bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                        {m.period_label || `Period ${m.period_order}`}
                      </span>
                    </div>
                  </div>
                  <button 
                    className="w-full mt-6 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800/50 text-white text-[11px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-rose-950/30 cursor-pointer border-0"
                    onClick={() => handleSendReminder(m, i)}
                    disabled={sendingReminder === i || !m.teacher_id}
                  >
                    {sendingReminder === i ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Send Reminder
                  </button>
                </div>
              ))}
            </div>
          ) : (
            /* Compact List Layout for Dashboard Widget */
            <div className="space-y-3">
              {missing.map((m, i) => (
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
                    className="w-full sm:w-auto px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 disabled:bg-rose-800/50 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-0"
                    onClick={() => handleSendReminder(m, i)}
                    disabled={sendingReminder === i || !m.teacher_id}
                  >
                    {sendingReminder === i ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                    Send Reminder
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed Classes Section */}
      {completed.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-800">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Completed Classes</h4>
          <div className="flex flex-wrap gap-2.5">
            {completed.map((c, idx) => (
              <div key={idx} className="px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-black flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {c.teacher_name} ({c.class_name})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
