import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Save, Loader2, Info, LayoutGrid, Plus, X } from 'lucide-react';

export default function AdminSettings() {
  const { schoolSettings, setSchoolSettings, setClasses } = useAppStore();
  const queryClient = useQueryClient();

  // Branding states
  const [name, setName] = useState(schoolSettings?.name || '');
  const [logoUrl, setLogoUrl] = useState(schoolSettings?.logo_url || '');
  
  // Classes states
  const [classList, setClassList] = useState(schoolSettings?.classes || []);
  const [newClass, setNewClass] = useState('');

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
    if (classList.includes(newClass.trim())) {
      alert('Class already exists');
      return;
    }
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

  return (
    <div className="space-y-6">
      {/* Branding Section */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-text tracking-tight mb-2">School Branding</h2>
        <p className="text-sm text-muted mb-6">Customize the name and logo displayed across the portal.</p>
        
        <form onSubmit={(e) => { e.preventDefault(); brandingMutation.mutate(); }} className="space-y-5 max-w-xl">
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">School Name</label>
            <input 
              type="text" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm"
              placeholder="e.g., Little Flower School"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Logo URL</label>
            <input 
              type="url" 
              value={logoUrl} 
              onChange={e => setLogoUrl(e.target.value)} 
              className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm"
              placeholder="https://example.com/logo.png"
            />
          </div>
          <button 
            type="submit" 
            disabled={brandingMutation.isPending} 
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-md"
          >
            {brandingMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Branding
          </button>
        </form>
      </div>

      {/* Class Management Section */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-text tracking-tight mb-2 flex items-center gap-2">
          <LayoutGrid className="text-primary" size={24} /> Manage Classes
        </h2>
        <p className="text-sm text-muted mb-6">Define the class structure for your school (e.g., LKG, 1st, 10A).</p>
        
        <div className="max-w-xl space-y-6">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newClass}
              onChange={e => setNewClass(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddClass()}
              placeholder="Enter Class (e.g. 11th B)"
              className="flex-1 bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm"
            />
            <button 
              onClick={handleAddClass}
              disabled={classesMutation.isPending}
              className="px-4 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-colors flex items-center gap-2"
            >
              <Plus size={20} /> Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {classList.map(cls => (
              <div key={cls} className="flex items-center gap-2 bg-slate-100 border border-border px-3 py-1.5 rounded-lg text-sm font-bold text-slate-700 group">
                {cls}
                <button 
                  onClick={() => handleRemoveClass(cls)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System System Information */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-text tracking-tight mb-2 flex items-center gap-2">
          <Info className="text-primary" size={20}/> About System
        </h2>
        <div className="mt-4 p-4 bg-slate-50 border border-border rounded-xl text-sm font-bold text-slate-700">
          Developed by Shubham Arun Hajare — Contact: 9022761401
        </div>
      </div>
    </div>
  );
}
