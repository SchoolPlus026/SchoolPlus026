import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { Loader2, Plus, Globe, Users, CreditCard, Key, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';

export default function SuperAdminDashboard() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);

  // 1. Fetch All Schools (Universal)
  const { data: schools, isLoading } = useQuery({
    queryKey: ['super-admin-schools'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // 2. Toggle Subscription Status
  const subMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('school_settings')
        .update({ subscription_status: status })
        .eq('school_id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-schools'] });
    }
  });

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
        <span className="font-bold tracking-widest uppercase text-xs">Synchronizing Grid Data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500"><Globe size={24} /></div>
            <span className="font-bold text-slate-400 text-sm uppercase tracking-wider">Total Tenants</span>
          </div>
          <div className="text-4xl font-black text-white">{schools?.length || 0}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500"><Users size={24} /></div>
            <span className="font-bold text-slate-400 text-sm uppercase tracking-wider">Active Instances</span>
          </div>
          <div className="text-4xl font-black text-white">{schools?.filter(s => s.subscription_status === 'Paid').length || 0}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500"><AlertTriangle size={24} /></div>
            <span className="font-bold text-slate-400 text-sm uppercase tracking-wider">Pending Renewal</span>
          </div>
          <div className="text-4xl font-black text-white">{schools?.filter(s => s.subscription_status === 'Expired').length || 0}</div>
        </div>
      </div>

      {/* Main Tenant Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-black text-white tracking-tight uppercase">Infrastructure Registry</h2>
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20">
            <Plus size={16} /> Deploy New Instance
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">School / Workspace</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Protocol Code</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {schools?.map((school) => (
                <tr key={school.school_id} className="hover:bg-slate-700/30 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-700 rounded-lg overflow-hidden border border-slate-600 flex items-center justify-center p-1">
                        {school.logo_url ? <img src={school.logo_url} className="w-full h-full object-contain" /> : <Globe size={20} className="text-slate-500" />}
                      </div>
                      <div>
                        <div className="font-bold text-slate-200">{school.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono tracking-tighter truncate w-32">{school.school_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                      school.subscription_status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      school.subscription_status === 'Trial' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {school.subscription_status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className="flex items-center justify-center gap-2">
                       <span className="font-mono text-emerald-500 font-black bg-slate-950 px-2 py-1 rounded border border-slate-700 text-sm tracking-widest">
                         {school.school_code || '---'}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                      <select 
                        value={school.subscription_status}
                        onChange={(e) => subMutation.mutate({ id: school.school_id, status: e.target.value })}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-300 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Trial">Set Trial</option>
                        <option value="Paid">Set Paid</option>
                        <option value="Expired">Set Expired</option>
                      </select>
                      <button className="p-2 text-slate-500 hover:text-white hover:bg-slate-600 rounded-lg transition-all" title="Remote Access">
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Warning */}
      <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl flex items-start gap-4">
        <ShieldAlert className="text-red-500 flex-shrink-0" size={24} />
        <div>
          <h3 className="font-black text-red-400 uppercase text-xs tracking-widest mb-1">Administrative Lockdown</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            As a Super Admin, you are operating on the master multi-tenant recordset. Protocol changes here affect every production instance. Database snapshots are recommended before batch updates.
          </p>
        </div>
      </div>
    </div>
  );
}
