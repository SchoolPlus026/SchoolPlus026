import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';
import { LayoutDashboard, Users, Calendar, DollarSign, Bell, Clock, Settings, LogOut, Menu, X, ClipboardList } from 'lucide-react';

export default function AdminLayout() {
  const { user, schoolSettings } = useAppStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const menuItems = [
    { name: 'Dashboard', path: '/admin', icon: <LayoutDashboard size={20} />, exact: true },
    { name: 'Users', path: '/admin/users', icon: <Users size={20} /> },
    { name: 'Attendance', path: '/admin/attendance', icon: <ClipboardList size={20} /> },
    { name: 'Fees', path: '/admin/fees', icon: <DollarSign size={20} /> },
    { name: 'Timetable', path: '/admin/timetable', icon: <Clock size={20} /> },
    { name: 'Notices', path: '/admin/notices', icon: <Bell size={20} /> },
    { name: 'Events', path: '/admin/events', icon: <Calendar size={20} /> },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-glass transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-glass">
          <div className="flex items-center gap-3">
            {schoolSettings?.logo_url ? (
              <img src={schoolSettings.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white shadow-lg">❖</div>
            )}
            <span className="font-semibold text-lg truncate max-w-[140px] text-white tracking-tight">{schoolSettings?.name || 'Admin'}</span>
          </div>
          <button className="md:hidden text-muted hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="p-4 space-y-1.5 overflow-y-auto h-[calc(100vh-4rem)]">
          <p className="px-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Master Portal</p>
          {menuItems.map((item) => (
            <NavLink
              onClick={() => setSidebarOpen(false)}
              key={item.name}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isActive ? 'bg-primary/10 text-primary font-semibold shadow-inner' : 'text-slate-400 hover:bg-glass hover:text-slate-100'
                }`
              }
            >
              {item.icon}
              {item.name}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content Node */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-surface/40 border-b border-glass backdrop-blur-lg">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-slate-300 hover:text-white transition-colors" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-semibold hidden sm:block text-white">Administration</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-400 hidden sm:block bg-glass px-3 py-1 rounded-full">{user?.email}</span>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 flex-shrink-0 py-1.5 text-sm font-semibold text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-all"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Dynamic Context Render */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
