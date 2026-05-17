import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Target, DollarSign, CalendarX, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export default function ExecutiveBriefingWidget({ forceShow = false }) {
  const { schoolSettings } = useAppStore();
  const navigate = useNavigate();
  
  const today = new Date().toISOString().split('T')[0];
  const [dismissed, setDismissed] = useState(() => {
    return !!localStorage.getItem(`dismissed_briefing_${today}`);
  });

  const { data: briefing, isLoading: loading } = useQuery({
    queryKey: ['executive-briefing', schoolSettings?.school_id, today],
    queryFn: async () => {
      if (!schoolSettings?.school_id) return { staff_on_leave: "0", fees_collected: "₹0", pending_complaints: "0" };

      const [leavesRes, feesRes, complaintsRes] = await Promise.all([
        supabase
          .from('leaves')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', schoolSettings.school_id)
          .neq('role', 'student')
          .ilike('status', 'approved')
          .lte('from_date', today)
          .gte('to_date', today),
        
        supabase
          .from('fees_payments')
          .select('amount')
          .eq('school_id', schoolSettings.school_id)
          .eq('payment_date', today),
          
        supabase
          .from('complaint_box')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', schoolSettings.school_id)
          .eq('status', 'pending')
      ]);

      const feesSum = feesRes.data ? feesRes.data.reduce((sum, item) => sum + Number(item.amount || 0), 0) : 0;

      return {
        staff_on_leave: leavesRes.count?.toString() || "0",
        fees_collected: `₹${feesSum.toLocaleString()}`,
        pending_complaints: complaintsRes.count?.toString() || "0"
      };
    },
    enabled: !!schoolSettings?.school_id && !dismissed,
    refetchInterval: 60000 // 1 min
  });

  const handleDismiss = () => {
    localStorage.setItem(`dismissed_briefing_${today}`, 'true');
    setDismissed(true);
    if (forceShow) navigate(-1);
  };

  if (dismissed && !forceShow) return null;

  if (loading) {
    return (
      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-4 sm:p-5 mb-8 shadow-lg fade-in flex justify-center items-center min-h-[120px]">
        <Loader2 className="animate-spin text-indigo-400" size={24} />
      </div>
    );
  }

  return (
    <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-4 sm:p-5 mb-8 shadow-lg fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Target size={16} />
          </div>
          <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Executive Briefing</h3>
          <span className="ml-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-800/50 px-2 py-1 rounded-full hidden sm:inline-block">
            Today's Summary
          </span>
        </div>
        {!forceShow && (
          <button onClick={handleDismiss} className="text-indigo-400 hover:text-indigo-300 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2 opacity-70">
            <CalendarX size={14} className="text-rose-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Staff On Leave</span>
          </div>
          <div className="text-xl font-black text-slate-200">{briefing?.staff_on_leave || "0"}</div>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2 opacity-70">
            <DollarSign size={14} className="text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Fees Collected</span>
          </div>
          <div className="text-xl font-black text-slate-200">{briefing?.fees_collected || "₹0"}</div>
        </div>

        <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2 opacity-70">
            <Target size={14} className="text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Open Complaints</span>
          </div>
          <div className="text-xl font-black text-slate-200">{briefing?.pending_complaints || "0"}</div>
        </div>
      </div>
    </div>
  );
}
