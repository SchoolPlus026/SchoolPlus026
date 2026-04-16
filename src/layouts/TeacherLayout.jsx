import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, User, LayoutDashboard } from 'lucide-react';

export default function TeacherLayout() {
  const { user, schoolSettings } = useAppStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    // h-screen + flex-col: bounds the container so main can scroll within it
    <div className="flex flex-col h-screen bg-transparent text-slate-100">

      {/* ── Gradient Header (matches legacy blueprint style) ── */}
      <header className="sp-header h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          {schoolSettings?.logo_url ? (
            <img
              src={schoolSettings.logo_url}
              alt="Logo"
              className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 shadow-lg"
            />
          ) : (
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg border border-white/10">
              T
            </div>
          )}
          <div>
            <Link to="/teacher" className="font-bold text-base tracking-tight text-white hover:text-indigo-200 transition-colors leading-none block">
              {schoolSettings?.name || 'School'}
            </Link>
            <div className="text-[10px] text-indigo-200/80 font-semibold uppercase tracking-widest">
              Teacher Portal
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-200/70 hidden sm:block bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
            {user?.email}
          </span>
          <Link
            to="/teacher"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Dashboard"
          >
            <LayoutDashboard size={18} />
          </Link>
          <Link
            to="/teacher/profile"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="My Profile"
          >
            <User size={18} />
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-300 hover:text-white hover:bg-red-500/70 rounded-xl transition-all border border-red-400/20"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Scrollable Main Content ── */}
      <main className="flex-1 overflow-y-auto scroll-stable">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
