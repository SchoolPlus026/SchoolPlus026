import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { Building2, Settings2, LifeBuoy, CreditCard, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';

export default function AppManagerDashboard() {
  const [activeTab, setActiveTab] = useState('tenants');

  // Fetch all schools
  const { data: schools, isLoading: schoolsLoading, refetch: refetchSchools } = useQuery({
    queryKey: ['all-schools'],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_settings').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch all tickets
  const { data: tickets, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('support_tickets').select(`*, school:school_settings(name)`).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch App Config
  const { data: config, refetch: refetchConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_config').select('*');
      if (error) throw error;
      return data;
    }
  });

  const aboutText = config?.find(c => c.key_name === 'about_text')?.value_content || '';
  const [editingAbout, setEditingAbout] = useState(false);
  const [newAbout, setNewAbout] = useState('');

  useEffect(() => {
    if (aboutText) setNewAbout(aboutText);
  }, [aboutText]);

  const saveConfig = async () => {
    await supabase.from('app_config').update({ value_content: newAbout }).eq('key_name', 'about_text');
    setEditingAbout(false);
    refetchConfig();
  };

  const TABS = [
    { id: 'tenants', label: 'Tenants & Schools', icon: Building2 },
    { id: 'support', label: 'Support Tickets', icon: LifeBuoy },
    { id: 'billing', label: 'SaaS Billing', icon: CreditCard },
    { id: 'config', label: 'Global Setup', icon: Settings2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex bg-slate-800 p-1.5 rounded-2xl w-full lg:w-fit border border-slate-700 shadow-xl overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 lg:flex-none px-6 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            <t.icon size={16} /> <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'tenants' && (
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-xl font-black text-white mb-6">Tenant Organizations</h2>
          {schoolsLoading ? <p className="text-slate-400">Loading schools...</p> : (
             <div className="grid grid-cols-1 gap-4">
                {schools?.map(school => (
                   <div key={school.school_id} className="bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                         <h3 className="text-lg font-bold text-slate-100">{school.name}</h3>
                         <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] uppercase tracking-widest font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-md border border-indigo-500/30">ID: {school.school_code || 'MISSING'}</span>
                            <span className={`text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md border ${school.subscription_status === 'Paid' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>{school.subscription_status || 'Trial'}</span>
                         </div>
                      </div>
                      <button className="flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 px-4 py-2 rounded-xl transition-colors">
                        Manage Modules <ChevronRight size={14} />
                      </button>
                   </div>
                ))}
             </div>
          )}
        </div>
      )}

      {activeTab === 'support' && (
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-xl font-black text-white mb-6">Support Desk</h2>
          {ticketsLoading ? <p className="text-slate-400">Loading tickets...</p> : tickets?.length === 0 ? (
            <p className="text-slate-500 italic">No support tickets found.</p>
          ) : (
             <div className="space-y-4">
               {tickets?.map(t => (
                  <div key={t.id} className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-xs font-bold text-indigo-400 tracking-wider uppercase">{t.school?.name}</span>
                       <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${t.status === 'Open' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'}`}>{t.status}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white">{t.subject}</h4>
                    <p className="text-xs text-slate-400 mt-1">{t.message}</p>
                    <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
                       <button className="text-xs font-bold text-slate-300 hover:text-white transition-colors">Reply to Admin</button>
                    </div>
                  </div>
               ))}
             </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-xl font-black text-white mb-6">Global Application Configuration</h2>
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-xl p-5 border border-slate-700">
               <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-bold text-slate-300 uppercase tracking-widest">About Application Text</label>
                  {!editingAbout ? (
                     <button onClick={() => setEditingAbout(true)} className="text-[10px] text-indigo-400 font-bold uppercase hover:text-indigo-300">Edit</button>
                  ) : (
                     <button onClick={saveConfig} className="text-[10px] text-emerald-400 font-bold uppercase hover:text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded">Save Changes</button>
                  )}
               </div>
               
               {editingAbout ? (
                  <textarea 
                     rows="6" 
                     className="w-full bg-slate-800 border-slate-600 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                     value={newAbout}
                     onChange={e => setNewAbout(e.target.value)}
                  />
               ) : (
                  <p className="text-sm text-slate-400 leading-relaxed">{aboutText}</p>
               )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl text-center py-20">
           <CreditCard size={48} className="mx-auto text-slate-600 mb-4" />
           <h2 className="text-lg font-black text-white mb-2">SaaS Billing Engine</h2>
           <p className="text-slate-400 text-sm max-w-sm mx-auto">This module will provide Stripe integration for automated subscription tracking and invoicing across all tenant schools.</p>
        </div>
      )}
    </div>
  );
}
