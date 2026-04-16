import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LogOut, User } from 'lucide-react';
import GlobalBackButton from '../components/GlobalBackButton';

export default function TeacherLayout() {
  const { user, schoolSettings } = useAppStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-text">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-8 bg-white border-b border-border shadow-sm">
        <div className="flex items-center gap-3">
          {schoolSettings?.logo_url ? (
            <img src={schoolSettings.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white shadow-sm" />
          ) : (
            <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white shadow-sm">
              T
            </div>
          )}
          <Link to="/teacher" className="font-bold text-xl tracking-tight text-text hover:text-indigo-600 transition-colors">
            {schoolSettings?.name || 'Teacher Portal'}
          </Link>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted hidden sm:block bg-slate-100 px-3 py-1.5 rounded-full border border-border">
            {user?.email}
          </span>
          <Link 
            to="/teacher/profile"
            className="p-2 text-muted hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors"
            title="Profile"
          >
            <User size={20} />
          </Link>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-all"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto h-full">
          <GlobalBackButton />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
