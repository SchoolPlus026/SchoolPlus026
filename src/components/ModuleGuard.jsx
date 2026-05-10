import React from 'react';
import { useAppStore } from '../store/useAppStore';

export default function ModuleGuard({ moduleName, children, inline = false }) {
  const { schoolSettings, role } = useAppStore();
  const activeModules = schoolSettings?.modules_active || [];

  // Platform Admins can see everything regardless of the toggle (or we can enforce it strictly)
  // Let's enforce it strictly so they see what the school sees, unless they are debugging.
  // Assuming strict enforcement:
  const isEnabled = activeModules.includes(moduleName);

  if (isEnabled) {
    return children;
  }

  if (inline) {
    return null; // For sidebar links, just hide it
  }

  // Full page block
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-in zoom-in duration-500">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <span className="text-3xl opacity-50">🚫</span>
      </div>
      <h2 className="text-xl font-black text-slate-800 mb-2 tracking-tight">Module Disabled</h2>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
        This feature has been turned off by the administration. Please contact your school admin if you need access.
      </p>
    </div>
  );
}
