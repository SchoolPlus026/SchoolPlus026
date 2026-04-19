import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { CalendarHeart, Loader2, Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function LeavesManager() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('apply'); // 'apply' or 'history/manage'

  // Form states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  const { data: leaves, isLoading } = useQuery({
    queryKey: ['leaves', role, user?.id, schoolSettings?.school_id],
    queryFn: async () => {
      if (role !== 'admin') {
        const { data, error } = await supabase
          .from('leaves')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('leaves')
          .select('*, users!leaves_user_id_fkey(name, role)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      }
    },
    enabled: !!user?.id && !!schoolSettings?.school_id
  });

  const applyMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('leaves').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setFromDate('');
      setToDate('');
      setReason('');
      setActiveTab('history');
      alert('Leave application submitted successfully!');
    }
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('leaves')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    }
  });

  const handleApply = (e) => {
    e.preventDefault();
    applyMutation.mutate({
      school_id: schoolSettings.school_id,
      user_id: user.id,
      role: role,
      from_date: fromDate,
      to_date: toDate,
      reason: reason,
      status: 'pending'
    });
  };

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-border bg-slate-50">
        <button 
          onClick={() => setActiveTab('apply')}
          className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'apply' ? 'text-primary border-b-2 border-primary bg-white' : 'text-muted hover:text-text'}`}
        >
          {role === 'admin' ? 'Configure Policy' : 'Apply for Leave'}
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'history' ? 'text-primary border-b-2 border-primary bg-white' : 'text-muted hover:text-text'}`}
        >
          {role === 'admin' ? 'Manage Applications' : 'My Applications'}
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'apply' && role !== 'admin' && (
          <form onSubmit={handleApply} className="space-y-6 max-w-xl animate-in fade-in slide-in-from-top-4">
            <h3 className="text-xl font-bold text-text flex items-center gap-2">
              <CalendarHeart className="text-rose-500" size={24} /> New Leave Request
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">From Date</label>
                <input required type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">To Date</label>
                <input required type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Reason for Absence</label>
              <textarea 
                required 
                rows="4" 
                value={reason} 
                onChange={e => setReason(e.target.value)} 
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm"
                placeholder="Briefly explain your reason..."
              ></textarea>
            </div>
            <button 
              type="submit" 
              disabled={applyMutation.isPending}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              {applyMutation.isPending ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
              Submit Application
            </button>
          </form>
        )}

        {activeTab === 'apply' && role === 'admin' && (
          <div className="text-center py-12 text-muted border-2 border-dashed border-border rounded-xl">
            Admin leave configuration policies coming soon.
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-bold text-text mb-6 flex items-center gap-2">
              <Clock className="text-primary" size={24} /> Leave Registry
            </h3>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : !leaves || leaves.length === 0 ? (
              <div className="text-center py-12 text-muted border-2 border-dashed border-border rounded-xl">No leave applications found.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {leaves.map(leave => (
                  <div key={leave.id} className="bg-slate-50 border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          leave.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                          'bg-red-100 text-red-700 border border-red-200'
                        }`}>
                          {leave.status}
                        </span>
                        <span className="text-xs font-bold text-muted uppercase tracking-widest">
                          {new Date(leave.from_date).toLocaleDateString()} - {new Date(leave.to_date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="font-bold text-slate-800">{leave.reason}</p>
                      {role === 'admin' && <p className="text-xs text-muted mt-1 font-semibold">Applied by: {leave.users?.name} ({leave.users?.role})</p>}
                    </div>

                    {role === 'admin' && leave.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => statusMutation.mutate({ id: leave.id, status: 'Approved' })}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm"
                        >
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button 
                          onClick={() => statusMutation.mutate({ id: leave.id, status: 'Rejected' })}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 shadow-sm"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
