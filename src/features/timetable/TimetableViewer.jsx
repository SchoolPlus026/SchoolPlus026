import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, CalendarClock, Pencil, X, Save } from 'lucide-react';

export default function TimetableViewer({ adminPreviewClass }) {
  const { role, user, schoolSettings } = useAppStore();

  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';
  const isAdmin = role === 'admin';

  // Teachers default to 'self' (their own schedule); admins/others default to 'school'
  const [viewMode, setViewMode] = React.useState(isTeacher ? 'self' : 'school');
  const [activeDayTab, setActiveDayTab] = useState('Monday');
  const [matrixMode, setMatrixMode] = useState('class'); // 'class' | 'teacher'

  // For Class / Teacher filtered view
  const [targetClass, setTargetClass] = useState(adminPreviewClass || '');
  const [targetTeacher, setTargetTeacher] = useState('');
  const queryClient = useQueryClient();


  // In-line editing states
  const [editingSlot, setEditingSlot] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', teacher: '', start: '', end: '' });

  const { data: allTeachers } = useQuery({
     queryKey: ['available-teachers', schoolSettings?.school_id],
     queryFn: async () => {
        const { data } = await supabase
          .from('users')
          .select('id, name')
          .eq('school_id', schoolSettings.school_id)
          .eq('role', 'teacher')
          .order('name');
        return data || [];
     },
     enabled: !!schoolSettings?.school_id
  });

  const updateSlotMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('timetable').update({
        subject: editForm.subject,
        teacher: editForm.teacher,
        period_label: `${editForm.start} to ${editForm.end}`
      }).eq('id', editingSlot.id);
      if (error) throw error;
    },
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['timetable'] });
       setEditingSlot(null);
    }
  });

  const openEditor = (slot) => {
    setEditingSlot(slot);
    const times = slot.period_label ? slot.period_label.split(' to ') : [];
    setEditForm({
      subject: slot.subject || '',
      teacher: slot.teacher || '',
      start: times[0]?.trim() || '',
      end: times[1]?.trim() || ''
    });
  };

  React.useEffect(() => {
     if (adminPreviewClass) setTargetClass(adminPreviewClass);
  }, [adminPreviewClass]);

  const cacheKey = `sp_timetable_${schoolSettings?.school_id || 'default'}_${user?.id || 'guest'}_${targetClass || 'none'}_${targetTeacher || 'none'}_${viewMode || 'self'}`;

  const initialData = useMemo(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : undefined;
    } catch (e) {
      console.warn("Failed to retrieve timetable cache:", e);
      return undefined;
    }
  }, [cacheKey]);

  const { data: scheduleRaw, isLoading } = useQuery({
    queryKey: ['timetable', schoolSettings?.school_id, user?.id, targetClass, targetTeacher, viewMode, role],
    queryFn: async () => {
      let query = supabase.from('timetable').select('*'); 

      // ── Helper: Fetch a teacher's name from users table ────────────────
      // Needed because timetable.teacher may store name strings (legacy v13)
      // instead of UUIDs, and user.name is not available in the app store.
      const fetchTeacherName = async (teacherId) => {
        const { data: p } = await supabase.from('users').select('name').eq('id', teacherId).single();
        return p?.name || null;
      };
      
      if (isStudent) {
         const { data: profile } = await supabase.from('users').select('class').eq('id', user.id).single();
         if (profile?.class) {
            query = query.eq('class', profile.class);
         } else {
            return [];
         }
      } else if (isAdmin) {
         if (viewMode === 'class' && targetClass) {
            query = query.eq('class', targetClass);
         } else if (viewMode === 'teacher' && targetTeacher) {
            // FOUNDATIONAL FIX: timetable.teacher may store UUID or name string.
            // Query with both: the UUID from the dropdown AND the teacher's name.
            const teacherName = await fetchTeacherName(targetTeacher);
            if (teacherName) {
               query = query.or(`teacher.eq."${targetTeacher}",teacher.eq."${teacherName.replace(/"/g, '\\"')}"`);
            } else {
               query = query.eq('teacher', targetTeacher);
            }
         }
         // if viewMode === 'school', no further filters.
      } else if (isTeacher) {
          if (viewMode === 'self') {
             // FOUNDATIONAL FIX: Query with BOTH UUID and name since legacy data
             // stores teacher as name strings (e.g. 'Hajare Shubham') not UUIDs.
             const teacherName = await fetchTeacherName(user.id);
             if (teacherName) {
                query = query.or(`teacher.eq."${user.id}",teacher.eq."${teacherName.replace(/"/g, '\\"')}"`);
             } else {
                query = query.eq('teacher', user.id);
             }
          } else if (viewMode === 'class') {
            const { data: profile } = await supabase.from('users').select('class').eq('id', user.id).single();
            if (profile?.class) {
               query = query.eq('class', profile.class);
            } else if (targetClass) {
               query = query.eq('class', targetClass);
            } else {
               return []; // No class selected and no deployed class
            }
          } else if (viewMode === 'teacher' && targetTeacher) {
             // FOUNDATIONAL FIX: same dual-format matching for teacher-wise filter
             const teacherName = await fetchTeacherName(targetTeacher);
             if (teacherName) {
                query = query.or(`teacher.eq."${targetTeacher}",teacher.eq."${teacherName.replace(/"/g, '\\"')}"`);
             } else {
                query = query.eq('teacher', targetTeacher);
             }
          }
         // if viewMode === 'school', no further filters.
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Resolve teacher display names — handles both UUID refs (new) and plain name strings (legacy)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const teacherUUIDs = [...new Set(data.map(d => d.teacher))].filter(v => v && uuidPattern.test(v));
      
      let teacherMap = {};
      if (teacherUUIDs.length > 0) {
         const { data: teacherProfiles } = await supabase.from('users').select('id, name').in('id', teacherUUIDs);
         teacherProfiles?.forEach(t => { teacherMap[t.id] = t.name; });
      }

      const processed = data.map(slot => ({
         ...slot,
         // If teacher field is a UUID, look up name; otherwise it's already a name string (legacy rows)
         teacher_name: uuidPattern.test(slot.teacher || '')
           ? (teacherMap[slot.teacher] || 'Staff')
           : (slot.teacher || 'Unassigned')
      }));

      // Cache the result locally for future offline/SWR views
      try {
         localStorage.setItem(cacheKey, JSON.stringify(processed));
      } catch (e) {
         console.warn("Failed to write timetable cache:", e);
      }

      return processed;
    },
    enabled: !!schoolSettings?.school_id,
    initialData,
    staleTime: 10 * 60 * 1000 // 10 minutes stale time (timetable is highly static)
  });

  const getCurrentActiveContext = () => {
     const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
     return days[new Date().getDay()];
  };
  const activeDay = getCurrentActiveContext();

  const timeline = useMemo(() => {
     if (!scheduleRaw) return {};
     const map = { 'Monday': [], 'Tuesday': [], 'Wednesday': [], 'Thursday': [], 'Friday': [], 'Saturday': [], 'Sunday': [] };
     scheduleRaw.forEach(slot => { if (map[slot.day]) map[slot.day].push(slot); });
     Object.keys(map).forEach(day => map[day].sort((a,b) => a.period_order - b.period_order));
     return map;
  }, [scheduleRaw]);

  if (isLoading) {
    return (
      <div className="bg-surface border border-glass rounded-2xl p-12 flex justify-center shadow-lg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeDaysWithData = Object.keys(timeline).filter(day => timeline[day].length > 0);

  if (activeDaysWithData.length === 0) {
    return (
      <div className="bg-surface border border-glass rounded-2xl p-12 text-center text-slate-400 shadow-lg">
        <CalendarClock className="w-16 h-16 mx-auto mb-4 text-slate-600 opacity-50" />
        <h3 className="text-white font-bold text-lg mb-1">Grid Uninitialized</h3>
        No active scheduled blocks instantiated for your current profile context.
      </div>
    );
  }

  return (
    <div className="card fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <div className="section-title" style={{ margin: 0 }}>
                <h3>{viewMode === 'self' ? 'My Schedule' : viewMode === 'teacher' ? 'Teacher Schedule' : viewMode === 'class' ? 'Class Schedule' : 'Full School Timetable'}</h3>
            </div>
            
            {(isTeacher || isAdmin) && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                 {/* ── Primary Filter By select ── */}
                 {/* BUG FIX: value={viewMode} directly — NOT a computed ternary.
                     Previously the computed expression would collapse to '' on sub-filter
                     re-renders, making the dropdown visually disappear. */}
                 <select
                    value={viewMode}
                    onChange={(e) => {
                       const val = e.target.value;
                       setViewMode(val);
                       // Reset sub-filters on mode change
                       if (val === 'class') {
                          setTargetClass(schoolSettings?.classes?.[0] || '');
                          setTargetTeacher('');
                       } else if (val === 'teacher') {
                          setTargetTeacher(allTeachers?.[0]?.id || '');
                          setTargetClass('');
                       } else {
                          setTargetClass('');
                          setTargetTeacher('');
                       }
                    }}
                    className="sp-input w-auto mb-0"
                 >
                    {/* 'self' option only for teachers */}
                    {isTeacher && <option value="self">My Schedule</option>}
                    <option value="school">Full School</option>
                    <option value="class">Class-wise Filter</option>
                    <option value="teacher">Teacher-wise Filter</option>
                 </select>

                 {/* ── Class sub-filter (only visible when viewMode === 'class') ── */}
                 {viewMode === 'class' && (
                    <select
                       value={targetClass}
                       onChange={(e) => setTargetClass(e.target.value)}
                       className="sp-input w-auto mb-0"
                    >
                       <option value="">-- Select Class --</option>
                       {schoolSettings?.classes?.map(c => <option key={c} value={c}>Class {c}</option>)}
                    </select>
                 )}

                 {/* ── Teacher sub-filter (only visible when viewMode === 'teacher') ── */}
                 {viewMode === 'teacher' && (
                    <select
                       value={targetTeacher}
                       onChange={(e) => setTargetTeacher(e.target.value)}
                       className="sp-input w-auto mb-0"
                    >
                       <option value="">-- Select Teacher --</option>
                       {allTeachers?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                 )}
              </div>
            )}
        </div>

        {viewMode === 'school' ? (
          /* ── FULL SCHOOL MASTER MATRIX OVERHAUL ── */
          <div className="space-y-6">
            {/* Day Navigation Tabs */}
            <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-glass overflow-x-auto gap-1">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                <button
                  key={d}
                  onClick={() => setActiveDayTab(d)}
                  className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                    activeDayTab === d
                      ? 'bg-primary text-white shadow-lg shadow-primary/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Matrix View Toggle Header */}
            <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-900/40 p-4 rounded-2xl border border-glass">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Matrix Mode:</span>
                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                  <button
                    onClick={() => setMatrixMode('class')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer border-0 ${
                      matrixMode === 'class' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Class-Wise Matrix
                  </button>
                  <button
                    onClick={() => setMatrixMode('teacher')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer border-0 ${
                      matrixMode === 'teacher' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Teacher-Wise Matrix
                  </button>
                </div>
              </div>

              <span className="text-[11px] font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-xl">
                Showing {activeDayTab} Schedule ({matrixMode === 'class' ? 'All Classes' : 'All Staff Members'})
              </span>
            </div>

            {/* Matrix Table */}
            {(() => {
              const daySlots = (scheduleRaw || []).filter(s => (s.day || '').toLowerCase() === activeDayTab.toLowerCase());
              const maxP = Math.max(...(scheduleRaw?.map(s => s.period_order) || [8]), 8);
              const periodList = Array.from({ length: maxP }, (_, i) => i + 1);

              if (matrixMode === 'class') {
                const matrixClasses = Array.from(new Set([
                  ...(schoolSettings?.classes || []),
                  ...daySlots.map(s => s.class)
                ])).filter(Boolean);

                if (matrixClasses.length === 0) {
                  return <div className="text-center py-10 text-slate-400 text-sm font-semibold">No classes defined in school settings.</div>;
                }

                return (
                  <div className="table-responsive">
                    <table className="legacy-table">
                      <thead>
                        <tr>
                          <th>Class</th>
                          {periodList.map(p => <th key={p}>Period {p}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixClasses.map(cls => {
                          const normCls = (cls || '').trim().toLowerCase();
                          return (
                            <tr key={cls}>
                              <td><strong>{cls}</strong></td>
                              {periodList.map(p => {
                                const slot = daySlots.find(s => (s.class || '').trim().toLowerCase() === normCls && s.period_order === p);
                                return (
                                  <td key={p} style={{ position: 'relative', minWidth: '130px', verticalAlign: 'top' }}>
                                    {slot ? (
                                      <div className="editable-cell group" style={{ display: 'flex', flexDirection: 'column' }}>
                                        {isAdmin && (
                                          <button onClick={() => openEditor(slot)} className="muted border-0 bg-transparent cursor-pointer p-0 absolute right-1 top-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={12} /></button>
                                        )}
                                        <strong style={{ fontSize: '13px', color: '#fff' }}>{slot.subject}</strong>
                                        <span className="muted small" style={{ fontSize: '10px' }}>{slot.period_label || '--:--'}</span>
                                        <span className="badge" style={{ marginTop: '4px', alignSelf: 'flex-start', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                                          {slot.teacher_name}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="muted opacity-20">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              } else {
                // Teacher-Wise Matrix
                const matrixTeachers = allTeachers || [];
                if (matrixTeachers.length === 0) {
                  return <div className="text-center py-10 text-slate-400 text-sm font-semibold">No teachers found in school system.</div>;
                }

                return (
                  <div className="table-responsive">
                    <table className="legacy-table">
                      <thead>
                        <tr>
                          <th>Teacher</th>
                          {periodList.map(p => <th key={p}>Period {p}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixTeachers.map(t => {
                          const normTeacherName = (t.name || '').trim().toLowerCase();
                          return (
                            <tr key={t.id}>
                              <td><strong>{t.name}</strong></td>
                              {periodList.map(p => {
                                const slot = daySlots.find(s => (
                                  s.teacher === t.id ||
                                  (s.teacher || '').trim().toLowerCase() === normTeacherName ||
                                  (s.teacher_name || '').trim().toLowerCase() === normTeacherName
                                ) && s.period_order === p);
                              return (
                                <td key={p} style={{ position: 'relative', minWidth: '130px', verticalAlign: 'top' }}>
                                  {slot ? (
                                    <div className="editable-cell group" style={{ display: 'flex', flexDirection: 'column' }}>
                                      {isAdmin && (
                                        <button onClick={() => openEditor(slot)} className="muted border-0 bg-transparent cursor-pointer p-0 absolute right-1 top-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={12} /></button>
                                      )}
                                      <strong style={{ fontSize: '13px', color: '#fff' }}>{slot.subject}</strong>
                                      <span className="muted small" style={{ fontSize: '10px' }}>{slot.period_label || '--:--'}</span>
                                      <span className="badge" style={{ marginTop: '4px', alignSelf: 'flex-start', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                        {slot.class}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="muted opacity-20">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                );
              }
            })()}
          </div>
        ) : (
          /* ── SINGLE CLASS / TEACHER / SELF INDIVIDUAL TIMETABLE ── */
          activeDaysWithData.length === 0 ? (
             <div className="muted" style={{ padding: '40px 20px', textAlign: 'center' }}>
                Please select a filter to view the timetable.
             </div>
          ) : (
             <div className="table-responsive">
                <table className="legacy-table">
                   <thead>
                      <tr>
                         <th>Day</th>
                         {Array.from({ length: Math.max(...(scheduleRaw?.map(s => s.period_order) || [8]), 8) }).map((_, i) => (
                            <th key={i}>Period {i + 1}</th>
                         ))}
                      </tr>
                   </thead>
                   <tbody>
                      {activeDaysWithData.map(day => {
                         const daySlots = timeline[day];
                         const maxP = Math.max(...(scheduleRaw?.map(s => s.period_order) || [8]), 8);
                         return (
                            <tr key={day}>
                               <td><strong>{day}</strong></td>
                               {Array.from({ length: maxP }).map((_, i) => {
                                  const order = i + 1;
                                  const slot = daySlots.find(s => s.period_order === order);
                                  return (
                                     <td key={order} style={{ position: 'relative', minWidth: '120px', verticalAlign: 'top' }}>
                                        {slot ? (
                                           <div className="editable-cell group" style={{ display: 'flex', flexDirection: 'column' }}>
                                              {isAdmin && (
                                                 <button onClick={() => openEditor(slot)} className="muted border-0 bg-transparent cursor-pointer p-0 absolute right-1 top-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={12} /></button>
                                              )}
                                              <strong style={{ fontSize: '13px' }}>{slot.subject}</strong>
                                              <span className="muted small" style={{ fontSize: '10px' }}>{slot.period_label || '--:--'}</span>
                                              <span className="badge" style={{ marginTop: '4px', alignSelf: 'flex-start' }}>{isTeacher ? slot.class : slot.teacher_name}</span>
                                           </div>
                                        ) : (
                                           <span className="muted opacity-20">-</span>
                                        )}
                                     </td>
                                  );
                               })}
                            </tr>
                         );
                      })}
                   </tbody>
                </table>
             </div>
          )
        )}

      {editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-300">
             <div className="flex justify-between items-center mb-5">
                <h3 className="text-slate-808 dark:text-white font-bold tracking-tight">Edit Block <span className="text-primary italic">#{editingSlot.period_order}</span></h3>
                <button onClick={() => setEditingSlot(null)} className="p-1.5 rounded-lg text-slate-405 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border-0 bg-transparent"><X size={16}/></button>
             </div>
             
             <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-widest uppercase block mb-1">Subject</label>
                  <input type="text" value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} className="sp-input" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-widest uppercase block mb-1">Teacher</label>
                  <select value={editForm.teacher} onChange={e => setEditForm(f => ({ ...f, teacher: e.target.value }))} className="sp-input">
                    <option value="">Unassigned</option>
                    {allTeachers?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                     <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 tracking-widest uppercase block mb-1">Start Time</label>
                     <input type="time" value={editForm.start} onChange={e => setEditForm(f => ({ ...f, start: e.target.value }))} className="sp-input" style={{ colorScheme: 'dark light' }} />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-slate-505 dark:text-slate-400 tracking-widest uppercase block mb-1">End Time</label>
                     <input type="time" value={editForm.end} onChange={e => setEditForm(f => ({ ...f, end: e.target.value }))} className="sp-input" style={{ colorScheme: 'dark light' }} />
                  </div>
                </div>
             </div>

             <div className="flex gap-2 mt-6">
                <button onClick={() => setEditingSlot(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-405 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-805 dark:hover:bg-slate-700 rounded-xl transition-all flex-1 cursor-pointer border-0">Cancel</button>
                <button onClick={() => updateSlotMutation.mutate()} disabled={updateSlotMutation.isPending} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all flex-1 shadow-lg disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer border-0">
                   {updateSlotMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
