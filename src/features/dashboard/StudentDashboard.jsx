import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { ClipboardList, DollarSign, Clock, Bell, CalendarHeart, Image, User, LayoutGrid } from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import StudentAttendanceChart from './StudentAttendanceChart';

export default function StudentDashboard() {
  const { user } = useAppStore();

  // Fetch student's own attendance for the pie chart
  const { data: attendance } = useQuery({
    queryKey: ['my-attendance-stats', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('status')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  const modules = [
    { name: 'My Attendance', path: '/student/attendance', icon: <ClipboardList size={28} />, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { name: 'Fee Ledger', path: '/student/fees', icon: <DollarSign size={28} />, color: 'text-green-500', bg: 'bg-green-50' },
    { name: 'Class Timetable', path: '/student/timetable', icon: <Clock size={28} />, color: 'text-purple-500', bg: 'bg-purple-50' },
    { name: 'Latest Notices', path: '/student/notices', icon: <Bell size={28} />, color: 'text-amber-500', bg: 'bg-amber-50' },
    { name: 'Apply Leave', path: '/student/leaves', icon: <CalendarHeart size={28} />, color: 'text-rose-500', bg: 'bg-rose-50' },
    { name: 'Media Gallery', path: '/student/gallery', icon: <Image size={28} />, color: 'text-pink-500', bg: 'bg-pink-50' },
    { name: 'My Profile', path: '/student/profile', icon: <User size={28} />, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-12">
      <DashboardHero />

      {/* High impact graphic row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <StudentAttendanceChart attendanceData={attendance || []} />
         
         <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 p-10 opacity-10"><LayoutGrid size={160} /></div>
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Student <span className="text-indigo-400">Panel</span></h3>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest leading-relaxed max-w-xs">
               Access your individualized academic lifecycle portal. Track metrics, manage submissions, and stay updated.
            </p>
            <div className="mt-8 flex gap-4">
               <div className="px-4 py-2 bg-slate-800 rounded-xl border border-slate-700 text-[10px] font-black uppercase tracking-widest">Node: Optimized</div>
               <div className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">Sync: Active</div>
            </div>
         </div>
      </div>

      <div className="px-2 flex items-center justify-between">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
          <div className="w-2 h-8 bg-indigo-500 rounded-full shadow-lg shadow-indigo-200"></div>
          Portal Navigation
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {modules.map((mod) => (
          <Link
            key={mod.name}
            to={mod.path}
            className="flex flex-col items-center justify-center p-8 bg-white rounded-[2rem] shadow-xl shadow-slate-100/50 border border-slate-100 hover:shadow-indigo-500/10 hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden"
          >
            <div className={`p-5 rounded-2xl ${mod.bg} ${mod.color} mb-5 group-hover:scale-110 transition-transform duration-300 relative z-10 shadow-sm`}>
              {mod.icon}
            </div>
            <span className="font-black text-slate-700 text-xs uppercase tracking-widest relative z-10 group-hover:text-primary transition-colors">{mod.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
