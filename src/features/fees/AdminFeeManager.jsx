import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import { Loader2, IndianRupee, Calendar, ChevronLeft, CreditCard, History, CheckCircle, Bell, MessageCircle, Users, AlertTriangle, Phone } from 'lucide-react';

export default function AdminFeeManager() {
  const { schoolSettings } = useAppStore();
  const { isPending } = usePending();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  
  // Tab state
  const [activeTab, setActiveTab] = useState('manage'); // 'manage' | 'reminders'

  const [filterClass, setFilterClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);

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
        .select('id, name, class, username, contact')
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

  // Process data for the selected student specifically
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

  // â”€â”€ Smart Fee Reminder: compute defaulters list
  const defaultersList = useMemo(() => {
    if (!students || !feesData || !paymentsData) return [];
    return students.reduce((acc, student) => {
      const feeRecord = feesData.find(f => f.student_id === student.id);
      if (!feeRecord) return acc;
      const studentPayments = paymentsData.filter(p => p.fee_id === feeRecord.id);
      const totalPaid = studentPayments.reduce((s, p) => s + Number(p.amount), 0);
      const lastYearPending = Number(feeRecord.last_year_pending || 0);
      const currentYearFee = Number(feeRecord.total || 0);
      const dueAmount = (lastYearPending + currentYearFee) - totalPaid;
      if (dueAmount > 0) acc.push({ ...student, dueAmount, lastYearPending, currentYearFee, totalPaid });
      return acc;
    }, []);
  }, [students, feesData, paymentsData]);

  // â”€â”€ Reminder selection state
  const [selectedReminders, setSelectedReminders] = useState([]);

  const toggleReminder = (studentId) => {
    setSelectedReminders(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedReminders.length === defaultersList.length) {
      setSelectedReminders([]);
    } else {
      setSelectedReminders(defaultersList.map(s => s.id));
    }
  };

  const sendWhatsAppReminder = (student) => {
    const schoolName = schoolSettings?.name || 'Your School';
    const rawPhone = (student.contact || '').replace(/\D/g, '');
    const msg = `Hello, this is a reminder from *${schoolName}*.\n\nDear Parent of *${student.name}* (Class: ${student.class || 'N/A'}),\n\nWe would like to inform you that an outstanding fee balance of *â‚¹${student.dueAmount.toLocaleString()}* is due for the academic year ${currentYear}.\n\nKindly clear the dues at your earliest convenience to avoid any disruption. For queries, please contact the school office.\n\nThank you.`;
    if (!rawPhone) {
      alert(`No contact number saved for ${student.name}. Please update their profile first.`);
      return;
    }
    const phone = rawPhone.startsWith('91') ? rawPhone : '91' + rawPhone;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const sendBulkReminders = () => {
    const toRemind = defaultersList.filter(s => selectedReminders.includes(s.id));
    if (toRemind.length === 0) return;
    toRemind.forEach((student, i) => setTimeout(() => sendWhatsAppReminder(student), i * 900));
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

      {/* â”€â”€ Tab Navigation â”€â”€ */}
      <div style={{ display: 'flex', gap: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <button
          onClick={() => { setActiveTab('manage'); setSelectedStudent(null); }}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', transition: 'all 0.2s',
            background: activeTab === 'manage' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'manage' ? '#fff' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <IndianRupee size={15} /> Manage Fees
        </button>
        <button
          onClick={() => { setActiveTab('reminders'); setSelectedStudent(null); }}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', transition: 'all 0.2s',
            background: activeTab === 'reminders' ? '#25D366' : 'transparent',
            color: activeTab === 'reminders' ? '#fff' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <Bell size={15} /> Remind Defaulters
          {defaultersList.length > 0 && (
            <span style={{
              background: activeTab === 'reminders' ? 'rgba(255,255,255,0.3)' : '#ef4444',
              color: 'white', borderRadius: '999px', padding: '1px 7px', fontSize: '10px', fontWeight: 800
            }}>
              {defaultersList.length}
            </span>
          )}
        </button>
      </div>

      {/* â”€â”€ MANAGE FEES TAB â”€â”€ */}
      {activeTab === 'manage' && (
        <>
          {!selectedStudent ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6">Manage Fees</h2>
               
               <div className="mb-6">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">1. Select Class</label>
                  <select 
                    value={filterClass} 
                    onChange={e => setFilterClass(e.target.value)}
                    className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm text-slate-600 focus:outline-none focus:border-primary transition-colors cursor-pointer"
                  >
                    <option value="">-- Choose Class --</option>
                    {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
               </div>

               {filterClass && (
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">2. Select Student</label>
                   <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                     <div className="divide-y divide-slate-200/60 max-h-96 overflow-y-auto custom-scrollbar">
                       {students?.filter(s => s.class === filterClass).map(s => (
                          <div key={s.id} className="flex items-center justify-between p-4 hover:bg-slate-100 transition-colors">
                             <div>
                                <div className="font-bold text-slate-800">{s.name}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">@{s.username}</div>
                             </div>
                             <button 
                               onClick={() => handleManageFeesClick(s)}
                               className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm"
                             >
                                Manage Fees
                             </button>
                          </div>
                       ))}
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{activeStudentData.class} â€¢ @{activeStudentData.username}</span>
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
                              â‚¹{activeStudentData.dueAmount.toLocaleString()}
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
                                       + â‚¹{Number(p.amount).toLocaleString()}
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
        </>
      )}

      {/* â”€â”€ REMIND DEFAULTERS TAB â”€â”€ */}
      {activeTab === 'reminders' && (
        <div className="space-y-4 animate-in fade-in duration-300">

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', borderRadius: '20px', padding: '20px', color: 'white', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 900, lineHeight: 1 }}>{defaultersList.length}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.85, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fee Defaulters</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: '20px', padding: '20px', color: 'white', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 900, lineHeight: 1 }}>
                â‚¹{defaultersList.reduce((acc, s) => acc + s.dueAmount, 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.85, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
            </div>
          </div>

          {defaultersList.length === 0 ? (
            /* Empty State â€” all dues cleared */
            <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '24px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(16,185,129,0.3)' }}>
                <CheckCircle size={28} color="white" />
              </div>
              <h3 style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>All Clear! ðŸŽ‰</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                No outstanding dues found.<br />All student fees are fully paid up.
              </p>
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
              {/* List Header with Select All + Bulk Send */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--card-border)', background: 'var(--bg-main)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedReminders.length === defaultersList.length && defaultersList.length > 0}
                    onChange={toggleSelectAll}
                    style={{ width: '16px', height: '16px', accentColor: '#25D366', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {selectedReminders.length > 0 ? `${selectedReminders.length} selected` : 'Select All'}
                  </span>
                </label>
                <button
                  onClick={sendBulkReminders}
                  disabled={selectedReminders.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: selectedReminders.length > 0 ? '#25D366' : 'var(--input-bg)',
                    color: selectedReminders.length > 0 ? 'white' : 'var(--text-muted)',
                    border: 'none', borderRadius: '12px', padding: '8px 16px',
                    fontWeight: 700, fontSize: '12px', cursor: selectedReminders.length > 0 ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s', opacity: selectedReminders.length === 0 ? 0.5 : 1
                  }}
                >
                  <MessageCircle size={14} />
                  Send {selectedReminders.length > 0 ? `(${selectedReminders.length})` : ''} Reminders
                </button>
              </div>

              {/* Defaulters List */}
              <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                {defaultersList
                  .sort((a, b) => b.dueAmount - a.dueAmount) // Highest dues first
                  .map((student, idx) => (
                  <div
                    key={student.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 20px',
                      borderBottom: idx < defaultersList.length - 1 ? '1px solid var(--card-border)' : 'none',
                      background: selectedReminders.includes(student.id) ? 'rgba(37,211,102,0.05)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedReminders.includes(student.id)}
                      onChange={() => toggleReminder(student.id)}
                      style={{ width: '16px', height: '16px', accentColor: '#25D366', cursor: 'pointer', flexShrink: 0 }}
                    />

                    {/* Avatar */}
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '12px', flexShrink: 0,
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', fontWeight: 800, color: 'white'
                    }}>
                      {student.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>

                    {/* Student Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {student.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {student.class || 'N/A'}
                        </span>
                        {student.contact ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#25D366', fontWeight: 600 }}>
                            <Phone size={9} /> {student.contact}
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>âš  No contact</span>
                        )}
                      </div>
                    </div>

                    {/* Due Amount */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: '15px', color: '#ef4444' }}>
                        â‚¹{student.dueAmount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Due</div>
                    </div>

                    {/* Individual WhatsApp Button */}
                    <button
                      onClick={() => sendWhatsAppReminder(student)}
                      title={student.contact ? `WhatsApp ${student.name}` : 'No contact saved'}
                      style={{
                        flexShrink: 0, width: '36px', height: '36px', borderRadius: '10px', border: 'none',
                        background: student.contact ? '#25D366' : 'var(--input-bg)',
                        color: student.contact ? 'white' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      <MessageCircle size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tip card */}
          <div style={{ padding: '12px 16px', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: '14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <MessageCircle size={16} color="#25D366" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-main)' }}>Tip:</strong> WhatsApp reminders require the parent's contact number to be saved in their student profile. Students without a contact are marked with âš .
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
