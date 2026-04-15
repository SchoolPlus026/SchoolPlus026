import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, Bell, CalendarHeart, Image, FileText, Settings, User } from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';

export default function TeacherDashboard() {
  const modules = [
    { name: 'Roster Attendance', path: '/teacher/attendance', icon: <ClipboardList size={28} />, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { name: 'My Timetable', path: '/teacher/timetable', icon: <Clock size={28} />, color: 'text-purple-500', bg: 'bg-purple-50' },
    { name: 'Digital Notices', path: '/teacher/notices', icon: <Bell size={28} />, color: 'text-amber-500', bg: 'bg-amber-50' },
    { name: 'Leave Portal', path: '/teacher/leaves', icon: <CalendarHeart size={28} />, color: 'text-rose-500', bg: 'bg-rose-50' },
    { name: 'Media Gallery', path: '/teacher/gallery', icon: <Image size={28} />, color: 'text-pink-500', bg: 'bg-pink-50' },
    { name: 'Reports', path: '/teacher/reports', icon: <FileText size={28} />, color: 'text-slate-400', bg: 'bg-slate-100' },
    { name: 'My Profile', path: '/teacher/profile', icon: <User size={28} />, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-10">
      <DashboardHero />

      <div className="px-2 flex items-center justify-between">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
          <div className="w-2 h-8 bg-indigo-500 rounded-full shadow-lg shadow-indigo-200"></div>
          Academic Console
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
            
            {/* Background decorative path hint */}
            <div className={`absolute -bottom-4 -right-4 p-8 ${mod.color} opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none transform rotate-12`}>
              {mod.icon}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
