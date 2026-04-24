import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, ClipboardList, DollarSign, Clock, CalendarHeart,
  Image, Bell, Calendar, LineChart, Settings, CalendarX, Phone, Lock
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';

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
  { name: 'Contact',      path: '/admin/contact',      icon: <Phone size={28} />,         color: 'text-zinc-400',    bg: 'bg-zinc-500/10',    glow: 'hover:shadow-zinc-500/20' },
  { name: 'Settings',     path: '/admin/settings',     icon: <Settings size={28} />,      color: 'text-slate-400',   bg: 'bg-slate-500/10',   glow: 'hover:shadow-slate-500/20' },
];

const PREMIUM_MODULES = ['Fees', 'Timetable', 'Gallery'];

export default function AdminDashboard() {
  const { schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const isPremium = schoolSettings?.subscription_tier === 'Premium';

  const handleModuleClick = (e, mod) => {
    if (!isPremium && PREMIUM_MODULES.includes(mod.name)) {
      e.preventDefault();
      setShowUpgradeModal(true);
    }
  };
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
          {MODULES.map((mod) => {
            const isLocked = !isPremium && PREMIUM_MODULES.includes(mod.name);
            return (
              <Link
                key={mod.name}
                to={isLocked ? '#' : mod.path}
                onClick={(e) => handleModuleClick(e, mod)}
                className={`module-card flex flex-col items-center justify-center p-6 gap-4 group hover:shadow-xl relative ${isLocked ? 'opacity-80 grayscale-[0.5]' : mod.glow}`}
              >
                {isLocked && (
                  <div className="absolute top-3 right-3 text-slate-400">
                    <Lock size={16} />
                  </div>
                )}
                <div className={`p-4 rounded-2xl ${isLocked ? 'bg-slate-500/10 text-slate-400' : `${mod.bg} ${mod.color}`} ${!isLocked && 'group-hover:scale-110'} transition-transform duration-300`}>
                  {mod.icon}
                </div>
                <span className={`font-bold text-xs uppercase tracking-widest ${isLocked ? 'text-slate-400' : mod.color} text-center`}>
                  {mod.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', borderLeft: '4px solid #4f46e5' }}>
            <h3 style={{ marginBottom: '8px' }} className="flex items-center gap-2"><Lock size={20} className="text-indigo-400" /> Premium Feature</h3>
            <p className="muted small" style={{ marginBottom: '24px', fontSize: '14px' }}>
              Unlock this feature with a Premium Subscription. Contact Platform Admin to upgrade your account and access Timetable, Fees, and infinite Gallery storage.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn outline w-full" onClick={() => setShowUpgradeModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
