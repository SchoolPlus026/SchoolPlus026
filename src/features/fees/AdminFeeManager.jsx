import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Search, DollarSign, PlusCircle, CreditCard, X } from 'lucide-react';

export default function AdminFeeManager() {
  const { schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [feeUpdateModalOpen, setFeeUpdateModalOpen] = useState(false);

  // Form states
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

  // 3. Fetch all payments for this year
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
        const { error } = await supabase
          .from('fees')
          .update({ total, last_year_pending })
          .eq('id', existingFee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('fees')
          .insert({
            school_id: schoolSettings.school_id,
            student_id,
            year: currentYear,
            total,
            last_year_pending
          });
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
      const { error } = await supabase
        .from('fees_payments')
        .insert({
          school_id: schoolSettings.school_id,
          fee_id,
          amount,
          method,
          payment_date,
          transaction_id
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees_payments'] });
      setPaymentModalOpen(false);
      setPaymentAmount('');
      setTransactionId('');
    }
  });

  const isLoading = studentsLoading || feesLoading || paymentsLoading;

  // Process data locally
  const processedLedger = students?.map(student => {
    const feeRecord = feesData?.find(f => f.student_id === student.id);
    const studentPayments = paymentsData?.filter(p => p.fee_id === feeRecord?.id) || [];
    
    const totalPaid = studentPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const lastYearPending = Number(feeRecord?.last_year_pending || 0);
    const currentYearFee = Number(feeRecord?.total || 0);
    
    // Core Engine Calculation
    const dueAmount = (lastYearPending + currentYearFee) - totalPaid;

    return {
      ...student,
      feeRecordId: feeRecord?.id,
      lastYearPending,
      currentYearFee,
      totalPaid,
      dueAmount,
      payments: studentPayments
    };
  }) || [];

  const filteredLedger = processedLedger.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.username && s.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openFeeModal = (student) => {
    setSelectedStudent(student);
    setFeeTotal(student.currentYearFee || '');
    setFeePending(student.lastYearPending || '');
    setFeeUpdateModalOpen(true);
  };

  const openPaymentModal = (student) => {
    if (!student.feeRecordId) {
      alert("Please configure the student's base fee ledger structure first.");
      return;
    }
    if (student.dueAmount <= 0) {
      alert("This student has fully cleared their balance.");
      return;
    }
    setSelectedStudent(student);
    setPaymentAmount(student.dueAmount);
    setPaymentModalOpen(true);
  };

  const handleUpdateFee = (e) => {
    e.preventDefault();
    updateFeeMutation.mutate({
      student_id: selectedStudent.id,
      total: Number(feeTotal),
      last_year_pending: Number(feePending)
    });
  };

  const handleRecordPayment = (e) => {
    e.preventDefault();
    recordPaymentMutation.mutate({
      fee_id: selectedStudent.feeRecordId,
      amount: Number(paymentAmount),
      method: paymentMethod,
      payment_date: paymentDate,
      transaction_id: transactionId
    });
  };

  return (
    <div className="bg-surface border border-glass rounded-2xl p-6 shadow-xl relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Fee Management Engine</h2>
          <p className="text-sm text-slate-400 mt-1">Configure ledgers and securely track parent payments dynamically.</p>
        </div>
        <div className="relative w-full sm:w-auto">
           <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
           <input 
             type="text" 
             placeholder="Search student..." 
             className="pl-10 pr-4 py-2.5 bg-[#0a1128] border border-glass rounded-xl text-white focus:outline-none focus:border-primary transition-all w-full sm:w-72"
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-glass">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[#0a1128] border-b border-glass text-xs uppercase tracking-wider font-semibold text-slate-400">
                  <th className="p-4">Student Identity</th>
                  <th className="p-4">Fee Profile</th>
                  <th className="p-4">Total Paid</th>
                  <th className="p-4">Amount Due</th>
                  <th className="p-4 text-center">Engine Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass text-sm text-slate-300">
                {filteredLedger.map(student => (
                  <tr key={student.id} className="hover:bg-glass/50 transition-colors group">
                    <td className="p-4">
                      <div className="font-semibold text-white group-hover:text-primary transition-colors">{student.name}</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">{student.class || 'Unassigned'} | {student.username}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">Base: ${student.currentYearFee.toLocaleString()}</span>
                        {student.lastYearPending > 0 && <span className="text-xs w-max text-red-400 bg-red-400/10 px-2 py-0.5 rounded-md border border-red-400/20">+${student.lastYearPending.toLocaleString()} Arrears</span>}
                        {student.currentYearFee === 0 && <span className="text-xs text-amber-500/70 italic">Unconfigured</span>}
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-emerald-400">
                      ${student.totalPaid.toLocaleString()}
                    </td>
                    <td className="p-4">
                       <span className={`font-bold text-lg ${student.dueAmount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                         ${student.dueAmount.toLocaleString()}
                       </span>
                    </td>
                    <td className="p-4">
                       <div className="flex items-center justify-center gap-3">
                         <button onClick={() => openFeeModal(student)} className="p-2 bg-glass hover:bg-glass/80 text-slate-300 rounded-lg transition-colors group-hover:text-white" title="Configure Ledger">
                            <DollarSign size={16} />
                         </button>
                         <button onClick={() => openPaymentModal(student)} className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors font-medium text-xs flex items-center gap-1 shadow-lg shadow-primary/20" title="Accept Payment">
                            <PlusCircle size={14} /> Pay
                         </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
           </table>
           {filteredLedger.length === 0 && (
             <div className="p-8 text-center text-slate-400 border-t border-glass">No students found matching your search.</div>
           )}
        </div>
      )}

      {/* --- modals below --- */}
      {/* Fee Update Modal */}
      {feeUpdateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-glass rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
             <div className="p-5 border-b border-glass flex justify-between items-center bg-[#0a1128]">
                <h3 className="font-bold text-lg text-white">Configure Ledger Data</h3>
                <button onClick={() => setFeeUpdateModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
             </div>
             <form onSubmit={handleUpdateFee} className="p-6 space-y-5">
                <div className="bg-black/20 p-3 rounded-lg border border-glass flex justify-between text-sm">
                   <span className="text-slate-400">Account:</span><span className="text-white font-medium">{selectedStudent?.name}</span>
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Year Base Fee ($)</label>
                   <input type="number" required value={feeTotal} onChange={e => setFeeTotal(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary font-mono text-lg" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-300 mb-1.5">Previous Pending Arrears ($)</label>
                   <input type="number" required value={feePending} onChange={e => setFeePending(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary font-mono text-lg" />
                </div>
                <button disabled={updateFeeMutation.isPending} className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 mt-2">
                   {updateFeeMutation.isPending ? 'Saving...' : 'Lock Initial Parameters'}
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-glass rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
             <div className="p-5 border-b border-glass flex justify-between items-center bg-[#0a1128]">
                <h3 className="font-bold text-lg text-emerald-400 flex items-center gap-2"><CreditCard size={20} /> Record Payment</h3>
                <button onClick={() => setPaymentModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
             </div>
             <form onSubmit={handleRecordPayment} className="p-6 space-y-5">
                <div className="bg-black/20 p-3 rounded-lg border border-glass flex justify-between text-sm">
                   <span className="text-slate-400">Target Student:</span><span className="text-white font-medium">{selectedStudent?.name}</span>
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-300 mb-1.5">Payment Amount Received ($)</label>
                   <input type="number" required max={selectedStudent?.dueAmount} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-bold text-xl text-emerald-400" />
                   <p className="text-xs text-slate-500 mt-2">Maximum allowed to clear balance: ${selectedStudent?.dueAmount}</p>
                </div>
                <div className="flex gap-4">
                   <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Collection Date</label>
                      <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary text-sm" />
                   </div>
                   <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Method</label>
                      <select required value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary text-sm appearance-none cursor-pointer">
                         <option value="Cash">Cash</option>
                         <option value="Online">Online</option>
                         <option value="UPI">UPI</option>
                         <option value="Cheque">Cheque</option>
                      </select>
                   </div>
                </div>
                {(paymentMethod === 'Online' || paymentMethod === 'UPI' || paymentMethod === 'Cheque') && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Txn ID / UTR / Cheque No.</label>
                    <input type="text" value={transactionId} onChange={e => setTransactionId(e.target.value)} required className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary text-sm font-mono" />
                  </div>
                )}
                <button disabled={recordPaymentMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20 mt-2">
                   {recordPaymentMutation.isPending ? 'Validating Ledger...' : 'Commit Payment to Ledger'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
