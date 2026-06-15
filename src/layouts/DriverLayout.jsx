import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, LayoutDashboard, Settings, ChevronLeft, RefreshCw } from 'lucide-react';
import { useThrottledRefresh } from '../hooks/useThrottledRefresh';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import PageTransition from '../components/PageTransition';
import RecoveryNudgeBanner from '../components/RecoveryNudgeBanner';
import ResetWarningBanner from '../components/ResetWarningBanner';

export default function DriverLayout() {
  const { user, schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshing, cooldownLeft, handleRefresh } = useThrottledRefresh();
  const isDashboard = location.pathname.endsWith('/dashboard') || location.pathname === '/driver';

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
            <Link to="/driver" className="hover:opacity-80 transition-opacity">
              <h1>{schoolSettings?.name || 'School Master'}</h1>
            </Link>
            <div className="sub uppercase tracking-widest font-semibold">Driver Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-200/70 hidden sm:block bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
            {user?.email}
          </span>
          <NotificationBell />
          <Link to="/driver" className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Dashboard">
            <LayoutDashboard size={18} />
          </Link>
          <ThemeToggle />
          <button onClick={handleRefresh}
            disabled={refreshing || cooldownLeft > 0}
            title={cooldownLeft > 0 ? `Please wait ${cooldownLeft}s` : "Refresh data"}
            aria-label={cooldownLeft > 0 ? `Please wait ${cooldownLeft}s` : "Refresh data"}
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-1"
            style={{ border: 'none', background: 'transparent', cursor: cooldownLeft > 0 ? 'not-allowed' : 'pointer', opacity: cooldownLeft > 0 ? 0.6 : 1 }}
          >
            <RefreshCw size={17} style={{ transition: 'transform 0.5s ease', transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)' }} />
            {cooldownLeft > 0 && <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{cooldownLeft}s</span>}
          </button>
          <Link to="/driver/settings" className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Settings">
            <Settings size={18} />
          </Link>
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-300 hover:text-white hover:bg-red-500/70 rounded-xl transition-all border border-red-400/20"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Recovery Onboarding Nudge ── */}
      <RecoveryNudgeBanner />

      {/* ── Password Reset Security Warning ── */}
      <ResetWarningBanner />

      <main className="flex-1 overflow-y-auto scroll-stable">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!isDashboard && (
            <Link to="/driver/dashboard" className="sp-back-btn">
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
