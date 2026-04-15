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
    <div className="bg-surface border border-glass rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary/20 p-2 rounded-xl text-primary border border-primary/20">
          <CalendarHeart size={24} />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">My Attendance Analytics</h2>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-8">
        
        {/* CSS Circular Progress Ring */}
        <div className="relative flex items-center justify-center flex-shrink-0">
          <svg className="w-36 h-36 transform -rotate-90">
            <circle
              className="text-glass"
              strokeWidth="12"
              stroke="currentColor"
              fill="transparent"
              r="60"
              cx="72"
              cy="72"
            />
            <circle
              className="text-primary transition-all duration-1000 ease-out"
              strokeWidth="12"
              strokeDasharray={60 * 2 * Math.PI}
              strokeDashoffset={60 * 2 * Math.PI - (presentPercentage / 100) * 60 * 2 * Math.PI}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="60"
              cx="72"
              cy="72"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
             <span className="text-3xl font-bold text-white">{presentPercentage}%</span>
             <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1">Present</span>
          </div>
        </div>

        {/* Stacked Horizon Bar & Stats */}
        <div className="flex-1 w-full space-y-5">
          <div className="w-full h-3.5 bg-glass rounded-full overflow-hidden flex shadow-inner">
             <div style={{ width: `${presentPercentage}%` }} className="h-full bg-emerald-500 transition-all duration-1000"></div>
             <div style={{ width: `${latePercentage}%` }} className="h-full bg-amber-500 transition-all duration-1000"></div>
             <div style={{ width: `${absentPercentage}%` }} className="h-full bg-red-500 transition-all duration-1000"></div>
             <div style={{ width: `${otherPercentage}%` }} className="h-full bg-blue-500 transition-all duration-1000"></div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            <div className="bg-[#0a1128] border border-glass rounded-xl p-4 text-center">
               <div className="text-2xl font-bold text-white">{total}</div>
               <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Total Days</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
               <div className="text-2xl font-bold text-emerald-400">{present}</div>
               <div className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider mt-1">Present</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
               <div className="text-2xl font-bold text-amber-400">{late}</div>
               <div className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider mt-1">Late</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
               <div className="text-2xl font-bold text-red-400">{absent}</div>
               <div className="text-[10px] text-red-400/80 font-bold uppercase tracking-wider mt-1">Absent</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
