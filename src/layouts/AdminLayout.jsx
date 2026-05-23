import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, Settings, LayoutDashboard, ChevronLeft, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import GlobalBroadcastBanner from '../components/GlobalBroadcastBanner';
import PageTransition from '../components/PageTransition';
import RecoveryNudgeBanner from '../components/RecoveryNudgeBanner';
import ResetWarningBanner from '../components/ResetWarningBanner';

export default function AdminLayout() {
  const { user, schoolSettings, isImpersonating, clearImpersonation } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [hideFreeBanner, setHideFreeBanner] = React.useState(false);
  const isDashboard = location.pathname.endsWith('/dashboard') || location.pathname === '/admin';

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

      {/* ── Impersonation Banner ── */}
      {isImpersonating && (
        <div className="bg-red-500 text-white font-bold text-sm py-2 px-4 flex justify-between items-center z-50 shadow-md">
          <span>You are currently impersonating <strong>{schoolSettings?.name}</strong>. Actions taken here are live!</span>
          <button 
            onClick={() => {
              clearImpersonation();
              navigate('/platform-admin');
            }}
            className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition-colors"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {/* ── Gradient Header ── */}
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
            <Link to="/admin" className="hover:opacity-80 transition-opacity">
              <h1>{schoolSettings?.name || 'School Master'}</h1>
            </Link>
            <div className="sub uppercase tracking-widest font-semibold">Admin Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-200/70 hidden sm:block bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
            {user?.email}
          </span>
          <NotificationBell />
          <Link
            to="/admin"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Dashboard"
          >
            <LayoutDashboard size={18} />
          </Link>
          <ThemeToggle />
          <button
            onClick={handleRefresh}
            title="Refresh data"
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <RefreshCw size={17} style={{ transition: 'transform 0.5s ease', transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)' }} />
          </button>
          <Link
            to="/admin/settings"
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

      {/* ── Global Broadcast Banner ── */}
      <GlobalBroadcastBanner />

      {/* ── Recovery Onboarding Nudge ── */}
      <RecoveryNudgeBanner />

      {/* ── Password Reset Security Warning ── */}
      <ResetWarningBanner />

      {/* ── Trial/Free Plan Banner ── */}
      {schoolSettings?.subscription_tier === 'Free' && !hideFreeBanner && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm py-2 px-4 flex justify-between items-center shadow-md">
          <span>You are currently on the Free Plan. Upgrade to Premium to unlock Timetable, Fees, and more!</span>
          <button 
            onClick={() => setHideFreeBanner(true)}
            className="text-white/80 hover:text-white transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Scrollable Content ── */}
      <main className="flex-1 overflow-y-auto scroll-stable">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!isDashboard && (
            <Link to="/admin/dashboard" className="sp-back-btn">
               <ChevronLeft size={14} /> Back to Dashboard
            </Link>
          )}
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  );
}
