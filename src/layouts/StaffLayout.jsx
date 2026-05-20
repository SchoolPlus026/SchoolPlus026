import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Bell } from 'lucide-react';
import NotificationBell from '../components/NotificationBell';
import PageTransition from '../components/PageTransition';

export default function StaffLayout() {
  const { user, schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      <header className="sp-header h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <div className="brand">
          <div className="logo">
            {schoolSettings?.logo_url
              ? <img src={schoolSettings.logo_url} alt="Logo" className="w-[45px] object-contain" />
              : <div className="w-full h-full flex items-center justify-center font-bold text-slate-800">S</div>
            }
          </div>
          <div>
            <Link to="/staff" className="hover:opacity-80 transition-opacity">
              <h1>{schoolSettings?.name || 'School Master'}</h1>
            </Link>
            <div className="sub uppercase tracking-widest font-semibold">Staff Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-200/70 hidden sm:block bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
            {user?.name}
          </span>
          <NotificationBell />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-300 hover:text-white hover:bg-red-500/70 rounded-xl transition-all border border-red-400/20"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ padding: '24px 16px' }}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}
