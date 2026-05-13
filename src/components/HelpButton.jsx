import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function HelpButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAppStore();

  // Don't show on login/register/reset-password pages or inside the help module itself
  if (!role || ['/login', '/register', '/reset-password'].includes(location.pathname) || location.pathname.includes('/knowledge-base') || location.pathname.includes('/platform-admin')) {
    return null;
  }

  // Auto-detect target module from the URL
  // e.g. /admin/attendance -> attendance
  const segments = location.pathname.split('/').filter(Boolean);
  const currentModule = segments.length > 1 ? segments[1] : 'none';

  const handleHelpClick = () => {
    navigate(`/${role}/knowledge-base?module=${currentModule}`);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-500">
      <button 
        onClick={handleHelpClick}
        title="Need Help? Watch Tutorials"
        className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-[0_8px_30px_rgb(79,70,229,0.4)] px-4 py-3 rounded-full font-black text-sm tracking-wide transition-all hover:scale-105 active:scale-95 border border-white/10 group"
      >
        <HelpCircle size={20} className="group-hover:rotate-12 transition-transform duration-300" />
        <span className="hidden sm:inline">Help / Tutorials</span>
      </button>
    </div>
  );
}
