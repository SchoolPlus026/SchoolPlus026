import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Loader2 } from 'lucide-react';

export default function GlobalUploadToasts() {
  const { backgroundUploads } = useAppStore();

  if (!backgroundUploads || backgroundUploads.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {backgroundUploads.map(upload => (
        <div 
          key={upload.id} 
          className="bg-slate-900 text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-4 w-80 animate-in slide-in-from-right pointer-events-auto"
        >
          <Loader2 size={24} className="text-primary animate-spin shrink-0" />
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-bold truncate">{upload.title}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              {upload.status} ({upload.current}/{upload.total})
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${(upload.current / Math.max(1, upload.total)) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
