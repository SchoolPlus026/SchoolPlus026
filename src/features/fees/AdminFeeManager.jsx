import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import { Loader2, IndianRupee, Calendar, ChevronLeft, CreditCard, History, CheckCircle, Send, Bell } from 'lucide-react';
import { ReminderConfiguratorModal } from './TeacherFeeReminder';

export default function AdminFeeManager() {
  const { schoolSettings } = useAppStore();
  const { isPending } = usePending();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [filterClass, setFilterClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  
  // Reminder state
  const [checkedStudents, setCheckedStudents] = useState([]);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [reminderSuccessCount, setReminderSuccessCount] = useState(null);

  // Fee state
  const [feeTotal, setFeeTotal] = useState('');
  const [feePending, setFeePending] = useState('');

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  // 1. Fetch Students
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-fees', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, class, username, email')
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
        .in('fee_id', feeIds)
        .order('created_at', { ascending: false });
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
      alert('Fees configuration saved!');
    }
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ fee_id, amount, method, payment_date }) => {
      const { error } = await supabase.from('fees_payments').insert({ school_id: schoolSettings.school_id, fee_id, amount, method, payment_date });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees_payments'] });
      setPaymentAmount('');
      alert('Payment recorded securely!');
    }
  });

  const isLoading = studentsLoading || feesLoading || paymentsLoading;

  // Process data for the selected student
  let activeStudentData = null;
  if (selectedStudent) {
    const feeRecord = feesData?.find(f => f.student_id === selectedStudent.id);
    const studentPayments = paymentsData?.filter(p => p.fee_id === feeRecord?.id) || [];
    const totalPaid = studentPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const lastYearPending = Number(feeRecord?.last_year_pending || 0);
    const currentYearFee = Number(feeRecord?.total || 0);
    const dueAmount = (lastYearPending + currentYearFee) - totalPaid;
    activeStudentData = { ...selectedStudent, feeRecordId: feeRecord?.id, lastYearPending, currentYearFee, totalPaid, dueAmount, studentPayments };
  }

  const handleManageFeesClick = (s) => {
    setSelectedStudent(s);
    const feeRecord = feesData?.find(f => f.student_id === s.id);
    setFeeTotal(feeRecord?.total || '');
    setFeePending(feeRecord?.last_year_pending || '');
  };

  // Build defaulters list for selected class (for the reminder modal)
  const classStudents = students?.filter(s => s.class === filterClass) || [];
  const classDefaulters = classStudents.reduce((acc, student) => {
    const feeRecord = feesData?.find(f => f.student_id === student.id);
    if (!feeRecord) return acc;
    const studentPayments = (paymentsData || []).filter(p => p.fee_id === feeRecord.id);
    const totalPaid = studentPayments.reduce((s, p) => s + Number(p.amount), 0);
    const dueAmount = (Number(feeRecord.last_year_pending || 0) + Number(feeRecord.total || 0)) - totalPaid;
    // fetch email for reminder
    if (dueAmount > 0) acc.push({ ...student, dueAmount });
    return acc;
  }, []);

  // When class changes, reset checked list
  const handleClassChange = (cls) => {
    setFilterClass(cls);
    setCheckedStudents([]);
    setSelectedStudent(null);
  };

  const toggleCheck = (id) =>
    setCheckedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const checkedDefaulters = classDefaulters.filter(s => checkedStudents.includes(s.id));

  const handleReminderSent = (count) => {
    setShowConfigurator(false);
    setCheckedStudents([]);
    setReminderSuccessCount(count);
    setTimeout(() => setReminderSuccessCount(null), 5000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <span className="font-bold text-xs text-slate-400 uppercase tracking-widest">Aggregating Ledgers...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">

      {!selectedStudent ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
           <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6">Manage Fees</h2>

           {/* ── Reminder Success Toast ── */}
           {reminderSuccessCount !== null && (
             <div style={{
               display: 'flex', alignItems: 'center', gap: '10px',
               background: 'linear-gradient(135deg, #10b981, #059669)',
               color: 'white', borderRadius: '16px', padding: '12px 18px', marginBottom: '20px',
             }}>
               <CheckCircle size={18} />
               <span style={{ fontWeight: 700, fontSize: '13px' }}>
                 ✅ Reminders sent to {reminderSuccessCount} student{reminderSuccessCount !== 1 ? 's' : ''}!
               </span>
             </div>
           )}

           <div className="mb-6">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">1. Select Class</label>
              <select
                value={filterClass}
                onChange={e => handleClassChange(e.target.value)}
                className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-600 focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                <option value="">-- Choose Class --</option>
                {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
           </div>

           {filterClass && (
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
               {/* ── Header row with Select All + Send Reminder ── */}
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                   <input
                     type="checkbox"
                     checked={classDefaulters.length > 0 && checkedStudents.length === classDefaulters.length}
                     onChange={() =>
                       setCheckedStudents(
                         checkedStudents.length === classDefaulters.length ? [] : classDefaulters.map(s => s.id)
                       )
                     }
                     style={{ width: '14px', height: '14px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                   />
                   Select All Defaulters
                   {classDefaulters.length > 0 && <span style={{ color: '#ef4444', fontWeight: 800 }}>({classDefaulters.length})</span>}
                 </label>

                 {checkedStudents.length > 0 && (
                   <button
                     onClick={() => setShowConfigurator(true)}
                     style={{
                       display: 'flex', alignItems: 'center', gap: '6px',
                       background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                       color: 'white', border: 'none', borderRadius: '12px',
                       padding: '8px 16px', fontSize: '12px', fontWeight: 800,
                       cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
                     }}
                   >
                     <Bell size={13} /> Send Reminder ({checkedStudents.length})
                   </button>
                 )}
               </div>

               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">2. Select Student to Manage Fees</label>
               <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                 <div className="divide-y divide-slate-200/60 max-h-96 overflow-y-auto custom-scrollbar">
                   {students?.filter(s => s.class === filterClass).map(s => {
                     const isDefaulter = classDefaulters.some(d => d.id === s.id);
                     return (
                       <div key={s.id} className="flex items-center justify-between p-4 hover:bg-slate-100 transition-colors" style={{ gap: '10px' }}>
                          {/* Checkbox — only for defaulters */}
                          <div style={{ width: '20px', flexShrink: 0 }}>
                            {isDefaulter && (
                              <input
                                type="checkbox"
                                checked={checkedStudents.includes(s.id)}
                                onChange={() => toggleCheck(s.id)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                              />
                            )}
                          </div>

                          <div style={{ flex: 1 }}>
                             <div className="font-bold text-slate-800">{s.name}</div>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">@{s.username}</span>
                               {isDefaulter && (
                                 <span style={{ fontSize: '9px', fontWeight: 800, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '1px 6px', textTransform: 'uppercase' }}>
                                   Due: ₹{classDefaulters.find(d => d.id === s.id)?.dueAmount?.toLocaleString()}
                                 </span>
                               )}
                             </div>
                          </div>
                          <button
                            onClick={() => handleManageFeesClick(s)}
                            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm"
                            style={{ flexShrink: 0 }}
                          >
                             Manage Fees
                          </button>
                       </div>
                     );
                   })}
                   {students?.filter(s => s.class === filterClass).length === 0 && (
                      <div className="p-8 text-center text-slate-500 font-medium text-sm">No students found in this class.</div>
                   )}
                 </div>
               </div>
             </div>
           )}
        </div>
      ) : activeStudentData && (
        <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
           {/* Header */}
           <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-4">
                 <button onClick={() => setSelectedStudent(null)} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">
                    <ChevronLeft size={20} />
                 </button>
                 <div>
                    <h2 className="text-xl font-black text-slate-800 leading-tight">{activeStudentData.name}'s Ledger</h2>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeStudentData.class} • @{activeStudentData.username}</span>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Set Fees Box */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
                 <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <IndianRupee size={16} /> Set Dues
                 </h3>
                 <div className="space-y-4">
                    <div>
                       <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Last Year Pending Dues</label>
                       <input
                         type="number"
                         value={feePending}
                         onChange={e => setFeePending(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 focus:border-primary focus:outline-none"
                       />
                    </div>
                    <div>
                       <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Current Year Dues</label>
                       <input
                         type="number"
                         value={feeTotal}
                         onChange={e => setFeeTotal(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 focus:border-primary focus:outline-none"
                       />
                    </div>
                    <button
                      onClick={() => {
                        if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                        updateFeeMutation.mutate({ student_id: selectedStudent.id, total: Number(feeTotal), last_year_pending: Number(feePending) });
                      }}
                      disabled={updateFeeMutation.isPending}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm py-3 rounded-xl transition-all flex justify-center items-center gap-2"
                    >
                      {updateFeeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Save Fees
                    </button>

                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                       <span className="text-xs font-bold text-slate-500 uppercase">Outstanding Balance</span>
                       <span className={`text-xl font-black ${activeStudentData.dueAmount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          ₹{activeStudentData.dueAmount.toLocaleString()}
                       </span>
                    </div>
                 </div>
              </div>

              {/* Add Payment Box */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
                 <h3 className="text-sm font-black text-emerald-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <CreditCard size={16} /> Add Payment
                 </h3>
                 <div className="space-y-4">
                    <div>
                       <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Received Amount</label>
                       <input
                         type="number"
                         value={paymentAmount}
                         onChange={e => setPaymentAmount(e.target.value)}
                         className="w-full bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 font-black text-emerald-700 text-xl focus:border-emerald-500 focus:outline-none"
                         placeholder="0.00"
                       />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Date</label>
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={e => setPaymentDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 focus:border-primary focus:outline-none"
                          />
                       </div>
                       <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Method</label>
                          <select
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-700 focus:border-primary focus:outline-none"
                          >
                             <option value="Cash">Cash</option>
                             <option value="Online">Online</option>
                             <option value="Cheque">Cheque</option>
                             <option value="UPI">UPI</option>
                          </select>
                       </div>
                    </div>
                    <button
                      onClick={() => {
                        if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                        recordPaymentMutation.mutate({ fee_id: activeStudentData.feeRecordId, amount: Number(paymentAmount), method: paymentMethod, payment_date: paymentDate });
                      }}
                      disabled={recordPaymentMutation.isPending || !paymentAmount || !activeStudentData.feeRecordId}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {recordPaymentMutation.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Record Payment'}
                    </button>
                 </div>
              </div>
           </div>

           {/* Payment History */}
           <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                 <History size={16} /> Payment History
              </h3>

              {activeStudentData.studentPayments.length === 0 ? (
                 <div className="text-center py-8 text-slate-400 text-sm font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No payments have been recorded for this ledger yet.
                 </div>
              ) : (
                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead>
                          <tr className="border-b border-slate-200">
                             <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-slate-400">Date</th>
                             <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-slate-400">Method</th>
                             <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-slate-400 text-right">Amount</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {activeStudentData.studentPayments.map(p => (
                             <tr key={p.id}>
                                <td className="px-4 py-3 text-sm font-bold text-slate-700">
                                   <div className="flex items-center gap-2">
                                      <Calendar size={14} className="text-slate-400" />
                                      {new Date(p.payment_date).toLocaleDateString()}
                                   </div>
                                </td>
                                <td className="px-4 py-3">
                                   <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                      {p.method}
                                   </span>
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-black text-emerald-600">
                                   + ₹{Number(p.amount).toLocaleString()}
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              )}
           </div>
        </div>
      )}
      {showConfigurator && (
        <ReminderConfiguratorModal
          students={checkedDefaulters}
          schoolSettings={schoolSettings}
          onClose={() => setShowConfigurator(false)}
          onSent={handleReminderSent}
        />
      )}
    </div>
  );
}
