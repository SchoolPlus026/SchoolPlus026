import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, DollarSign, Wallet, FileText, CheckCircle2 } from 'lucide-react';

export default function StudentFeeLedger() {
  const { user, schoolSettings } = useAppStore();
  const currentYear = new Date().getFullYear();

  const { data: myFee, isLoading: feeLoading } = useQuery({
    queryKey: ['my-fee', currentYear, user?.id, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fees')
        .select('*')
        .eq('student_id', user.id)
        .eq('year', currentYear)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; 
      return data || null;
    },
    enabled: !!user?.id && !!schoolSettings?.school_id
  });

  const { data: myPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['my-payments', myFee?.id, schoolSettings?.school_id],
    queryFn: async () => {
      if (!myFee) return [];
      const { data, error } = await supabase
        .from('fees_payments')
        .select('*')
        .eq('fee_id', myFee.id)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!myFee?.id
  });

  const isLoading = feeLoading || (myFee && paymentsLoading);

  if (isLoading) {
    return (
      <div className="bg-surface border border-glass rounded-2xl p-6 h-64 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!myFee) {
    return (
      <div className="bg-surface border border-glass rounded-2xl p-12 text-center shadow-xl">
        <div className="w-16 h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
           <Wallet size={32} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2 tracking-tight">No Financial Record Active</h2>
        <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">Your school fee structure for the {currentYear} academic cycle has not been officially mapped yet by the administrators. No payments are currently expected.</p>
      </div>
    );
  }

  const totalPaid = myPayments?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const lastYearPending = Number(myFee.last_year_pending || 0);
  const currentYearFee = Number(myFee.total || 0);
  const aggregateTotal = lastYearPending + currentYearFee;
  const dueAmount = aggregateTotal - totalPaid;

  const fullyPaid = dueAmount <= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2 px-2">
         <Wallet className="text-primary" size={24} />
         <h2 className="text-2xl font-bold text-white tracking-tight">My Financial Ledger</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Total Evaluated Fee */}
         <div className="bg-surface border border-glass rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <FileText size={80} className="transform translate-x-4 -translate-y-4" />
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total Assessed Fee</div>
            <div className="text-4xl font-extrabold text-white tracking-tight">${aggregateTotal.toLocaleString()}</div>
            {lastYearPending > 0 && (
               <div className="text-[11px] text-amber-500 mt-3 font-semibold bg-amber-500/10 px-3 py-1 rounded-md border border-amber-500/20 inline-block uppercase tracking-wider">
                 Includes ${lastYearPending} Historical Arrears
               </div>
            )}
         </div>

         {/* Total Paid */}
         <div className="bg-surface border border-glass rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-500 group-hover:opacity-20 transition-opacity">
               <DollarSign size={80} className="transform translate-x-4 -translate-y-4" />
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total Paid</div>
            <div className="text-4xl font-extrabold text-emerald-400 tracking-tight">${totalPaid.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-400/80 mt-3 font-semibold uppercase tracking-wider">Verified Across {myPayments?.length || 0} Transactions</div>
         </div>

         {/* Amount Due Component */}
         <div className={`bg-gradient-to-br ${fullyPaid ? 'from-[#064e3b]/80 to-[#022c22]/90 border-emerald-500/30' : 'from-[#7f1d1d]/80 to-[#450a0a]/90 border-red-500/40'} border rounded-2xl p-6 shadow-xl relative overflow-hidden`}>
            {fullyPaid && <div className="absolute top-0 right-0 p-4 text-emerald-400 opacity-20"><CheckCircle2 size={80} className="transform translate-x-2 -translate-y-2" /></div>}
            <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${fullyPaid ? 'text-emerald-400' : 'text-red-400'}`}>Amount Due</div>
            <div className="text-4xl font-extrabold text-white tracking-tight">${dueAmount > 0 ? dueAmount.toLocaleString() : '0'}</div>
            {fullyPaid && (
              <div className="text-[11px] text-emerald-300 mt-3 font-bold uppercase tracking-wider flex items-center gap-1.5">
                 <CheckCircle2 size={12}/> Clear Status
              </div>
            )}
            {!fullyPaid && (
              <div className="text-[11px] text-red-300 mt-3 font-bold uppercase tracking-wider">
                 Immediate clearance requested
              </div>
            )}
         </div>
      </div>

      {/* Transaction Ledger Table */}
      <div className="bg-surface border border-glass rounded-2xl p-6 shadow-xl mt-8">
         <h3 className="text-lg font-bold text-white mb-6 border-b border-glass pb-4 flex items-center gap-2">
            <FileText size={18} className="text-slate-400" /> Official Receipts Log
         </h3>
         
         {myPayments?.length === 0 ? (
           <div className="text-center py-12 border-2 border-dashed border-glass rounded-xl text-slate-500 text-sm">
              Your transaction log is completely empty.
           </div>
         ) : (
           <div className="overflow-x-auto rounded-xl">
             <table className="w-full text-left border-collapse min-w-[600px]">
               <thead>
                 <tr className="bg-[#0a1128] border-b border-glass text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                   <th className="p-4 rounded-tl-xl">Payment Date</th>
                   <th className="p-4">Amount Processed</th>
                   <th className="p-4">Payment Method</th>
                   <th className="p-4 rounded-tr-xl border-l border-glass">Txn ID / Ref Trace</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-glass text-sm">
                 {myPayments.map(payment => (
                   <tr key={payment.id} className="hover:bg-glass/30 transition-colors">
                     <td className="p-4 text-slate-300 font-medium">
                        {new Date(payment.payment_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                     </td>
                     <td className="p-4 font-bold text-white flex items-center gap-1">
                        <span className="text-emerald-400">+</span>${Number(payment.amount).toLocaleString()}
                     </td>
                     <td className="p-4">
                        <span className="px-2.5 py-1 bg-primary/10 rounded-md text-[11px] font-bold uppercase tracking-wider border border-primary/20 text-primary">
                           {payment.method}
                        </span>
                     </td>
                     <td className="p-4 text-slate-500 font-mono text-xs border-l border-glass tracking-wider">
                        {payment.transaction_id || <span className="text-slate-600 italic">None Recorded</span>}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         )}
      </div>
    </div>
  );
}
