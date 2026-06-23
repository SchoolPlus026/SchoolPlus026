import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function DigitalIdCard() {
  const { user, schoolSettings } = useAppStore();

  return (
    <div className="bg-white border border-border rounded-2xl p-6 shadow-sm mb-6 flex flex-col md:flex-row items-center gap-6">
       <div className="w-24 h-24 rounded-2xl bg-slate-100 border border-border flex items-center justify-center p-2 shadow-inner shrink-0">
          {schoolSettings?.logo_url ? (
            <img src={schoolSettings.logo_url} alt="School Logo" className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-3xl font-bold text-primary">S</div>
          )}
       </div>
       <div className="flex-1 text-center md:text-left">
          <div className="text-sm font-bold text-primary tracking-widest uppercase mb-1">
             {schoolSettings?.name || 'School Portal'}
          </div>
          <h2 className="text-3xl font-bold text-text mb-2">
             {user?.user_metadata?.name || user?.email}
          </h2>
          <div className="inline-flex flex-wrap gap-3 items-center justify-center md:justify-start">
             <span className="px-3 py-1 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg border border-border">
                Role: Student
             </span>
             {user?.class && (
               <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm font-semibold rounded-lg border border-indigo-100">
                  Class: {user.class}
               </span>
             )}
          </div>
       </div>
    </div>
  );
}
