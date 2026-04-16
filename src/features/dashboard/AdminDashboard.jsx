import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users, ClipboardList, DollarSign, Clock, CalendarHeart,
  Image, Bell, Calendar, LineChart, Settings, CalendarX
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';

// Exact legacy module list for Admin role:
// Users, Attendance, Fees, Calendar, Notices, Gallery, Timetable, Off Classes, Leaves, Reports, Settings
const MODULES = [
  { name: 'Users',        path: '/admin/users',        icon: <Users size={28} />,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    glow: 'hover:shadow-blue-500/20' },
  { name: 'Attendance',   path: '/admin/attendance',   icon: <ClipboardList size={28} />, color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  glow: 'hover:shadow-indigo-500/20' },
  { name: 'Fees',         path: '/admin/fees',         icon: <DollarSign size={28} />,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', glow: 'hover:shadow-emerald-500/20' },
  { name: 'Calendar',     path: '/admin/calendar',     icon: <Calendar size={28} />,      color: 'text-teal-400',    bg: 'bg-teal-500/10',    glow: 'hover:shadow-teal-500/20' },
  { name: 'Notices',      path: '/admin/notices',      icon: <Bell size={28} />,          color: 'text-amber-400',   bg: 'bg-amber-500/10',   glow: 'hover:shadow-amber-500/20' },
  { name: 'Gallery',      path: '/admin/gallery',      icon: <Image size={28} />,         color: 'text-pink-400',    bg: 'bg-pink-500/10',    glow: 'hover:shadow-pink-500/20' },
  { name: 'Timetable',    path: '/admin/timetable',    icon: <Clock size={28} />,         color: 'text-purple-400',  bg: 'bg-purple-500/10',  glow: 'hover:shadow-purple-500/20' },
  { name: 'Off Classes',  path: '/admin/off-classes',  icon: <CalendarX size={28} />,     color: 'text-orange-400',  bg: 'bg-orange-500/10',  glow: 'hover:shadow-orange-500/20' },
  { name: 'Leaves',       path: '/admin/leaves',       icon: <CalendarHeart size={28} />, color: 'text-rose-400',    bg: 'bg-rose-500/10',    glow: 'hover:shadow-rose-500/20' },
  { name: 'Reports',      path: '/admin/reports',      icon: <LineChart size={28} />,     color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    glow: 'hover:shadow-cyan-500/20' },
  { name: 'Settings',     path: '/admin/settings',     icon: <Settings size={28} />,      color: 'text-slate-400',   bg: 'bg-slate-500/10',   glow: 'hover:shadow-slate-500/20' },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-8 fade-in pb-10">
      <DashboardHero />

      <div>
        {/* Legacy exact title: "Admin — Master Control" */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #4f46e5, #7c3aed)' }} />
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Admin — Master Control</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
          {MODULES.map((mod) => (
            <Link
              key={mod.name}
              to={mod.path}
              className={`module-card flex flex-col items-center justify-center p-6 gap-4 group ${mod.glow} hover:shadow-xl`}
            >
              <div className={`p-4 rounded-2xl ${mod.bg} ${mod.color} group-hover:scale-110 transition-transform duration-300`}>
                {mod.icon}
              </div>
              <span className={`font-bold text-xs uppercase tracking-widest ${mod.color} text-center`}>
                {mod.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
