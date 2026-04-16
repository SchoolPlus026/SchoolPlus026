import React from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import {
  ClipboardList, Clock, Bell, CalendarHeart, Image,
  FileText, User, Loader2
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';

export default function TeacherDashboard() {
  const { user, schoolSettings } = useAppStore();

  // ── CRASH FIX: Guard against null user/schoolSettings during hydration ──
  if (!user || !schoolSettings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-semibold uppercase tracking-widest">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const modules = [
    { name: 'Roster Attendance', path: '/teacher/attendance', icon: <ClipboardList size={28} />, color: 'text-indigo-400', bg: 'bg-indigo-500/10', glow: 'hover:shadow-indigo-500/20' },
    { name: 'My Timetable',      path: '/teacher/timetable',  icon: <Clock size={28} />,        color: 'text-purple-400',  bg: 'bg-purple-500/10',  glow: 'hover:shadow-purple-500/20' },
    { name: 'Notices',           path: '/teacher/notices',    icon: <Bell size={28} />,         color: 'text-amber-400',   bg: 'bg-amber-500/10',   glow: 'hover:shadow-amber-500/20' },
    { name: 'Leave Portal',      path: '/teacher/leaves',     icon: <CalendarHeart size={28} />,color: 'text-rose-400',    bg: 'bg-rose-500/10',    glow: 'hover:shadow-rose-500/20' },
    { name: 'Media Gallery',     path: '/teacher/gallery',    icon: <Image size={28} />,        color: 'text-pink-400',    bg: 'bg-pink-500/10',    glow: 'hover:shadow-pink-500/20' },
    { name: 'Reports',           path: '/teacher/reports',    icon: <FileText size={28} />,     color: 'text-slate-400',   bg: 'bg-slate-500/10',   glow: 'hover:shadow-slate-500/20' },
    { name: 'My Profile',        path: '/teacher/profile',    icon: <User size={28} />,         color: 'text-teal-400',    bg: 'bg-teal-500/10',    glow: 'hover:shadow-teal-500/20' },
  ];

  return (
    <div className="space-y-8 fade-in pb-10">
      <DashboardHero />

      {/* Module Grid */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #4f46e5, #7c3aed)' }} />
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Academic Console</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {modules.map((mod) => (
            <Link
              key={mod.name}
              to={mod.path}
              className={`module-card flex flex-col items-center justify-center p-6 gap-4 group ${mod.glow} hover:shadow-xl`}
            >
              <div className={`p-4 rounded-2xl ${mod.bg} ${mod.color} group-hover:scale-110 transition-transform duration-300`}>
                {mod.icon}
              </div>
              <span className={`font-bold text-xs uppercase tracking-widest ${mod.color}`}>
                {mod.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
