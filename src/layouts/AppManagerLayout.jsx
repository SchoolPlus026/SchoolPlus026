import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, Settings, Key, Globe, ShieldCheck } from 'lucide-react';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';

export default function AppManagerLayout() {
  const { user } = useAppStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans">
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0 bg-slate-950 border-b border-indigo-500/20 shadow-lg shadow-indigo-500/10">
        <div className="brand">
          <div className="logo" title="App Manager">
            <ShieldCheck size={24} className="text-slate-800" />
          </div>
          <div>
             <Link to="/app-manager" className="hover:opacity-80 transition-opacity">
              <h1>Global Center</h1>
            </Link>
            <div className="sub uppercase tracking-widest font-semibold">App Manager Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs font-bold text-slate-400 hidden sm:block bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
            {user?.email}
          </span>
          <ThemeToggle />
          <NotificationBell />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all border border-rose-500/20"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-stable bg-[#0b1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
