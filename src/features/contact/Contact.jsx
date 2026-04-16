import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Phone, Mail, MapPin, School, Lock } from 'lucide-react';

export default function Contact() {
  const { schoolSettings, role } = useAppStore();

  // Privacy: Only Admin can see the direct phone number
  const isAdmin = role === 'admin';

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest mb-1">Contact Information</h3>
        <p className="text-xs text-slate-500 font-semibold">School contact details and address</p>
      </div>

      <div className="sp-card space-y-5">
        {/* School Name */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <School size={18} />
          </div>
          <div>
            <div className="font-bold text-slate-200 text-sm">{schoolSettings?.name || 'Little Flower School'}</div>
            <div className="text-xs text-slate-400 mt-0.5">Parli Vaijnath, Maharashtra</div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4 space-y-4">
          
          {/* Phone — Admin Only */}
          {isAdmin ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <Phone size={14} />
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phone (Admin Only)</div>
                <a href="tel:9022761401" className="text-sm font-bold text-slate-200 hover:text-indigo-300 transition-colors">
                  9022761401
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700/50 border border-slate-600/30 flex items-center justify-center text-slate-500 flex-shrink-0">
                <Lock size={14} />
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Phone</div>
                <div className="text-sm font-bold text-slate-600 italic">Restricted — contact your school admin</div>
              </div>
            </div>
          )}

          {/* Email — visible to all */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Mail size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</div>
              <a href="mailto:info@littleflower.example" className="text-sm font-bold text-slate-200 hover:text-indigo-300 transition-colors">
                info@littleflower.example
              </a>
            </div>
          </div>

          {/* Address — visible to all */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <MapPin size={14} />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Address</div>
              <div className="text-sm font-bold text-slate-200">Parli Vaijnath, Dist. Beed, Maharashtra — 431 515</div>
            </div>
          </div>
        </div>
      </div>

      {/* Google Maps placeholder */}
      <div className="sp-card">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Location</h4>
        <div className="bg-slate-900 border border-white/5 rounded-xl h-40 flex items-center justify-center">
          <div className="text-center">
            <MapPin size={32} className="text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-600 font-bold">Parli Vaijnath, Maharashtra</p>
          </div>
        </div>
      </div>
    </div>
  );
}
