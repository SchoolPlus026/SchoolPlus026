import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Phone, Mail, MapPin, School } from 'lucide-react';

export default function Contact() {
  const { schoolSettings } = useAppStore();

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest mb-1">Contact Us</h3>
        <p className="text-xs text-slate-500 font-semibold">School contact information</p>
      </div>

      <div className="sp-card space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <School size={18} />
          </div>
          <div>
            <div className="font-bold text-slate-200 text-sm">{schoolSettings?.name || 'Little Flower School'}</div>
            <div className="text-xs text-slate-400 mt-0.5">Parli Vaijnath, Maharashtra</div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Phone size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phone</div>
              <div className="text-sm font-bold text-slate-200">9022761401</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Mail size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</div>
              <div className="text-sm font-bold text-slate-200">info@littleflower.example</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <MapPin size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Address</div>
              <div className="text-sm font-bold text-slate-200">Parli Vaijnath, Maharashtra</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
