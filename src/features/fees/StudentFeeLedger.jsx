import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { CreditCard, History, AlertCircle, CheckCircle2, User, Wallet } from 'lucide-react';

export default function StudentFeeLedger() {
  const { user, schoolSettings } = useAppStore();
  const currentYear = new Date().getFullYear();

  // 1. Fetch Student's Fee Ledger
  const { data: feeEntry, isLoading: feeLoading } = useQuery({
    queryKey: ['my-fees', user.id, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fees')
        .select('id, tot:total, lyp:last_year_pending, sid:student_id, yr:year')
        .eq('student_id', user.id)
        .eq('year', currentYear)
        .maybeSingle();
      if (error) throw error;
      return data ? {
        id: data.id,
        total: Number(data.tot || 0),
        last_year_pending: Number(data.lyp || 0),
        student_id: data.sid,
        year: data.yr
      } : null;
    },
    enabled: !!user?.id
  });

  // 2. Fetch Payment History
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['my-payments', feeEntry?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fees_payments')
        .select('id, amt:amount, dt:payment_date, meth:method')
        .eq('fee_id', feeEntry.id)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return (data || []).map(p => ({
        id: p.id,
        amount: Number(p.amt || 0),
        payment_date: p.dt,
        method: p.meth
      }));
    },
    enabled: !!feeEntry?.id
  });

  const totalPaid = payments?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const lastYearPending = Number(feeEntry?.last_year_pending || 0);
  const currentYearTotal = Number(feeEntry?.total || 0);
  const netDue = (lastYearPending + currentYearTotal) - totalPaid;

  if (feeLoading || paymentsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span className="font-black text-xs text-slate-400 uppercase tracking-widest">Accessing Vault...</span>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-200">
           <Wallet size={28} />
        </div>
        <div className="flex-1">
           <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Financial Profile</h2>
           <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Institutional Ledger Transcript</p>
        </div>
        {!feeLoading && feeEntry && (
           <div className="text-right">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Outstanding Balance</span>
              <span className={`text-2xl font-black ${netDue > 0 ? 'text-red-500' : 'text-emerald-500'}`}>₹{netDue.toLocaleString()}</span>
           </div>
        )}
      </div>

      {!feeEntry ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-16 text-center">
           <AlertCircle size={48} className="text-slate-300 mx-auto mb-4" />
           <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No Active Ledger Found</p>
           <p className="text-slate-400 text-xs mt-2 italic">Please contact the administration office to initialize your payment schedule.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Account Summary */}
          <div className="lg:col-span-2 space-y-8">
             <div className="bg-white dark:bg-slate-800 border-b-8 border-indigo-600 border border-border dark:border-slate-700 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden">
                {/* Stylized background circle */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-50 rounded-full opacity-50"></div>
                
                <div className="relative z-10">
                   <div className="flex justify-between items-center mb-10">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Account Statement • {currentYear} Cyc</span>
                      {netDue <= 0 ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                           <CheckCircle2 size={14} /> Fully Settled
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                           <History size={14} /> Settlement Pending
                        </div>
                      )}
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-2 gap-y-12 gap-x-8">
                       <div>
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Institutional Fees</span>
                         <span className="text-3xl font-black text-slate-800">₹{currentYearTotal.toLocaleString()}</span>
                      </div>
                      <div>
                         <span className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1 block">Previous Arrears</span>
                         <span className="text-3xl font-black text-red-500">₹{lastYearPending.toLocaleString()}</span>
                      </div>
                      <div>
                         <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 block">Credits Applied</span>
                         <span className="text-3xl font-black text-emerald-600">₹{totalPaid.toLocaleString()}</span>
                      </div>
                      <div className="bg-slate-900 rounded-[2rem] p-6 -m-2 shadow-2xl relative">
                         <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1 block">Net Balance Due</span>
                         <span className="text-4xl font-black text-white">₹{netDue.toLocaleString()}</span>
                         <div className="absolute right-6 bottom-6 text-indigo-500/20"><CreditCard size={40} /></div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Payment Timeline */}
             <div className="bg-white dark:bg-slate-800 border border-border dark:border-slate-700 rounded-[2.5rem] shadow-xl shadow-slate-100/50 overflow-hidden">
                <div className="p-8 border-b border-border flex items-center justify-between">
                   <h3 className="font-black text-slate-700 uppercase tracking-widest text-sm">Transaction Logs</h3>
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{payments?.length || 0} Entries</span>
                </div>
                {payments?.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest italic leading-relaxed">No financial transactions detected in the current cycle archive.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {payments.map((p, idx) => (
                      <div key={p.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-black text-xs">
                             #{payments.length - idx}
                          </div>
                          <div>
                            <div className="text-sm font-black text-slate-800 uppercase tracking-tight">₹{Number(p.amount).toLocaleString()}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{new Date(p.payment_date).toLocaleDateString(undefined, { dateStyle: 'long' })} • {p.method}</div>
                          </div>
                        </div>
                        <div className="text-[10px] items-end flex flex-col gap-1">
                           <span className="font-bold text-slate-400 uppercase">TX TYPE</span>
                           <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-widest">Credit</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>

          {/* Policy / Support */}
          <div className="space-y-6">
             <div className="bg-indigo-900 border border-indigo-800 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><CheckCircle2 size={100} /></div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4">Payment Policy</h3>
                <p className="text-xs text-indigo-200 leading-loose italic">
                  Institutional fees are non-refundable. Please ensure all outstanding balances are cleared before examination cycles to avoid automated portal lockdown.
                </p>
              </div>

             <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 flex items-start gap-4">
                <div className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400"><User size={20} /></div>
                <div>
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Billing Support</h4>
                   <p className="text-xs font-bold text-slate-600">billing@school.infra</p>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
