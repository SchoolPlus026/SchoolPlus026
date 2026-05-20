import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, LayoutDashboard, Settings, ChevronLeft, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import GlobalBroadcastBanner from '../components/GlobalBroadcastBanner';

export default function TeacherLayout() {
  const { user, schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const isDashboard = location.pathname.endsWith('/dashboard') || location.pathname === '/teacher';

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)', color: 'var(--text-main)' }}>

      <header className="sp-header h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <div className="brand">
          <div className="logo" title="Editable by Admin">
            {schoolSettings?.logo_url ? (
               <img src={schoolSettings.logo_url} alt="School Logo" className="w-[45px] object-contain" />
            ) : (
               <div className="w-full h-full flex items-center justify-center font-bold text-slate-800">S</div>
            )}
          </div>
          <div>
            <Link to="/teacher" className="hover:opacity-80 transition-opacity">
              <h1>{schoolSettings?.name || 'School Master'}</h1>
            </Link>
            <div className="sub uppercase tracking-widest font-semibold">Teacher Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-200/70 hidden sm:block bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
            {user?.email}
          </span>
          <NotificationBell />
          <Link to="/teacher" className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Dashboard">
            <LayoutDashboard size={18} />
          </Link>
          <ThemeToggle />
          <button onClick={handleRefresh} title="Refresh data"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <RefreshCw size={17} style={{ transition: 'transform 0.5s ease', transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)' }} />
          </button>
          <Link to="/teacher/settings" className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Settings">
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

      {/* ── Global Broadcast Banner ── */}
      <GlobalBroadcastBanner />

      <main className="flex-1 overflow-y-auto scroll-stable">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!isDashboard && (
            <Link to="/teacher/dashboard" className="sp-back-btn">
               <ChevronLeft size={14} /> Back to Dashboard
            </Link>
          )}
          <div key={location.pathname} className="premium-page-transition">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
