import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, CalendarClock } from 'lucide-react';

export default function TimetableViewer({ adminPreviewClass }) {
  const { role, user, schoolSettings } = useAppStore();
  const [viewMode, setViewMode] = React.useState('self'); // 'self', 'class', 'school'

  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';
  const isAdmin = role === 'admin';

  // For Class Timetable view
  const [targetClass, setTargetClass] = React.useState(adminPreviewClass || '');

  React.useEffect(() => {
     if (adminPreviewClass) setTargetClass(adminPreviewClass);
  }, [adminPreviewClass]);

  const { data: scheduleRaw, isLoading } = useQuery({
    queryKey: ['timetable', schoolSettings?.school_id, user?.id, targetClass, viewMode, role],
    queryFn: async () => {
      let query = supabase.from('timetable').select('*'); 
      
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
         }
         // if viewMode === 'school', no further filters.
      } else if (isTeacher) {
         if (viewMode === 'self') {
            query = query.eq('teacher', user.id);
         } else if (viewMode === 'class') {
            const { data: profile } = await supabase.from('users').select('class').eq('id', user.id).single();
            if (profile?.class) {
               query = query.eq('class', profile.class);
            } else if (targetClass) {
               query = query.eq('class', targetClass);
            } else {
               return []; // No class selected and no deployed class
            }
         }
         // if viewMode === 'school', no further filters.
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Safely perform secondary map-reduce lookup linking custom text UUID back to Names
      const allTeachersIds = [...new Set(data.map(d => d.teacher))].filter(Boolean);
      let teacherMap = {};
      if (allTeachersIds.length > 0) {
         const { data: teacherProfiles } = await supabase.from('users').select('id, name').in('id', allTeachersIds);
         teacherProfiles?.forEach(t => { teacherMap[t.id] = t.name; });
      }

      return data.map(slot => ({
         ...slot,
         teacher_name: teacherMap[slot.teacher] || 'Unknown Assignee'
      }));
    },
    enabled: !!schoolSettings?.school_id
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
    <div className="space-y-4">
       {(isTeacher || isAdmin) && (
         <div className="flex flex-wrap gap-2 mb-6">
            {isTeacher && (
               <button 
                  onClick={() => setViewMode('self')} 
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${viewMode === 'self' ? 'bg-primary text-white shadow-lg' : 'bg-[#0a1128] text-slate-400 hover:text-white border border-glass'}`}
               >
                  Self Timetable
               </button>
            )}
            <button 
               onClick={() => setViewMode('class')} 
               className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${viewMode === 'class' ? 'bg-primary text-white shadow-lg' : 'bg-[#0a1128] text-slate-400 hover:text-white border border-glass'}`}
            >
               Allocated Class
            </button>
            <button 
               onClick={() => setViewMode('school')} 
               className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${viewMode === 'school' ? 'bg-primary text-white shadow-lg' : 'bg-[#0a1128] text-slate-400 hover:text-white border border-glass'}`}
            >
               School Timetable
            </button>

            {viewMode === 'class' && !adminPreviewClass && (
               <select 
                  value={targetClass} 
                  onChange={e => setTargetClass(e.target.value)}
                  className="ml-auto bg-[#0a1128] border border-glass rounded-xl px-4 py-2 text-xs font-bold text-white focus:border-primary focus:outline-none"
               >
                  <option value="">Select a Class...</option>
                  {schoolSettings?.classes?.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            )}
         </div>
       )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
         {activeDaysWithData.map(day => {
          const isToday = day === activeDay;
          
          return (
          <div key={day} className={`bg-surface border rounded-2xl p-6 shadow-xl transition-all ${isToday ? 'border-primary ring-1 ring-primary/20 shadow-primary/10 relative overflow-hidden' : 'border-glass'}`}>
             {isToday && <div className="absolute top-0 right-0 bg-primary min-w-[70px] text-center text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-bl-xl shadow-lg">Current</div>}
             <h3 className={`text-lg font-extrabold tracking-tight mb-5 border-b border-glass pb-2 ${isToday ? 'text-white' : 'text-slate-300'}`}>{day}</h3>
             
             <div className="space-y-3">
               {timeline[day].map((slot, idx) => (
                  <div key={slot.id || idx} className="bg-[#0a1128] border border-glass hover:border-glass/80 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center shadow-sm hover:shadow-md transition-all gap-3 sm:gap-0">
                     <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-black/40 rounded-lg text-slate-400 font-extrabold border border-glass shadow-inner shrink-0 text-sm">
                        #{slot.period_order}
                     </div>
                     <div className="sm:ml-4 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:mb-1">
                           <div className="text-white font-bold tracking-tight text-[15px]">{slot.subject}</div>
                           <div className="text-[10px] sm:mt-0 font-mono font-bold tracking-tight text-slate-400 bg-glass px-2 py-0.5 rounded shadow-inner w-max mt-1">{slot.period_label}</div>
                        </div>
                        <div className="flex items-center text-[11px] font-bold uppercase tracking-wider mt-2 sm:mt-0">
                           {isTeacher ? (
                              <span className="text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">Deployed: Class {slot.class}</span>
                           ) : (
                              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Instructor: {slot.teacher_name}</span>
                           )}
                           {isAdmin && <span className="text-slate-500 ml-auto">[{slot.class} | {slot.teacher_name}]</span>}
                        </div>
                     </div>
                  </div>
               ))}
             </div>
          </div>
       )})}
    </div>
  );
}
