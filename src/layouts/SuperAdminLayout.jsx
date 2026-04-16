import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, LayoutGrid, ShieldAlert } from 'lucide-react';

export default function SuperAdminLayout() {
  const { user } = useAppStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-8 bg-slate-800 border-b border-slate-700 shadow-2xl z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-900 shadow-lg shadow-emerald-500/20">
            SC
          </div>
          <Link to="/super-admin" className="font-black text-xl tracking-tighter uppercase text-white hover:text-emerald-400 transition-colors">
            Central <span className="text-emerald-500 underline decoration-2 underline-offset-4">Command</span>
          </Link>
          <div className="ml-4 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[10px] font-bold text-emerald-400 uppercase tracking-widest leading-none">
            Developer Mode
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Operator Session</span>
            <span className="text-sm font-semibold text-slate-300">{user?.email}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/30 border border-transparent rounded-xl transition-all"
          >
            <LogOut size={18} />
            Termate Session
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        {/* Subtle background graphic */}
        <div className="absolute top-0 right-0 p-20 opacity-5 pointer-events-none">
          <ShieldAlert size={400} strokeWidth={1} />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10 h-full">
          <Outlet />
        </div>
      </main>

      <footer className="h-10 bg-slate-950 border-t border-slate-800 flex items-center justify-center px-8 text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em] z-20">
        Multi-Tenant Infrastructure Monitoring — Node: Stable
      </footer>
    </div>
  );
}
