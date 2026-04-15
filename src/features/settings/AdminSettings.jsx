import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Save, Loader2, Info, LayoutGrid, Plus, X, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function AdminSettings() {
  const { user, schoolSettings, setSchoolSettings, setClasses } = useAppStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState(schoolSettings?.name || '');
  const [logoUrl, setLogoUrl] = useState(schoolSettings?.logo_url || '');
  const [classList, setClassList] = useState(schoolSettings?.classes || []);
  const [newClass, setNewClass] = useState('');

  // Danger Zone states
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const brandingMutation = useMutation({
    mutationFn: async () => {
      const { error, data } = await supabase
        .from('school_settings')
        .update({ name, logo_url: logoUrl })
        .eq('school_id', schoolSettings.school_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedSettings) => {
      setSchoolSettings(updatedSettings);
      alert('Branding updated successfully!');
    }
  });

  const classesMutation = useMutation({
    mutationFn: async (updatedList) => {
      const { error } = await supabase
        .from('school_settings')
        .update({ classes: updatedList })
        .eq('school_id', schoolSettings.school_id);
      if (error) throw error;
    },
    onSuccess: (_, updatedList) => {
      setClasses(updatedList);
      alert('Class structure updated successfully!');
    }
  });

  const handleAddClass = () => {
    if (!newClass.trim()) return;
    if (classList.includes(newClass.trim())) return alert('Class already exists');
    const updated = [...classList, newClass.trim()];
    setClassList(updated);
    setNewClass('');
    classesMutation.mutate(updated);
  };

  const handleRemoveClass = (cls) => {
    const updated = classList.filter(c => c !== cls);
    setClassList(updated);
    classesMutation.mutate(updated);
  };

  const handleResetData = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    try {
      // 1. Re-authenticate to prove identity
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: confirmPassword
      });

      if (authError) throw new Error('Identity verification failed. Incorrect password.');

      // 2. Perform cascade delete/reset
      // Note: In a real multi-tenant app, we only delete data for THIS school_id
      const tables = ['attendance', 'fees', 'notices', 'calendar_events', 'leaves', 'gallery'];
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq('school_id', schoolSettings.school_id);
        if (error) throw error;
      }

      alert('Workspace data has been purged successfully.');
      setIsResetModalOpen(false);
      setConfirmPassword('');
      queryClient.invalidateQueries();
    } catch (err) {
      alert(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center gap-3">
         <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><ShieldCheck size={24} /></div>
         <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Portal Configuration</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Core Branding */}
        <div className="space-y-8">
           <div className="bg-white border border-border rounded-[2.5rem] p-8 shadow-xl shadow-slate-100/50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">School Identity</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Public Facing Metadata</p>
              
              <form onSubmit={(e) => { e.preventDefault(); brandingMutation.mutate(); }} className="space-y-6">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Legal Entity Name</label>
                   <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner" />
                </div>
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Institutional Emblem URL</label>
                   <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner" />
                </div>
                <button type="submit" disabled={brandingMutation.isPending} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-primary-dark transition-all">
                   {brandingMutation.isPending ? 'Propagating...' : 'Synchronize Identity'}
                </button>
              </form>
           </div>

           <div className="bg-white border border-border rounded-[2.5rem] p-6 shadow-xl shadow-slate-100/50">
             <div className="flex items-center gap-2 text-indigo-500 mb-4 px-2">
                <Info size={18} />
                <span className="text-[10px] font-black uppercase tracking-widest">Architectural Credits</span>
             </div>
             <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] text-center">
                Built by Shubham Arun Hajare — 9022761401
             </div>
           </div>
        </div>

        {/* Right Column: Class Architecture & Security */}
        <div className="space-y-8">
           <div className="bg-white border border-border rounded-[2.5rem] p-8 shadow-xl shadow-slate-100/50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2 flex items-center gap-2"><LayoutGrid size={20} /> Class Registry</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Structural Unit Configuration</p>
              
              <div className="space-y-6">
                 <div className="flex gap-2">
                    <input type="text" value={newClass} onChange={e => setNewClass(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddClass()} placeholder="New standard label..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner" />
                    <button onClick={handleAddClass} className="p-4 bg-slate-800 text-white rounded-xl hover:bg-black transition-colors"><Plus size={20} /></button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {classList.map(cls => (
                      <div key={cls} className="group flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl text-xs font-black text-primary transition-all hover:bg-primary hover:text-white">
                         {cls}
                         <button onClick={() => handleRemoveClass(cls)} className="text-indigo-400 group-hover:text-white"><X size={14} /></button>
                      </div>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-red-50 border-2 border-red-100 rounded-[2.5rem] p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform text-red-500"><Trash2 size={100} /></div>
              <h3 className="text-xl font-black text-red-600 uppercase tracking-tight mb-2 flex items-center gap-2"><AlertTriangle size={20} /> Danger Zone</h3>
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-8 leading-relaxed">Structural Purge: Irreversible data deletion for all operational modules.</p>
              
              <button 
                onClick={() => setIsResetModalOpen(true)}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200 hover:bg-red-700 transition-all active:scale-95"
              >
                 Reset All Institutional Data
              </button>
           </div>
        </div>
      </div>

      {/* Security Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
           <div className="bg-white border border-border rounded-[3rem] w-full max-w-md shadow-2xl p-10 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-6 border border-red-100 mx-auto shadow-sm">
                 <ShieldCheck size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight text-center mb-2">Protocol Authorization</h3>
              <p className="text-xs text-slate-500 font-medium text-center mb-8 px-4 leading-relaxed">
                You are requesting a system-wide reset. Enter your administrative credentials to authorize the purge sequence.
              </p>
              
              <form onSubmit={handleResetData} className="space-y-6">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Confirmation Password</label>
                   <input 
                    type="password" 
                    required 
                    autoFocus
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black tracking-[0.2em] text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-inner" 
                   />
                </div>
                <div className="flex gap-4 pt-2">
                   <button type="button" onClick={() => { setIsResetModalOpen(false); setConfirmPassword(''); }} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Abort</button>
                   <button disabled={resetLoading} className="flex-[2] py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200 hover:bg-red-700 transition-all disabled:opacity-50">
                      {resetLoading ? 'Purging Archive...' : 'Confirm Purge'}
                   </button>
                </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}
