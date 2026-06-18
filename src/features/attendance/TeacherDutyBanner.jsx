import React from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export default function TeacherDutyBanner() {
  const { schoolSettings, user, role } = useAppStore();

  const { data: missingPeriods = [], isLoading } = useQuery({
    queryKey: ['attendance', 'duty_radar', schoolSettings?.school_id, user?.id],
    queryFn: async () => {
      if (role !== 'teacher' || !schoolSettings?.school_id || !user?.id) return [];
      const { data, error } = await supabase.rpc('get_missing_attendance_radar', {
        p_school_id: schoolSettings.school_id
      });
      if (error) throw error;
      // Filter down to just this teacher's periods
      const teacherPeriods = (data || []).filter(d => d.teacher_id === user.id);

      // Deduplicate by class_name (keeping the 1st period by period_order)
      const uniqueClasses = {};
      teacherPeriods.forEach(p => {
        if (!uniqueClasses[p.class_name] || p.period_order < uniqueClasses[p.class_name].period_order) {
          uniqueClasses[p.class_name] = p;
        }
      });

      return Object.values(uniqueClasses).sort((a, b) => a.period_order - b.period_order);
    },
    enabled: !!schoolSettings?.school_id && role === 'teacher' && !!user?.id,
    refetchInterval: 60000, // Check every minute as fallback
  });

  if (isLoading || missingPeriods.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 fade-in shadow-lg">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="text-amber-500" size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-amber-500 uppercase tracking-widest">Staff Pending Duty</h3>
          <p className="text-sm text-slate-300 font-semibold mt-0.5 leading-snug">
            You have not submitted attendance for {missingPeriods.length} assigned period{missingPeriods.length > 1 ? 's' : ''} today.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {missingPeriods.map((p, i) => (
              <span key={i} className="text-[10px] font-black bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded uppercase tracking-wider">
                {p.class_name} • {p.subject_name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Link 
        to="/teacher/attendance" 
        className="flex-shrink-0 w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-black uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        Mark Now <ArrowRight size={14} />
      </Link>
    </div>
  );
}
