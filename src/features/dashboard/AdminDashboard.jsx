import React from 'react';
import { Link } from 'react-router-dom';
import { Users, ClipboardList, DollarSign, Clock, CalendarHeart, Image, Bell, Calendar, LineChart, Settings } from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';

export default function AdminDashboard() {
  const modules = [
    { name: 'Users', path: '/admin/users', icon: <Users size={32} />, color: 'text-blue-500', bg: 'bg-blue-50' },
    { name: 'Attendance', path: '/admin/attendance', icon: <ClipboardList size={32} />, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { name: 'Fees', path: '/admin/fees', icon: <DollarSign size={32} />, color: 'text-green-500', bg: 'bg-green-50' },
    { name: 'Timetable', path: '/admin/timetable', icon: <Clock size={32} />, color: 'text-purple-500', bg: 'bg-purple-50' },
    { name: 'Leaves', path: '/admin/leaves', icon: <CalendarHeart size={32} />, color: 'text-rose-500', bg: 'bg-rose-50' },
    { name: 'Gallery', path: '/admin/gallery', icon: <Image size={32} />, color: 'text-pink-500', bg: 'bg-pink-50' },
    { name: 'Notices', path: '/admin/notices', icon: <Bell size={32} />, color: 'text-amber-500', bg: 'bg-amber-50' },
    { name: 'Calendar', path: '/admin/events', icon: <Calendar size={32} />, color: 'text-teal-500', bg: 'bg-teal-50' },
    { name: 'Reports', path: '/admin/reports', icon: <LineChart size={32} />, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={32} />, color: 'text-slate-500', bg: 'bg-slate-50' },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero />

      <h3 className="text-xl font-bold text-text mb-4 px-2 flex items-center gap-2">
        <div className="w-1.5 h-6 bg-primary rounded-full"></div>
        Master Control Panel
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
        {modules.map((mod) => (
          <Link
            key={mod.name}
            to={mod.path}
            className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-border hover:shadow-md hover:-translate-y-1 transition-all duration-200 group relative overflow-hidden"
          >
            <div className={`p-4 rounded-xl ${mod.bg} ${mod.color} mb-4 group-hover:scale-110 transition-transform duration-200 relative z-10`}>
              {mod.icon}
            </div>
            <span className="font-bold text-text relative z-10">{mod.name}</span>
            <div className={`absolute top-0 right-0 p-4 ${mod.color} opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none`}>
              {mod.icon}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
