import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import {
  ClipboardList, DollarSign, Clock, Bell, CalendarHeart,
  Image, User, Loader2
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import StudentAttendanceChart from './StudentAttendanceChart';

export default function StudentDashboard() {
  const { user } = useAppStore();

  // ── CRASH FIX: Guard against null user during hydration ──
  // Previously, user.id in queryKey threw "Cannot read properties of null"
  // before the enabled:false guard could catch it → white screen.
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-semibold uppercase tracking-widest">Loading session...</p>
        </div>
      </div>
    );
  }

  return <StudentDashboardContent user={user} />;
}

// Separate component to ensure user is always defined when hooks run
function StudentDashboardContent({ user }) {
  // Safe to access user.id here — parent guarantees user is not null
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
    { name: 'My Attendance', path: '/student/attendance', icon: <ClipboardList size={28} />, color: 'text-indigo-400', bg: 'bg-indigo-500/10', glow: 'hover:shadow-indigo-500/20' },
    { name: 'Fee Ledger',    path: '/student/fees',       icon: <DollarSign size={28} />,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', glow: 'hover:shadow-emerald-500/20' },
    { name: 'Timetable',     path: '/student/timetable',  icon: <Clock size={28} />,        color: 'text-purple-400',  bg: 'bg-purple-500/10',  glow: 'hover:shadow-purple-500/20' },
    { name: 'Notices',       path: '/student/notices',    icon: <Bell size={28} />,         color: 'text-amber-400',   bg: 'bg-amber-500/10',   glow: 'hover:shadow-amber-500/20' },
    { name: 'Apply Leave',   path: '/student/leaves',     icon: <CalendarHeart size={28} />,color: 'text-rose-400',    bg: 'bg-rose-500/10',    glow: 'hover:shadow-rose-500/20' },
    { name: 'Gallery',       path: '/student/gallery',    icon: <Image size={28} />,        color: 'text-pink-400',    bg: 'bg-pink-500/10',    glow: 'hover:shadow-pink-500/20' },
    { name: 'My Profile',    path: '/student/profile',    icon: <User size={28} />,         color: 'text-teal-400',    bg: 'bg-teal-500/10',    glow: 'hover:shadow-teal-500/20' },
  ];

  return (
    <div className="space-y-8 fade-in pb-10">
      <DashboardHero />

      {/* Attendance Chart */}
      <StudentAttendanceChart attendanceData={attendance || []} />

      {/* Module Grid */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #4f46e5, #7c3aed)' }} />
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Student Panel</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {modules.map((mod) => (
            <a
              key={mod.name}
              href={mod.path}
              onClick={(e) => { e.preventDefault(); window.location.href = mod.path; }}
              className={`module-card flex flex-col items-center justify-center p-6 gap-4 group ${mod.glow} hover:shadow-xl`}
            >
              <div className={`p-4 rounded-2xl ${mod.bg} ${mod.color} group-hover:scale-110 transition-transform duration-300`}>
                {mod.icon}
              </div>
              <span className={`font-bold text-xs uppercase tracking-widest ${mod.color}`}>
                {mod.name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
