import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Search, DollarSign, PlusCircle, CreditCard, X, Filter, User } from 'lucide-react';

export default function AdminFeeManager() {
  const { schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [feeUpdateModalOpen, setFeeUpdateModalOpen] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  const [feeTotal, setFeeTotal] = useState('');
  const [feePending, setFeePending] = useState('');

  // 1. Fetch Students
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-fees', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, class, username')
        .eq('role', 'student')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolSettings?.school_id
  });

  const uniqueClasses = schoolSettings?.classes || [];

  // 2. Fetch Fees master ledgers
  const { data: feesData, isLoading: feesLoading } = useQuery({
    queryKey: ['fees', currentYear, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fees')
        .select('*')
        .eq('year', currentYear);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolSettings?.school_id
  });

  // 3. Fetch all payments
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['fees_payments', currentYear, schoolSettings?.school_id],
    queryFn: async () => {
      if (!feesData || feesData.length === 0) return [];
      const feeIds = feesData.map(f => f.id);
      const { data, error } = await supabase
        .from('fees_payments')
        .select('*')
        .in('fee_id', feeIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!feesData && feesData.length > 0
  });

  const updateFeeMutation = useMutation({
    mutationFn: async ({ student_id, total, last_year_pending }) => {
      const existingFee = feesData.find(f => f.student_id === student_id);
      if (existingFee) {
        const { error } = await supabase.from('fees').update({ total, last_year_pending }).eq('id', existingFee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fees').insert({ school_id: schoolSettings.school_id, student_id, year: currentYear, total, last_year_pending });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees'] });
      setFeeUpdateModalOpen(false);
    }
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ fee_id, amount, method, payment_date, transaction_id }) => {
      const { error } = await supabase.from('fees_payments').insert({ school_id: schoolSettings.school_id, fee_id, amount, method, payment_date, transaction_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees_payments'] });
      setPaymentModalOpen(false);
      setPaymentAmount('');
    }
  });

  const isLoading = studentsLoading || feesLoading || paymentsLoading;

  const processedLedger = students?.map(student => {
    const feeRecord = feesData?.find(f => f.student_id === student.id);
    const studentPayments = paymentsData?.filter(p => p.fee_id === feeRecord?.id) || [];
    const totalPaid = studentPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const lastYearPending = Number(feeRecord?.last_year_pending || 0);
    const currentYearFee = Number(feeRecord?.total || 0);
    const dueAmount = (lastYearPending + currentYearFee) - totalPaid;
    return { ...student, feeRecordId: feeRecord?.id, lastYearPending, currentYearFee, totalPaid, dueAmount };
  }) || [];

  const filteredLedger = processedLedger.filter(s => {
    return (s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.username.toLowerCase().includes(searchTerm.toLowerCase())) &&
           (filterClass ? s.class === filterClass : true);
  });

  const openFeeModal = (student) => {
    setSelectedStudent(student);
    setFeeTotal(student.currentYearFee || '');
    setFeePending(student.lastYearPending || '');
    setFeeUpdateModalOpen(true);
  };

  const openPaymentModal = (student) => {
    if (!student.feeRecordId) return alert("Configure base fee first.");
    setSelectedStudent(student);
    setPaymentAmount(student.dueAmount);
    setPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">Fiscal Ledger</h2>
           <p className="text-slate-500 font-medium italic mt-1 text-sm">Revenue Tracking & Collections Panel</p>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner w-full md:w-auto">
          <div className="flex-1 md:w-40 relative group">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Filter size={14} /></div>
             <select 
              value={filterClass} 
              onChange={e => setFilterClass(e.target.value)}
              className="bg-transparent pl-8 pr-4 py-2 text-xs font-bold text-slate-600 focus:outline-none appearance-none w-full cursor-pointer"
             >
               <option value="">All Classes</option>
               {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
        </div>
      </div>

      <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search student identity..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-11 pr-4 py-4 bg-white border border-border rounded-[1.5rem] text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          />
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <span className="font-bold text-xs text-slate-400 uppercase tracking-widest">Aggregating Accounts...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-6 pb-6">
          {filteredLedger.map(student => (
            <div key={student.id} className="bg-white border border-border rounded-[2rem] p-6 shadow-xl shadow-slate-100/50 hover:shadow-primary/5 transition-all group relative overflow-hidden flex flex-col border-l-[6px] border-l-slate-100" style={{ borderLeftColor: student.dueAmount > 0 ? '#ef4444' : '#10b981' }}>
               <div className="flex justify-between items-start mb-6">
                 <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300">
                       <User size={24} />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{student.name}</h3>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100 mt-1 inline-block">@{student.username} • {student.class || 'No Deployment'}</span>
                    </div>
                 </div>
                 <button onClick={() => openFeeModal(student)} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-primary transition-colors">
                    <PlusCircle size={20} />
                 </button>
               </div>

               <div className="bg-slate-50 p-5 rounded-2xl grid grid-cols-2 gap-y-6 gap-x-4 mb-6 border border-slate-100">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block leading-none">Last Year</span>
                    <span className="text-sm font-black text-slate-600">${student.lastYearPending.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block leading-none">Current Cycle</span>
                    <span className="text-sm font-black text-slate-600">${student.currentYearFee.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1 block leading-none">Recovered</span>
                    <span className="text-sm font-black text-emerald-600">${student.totalPaid.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-red-400 uppercase tracking-[0.2em] mb-1 block leading-none">Outstanding</span>
                    <span className={`text-xl font-black ${student.dueAmount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      ${student.dueAmount.toLocaleString()}
                    </span>
                  </div>
               </div>

               <button 
                onClick={() => openPaymentModal(student)}
                disabled={student.dueAmount <= 0}
                className="w-full mt-auto flex items-center justify-center gap-2 py-4 bg-primary hover:bg-primary-dark text-white rounded-[1.25rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/20 disabled:opacity-20 active:scale-[0.98]"
               >
                  <DollarSign size={16} /> Accept Payment
               </button>
            </div>
          ))}
        </div>
      )}

      {/* Modals - Simplified logic for brevity in this reconstruction */}
      {feeUpdateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white border border-border rounded-[2.5rem] w-full max-w-md shadow-2xl p-8 animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-8">Setup Ledger</h3>
              <form onSubmit={e => { e.preventDefault(); updateFeeMutation.mutate({ student_id: selectedStudent.id, total: Number(feeTotal), last_year_pending: Number(feePending) }); }} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Current Total</label>
                  <input type="number" required value={feeTotal} onChange={e => setFeeTotal(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 font-black text-lg focus:outline-none focus:ring-2 focus:ring-primary shadow-inner" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Pending Arrears</label>
                  <input type="number" required value={feePending} onChange={e => setFeePending(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 font-black text-lg focus:outline-none focus:ring-2 focus:ring-primary shadow-inner" />
                </div>
                <div className="flex gap-3 pt-2">
                   <button type="button" onClick={() => setFeeUpdateModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Cancel</button>
                   <button className="flex-[2] py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Apply Bounds</button>
                </div>
              </form>
           </div>
        </div>
      )}

      {paymentModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white border border-border rounded-[2.5rem] w-full max-w-md shadow-2xl p-8 animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-emerald-600 uppercase tracking-tight mb-8">Process Payment</h3>
              <form onSubmit={e => { e.preventDefault(); recordPaymentMutation.mutate({ fee_id: selectedStudent.feeRecordId, amount: Number(paymentAmount), method: paymentMethod, payment_date: paymentDate, transaction_id: transactionId }); }} className="space-y-6">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center">
                   <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Incoming Transaction</span>
                   <input type="number" required max={selectedStudent?.dueAmount} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="bg-transparent text-center text-4xl font-black text-emerald-700 w-full focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <select required value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="bg-slate-50 border border-border rounded-xl px-4 py-3 text-xs font-bold text-slate-600 focus:outline-none">
                      <option value="Cash">Cash</option>
                      <option value="Online">Online</option>
                      <option value="UPI">UPI</option>
                   </select>
                   <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="bg-slate-50 border border-border rounded-xl px-4 py-3 text-xs font-bold text-slate-600 focus:outline-none" />
                </div>
                <div className="flex gap-3 pt-2">
                   <button type="button" onClick={() => setPaymentModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Abort</button>
                   <button className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-200">Commit Record</button>
                </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
