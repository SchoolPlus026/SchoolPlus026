import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, Settings, LayoutDashboard, ChevronLeft, Globe } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function PlatformAdminLayout() {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname.endsWith('/dashboard') || location.pathname === '/platform-admin';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col h-screen bg-transparent text-slate-100">
      {/* ── Gradient Header ── */}
      <header className="sp-header h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <div className="brand">
          <div className="logo">
             <Globe size={24} className="text-indigo-600" />
          </div>
          <div>
            <Link to="/platform-admin" className="hover:opacity-80 transition-opacity">
              <h1>SchoolOS+</h1>
            </Link>
            <div className="sub uppercase tracking-widest font-semibold">Platform Admin</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-200/70 hidden sm:block bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
            {user?.email}
          </span>
          <Link
            to="/platform-admin"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Dashboard"
          >
            <LayoutDashboard size={18} />
          </Link>
          <ThemeToggle />
          <Link
            to="/platform-admin/settings"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Settings"
          >
            <Settings size={18} />
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

      {/* ── Scrollable Content ── */}
      <main className="flex-1 overflow-y-auto scroll-stable">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!isDashboard && (
            <Link to="/platform-admin/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white mb-6 bg-slate-800/50 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-glass transition-all">
               <ChevronLeft size={14} /> Back to Dashboard
            </Link>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
