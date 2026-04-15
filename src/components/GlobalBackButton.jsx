import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function GlobalBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide the back button if we are on the base dashboard of any role
  const path = location.pathname;
  const isBaseDashboard = path.endsWith('/dashboard') || path === '/admin/' || path === '/teacher/' || path === '/student/';

  if (isBaseDashboard) return null;

  return (
    <button
      onClick={() => navigate(-1)}
      className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary transition-colors group"
    >
      <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center group-hover:border-primary transition-colors shadow-sm">
        <ArrowLeft size={16} />
      </div>
      <span>Go Back</span>
    </button>
  );
}
