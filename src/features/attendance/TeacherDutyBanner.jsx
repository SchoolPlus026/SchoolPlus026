import React from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTieredCache } from '../../hooks/useTieredCache';

// Helper to get current date in IST
function getISTNow() {
  const utc = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcMs = utc.getTime() + utc.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + istOffset);
}

// Helper to parse period start time like "09:00 AM - 09:40 AM" into IST Date object
function parsePeriodStartTimeIST(periodLabel, dateStr) {
  if (!periodLabel) return null;
  const match = periodLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export default function TeacherDutyBanner() {
  const { schoolSettings, user, role } = useAppStore();

  const cacheConfig = useTieredCache({
    freeStaleTime: 10 * 60 * 1000,
    premiumStaleTime: 30 * 1000,
    premiumRefetchInterval: 60000
  });

  const { data: missingPeriods = [], isLoading } = useQuery({
    queryKey: ['attendance', 'duty_radar', schoolSettings?.school_id, user?.id],
    queryFn: async () => {
      if (role !== 'teacher' || !schoolSettings?.school_id || !user?.id) return [];
      const { data, error } = await supabase.rpc('get_missing_attendance_radar', {
        p_school_id: schoolSettings.school_id
      });
      if (error) throw error;
      
      const istNow = getISTNow();
      const todayStr = istNow.toISOString().split('T')[0];
      
      // Filter down to just this teacher's periods and make sure class_name and subject_name are valid
      const teacherPeriods = (data || []).filter(d => {
        if (d.teacher_id !== user.id || !d.class_name || d.class_name.trim() === '' || !d.subject_name || d.subject_name.trim() === '') {
          return false;
        }
        
        // Filter out future periods (keep only those that have already started)
        const startTime = parsePeriodStartTimeIST(d.period_label, todayStr);
        if (startTime && istNow < startTime) return false;
        
        return true;
      });

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
    ...cacheConfig,
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
          <p className="text-sm text-slate-800 dark:text-slate-300 font-semibold mt-0.5 leading-snug">
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
