import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Save, Loader2, Info } from 'lucide-react';

export default function AdminSettings() {
  const { schoolSettings, setSchoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState(schoolSettings?.name || '');
  const [logoUrl, setLogoUrl] = useState(schoolSettings?.logo_url || '');

  const saveMutation = useMutation({
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
      alert('School settings updated successfully!');
    }
  });

  const handleSave = (e) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-text tracking-tight mb-2">School Branding</h2>
        <p className="text-sm text-muted mb-6">Customize the name and logo displayed across the portal.</p>
        
        <form onSubmit={handleSave} className="space-y-5 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">School Name</label>
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
            <label className="block text-sm font-medium text-text mb-1.5">Logo URL</label>
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
            disabled={saveMutation.isPending} 
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 shadow-md"
          >
            {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Branding
          </button>
        </form>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-text tracking-tight mb-2 flex items-center gap-2">
          <Info className="text-primary" size={20}/> About System
        </h2>
        <div className="mt-4 p-4 bg-slate-50 border border-border rounded-xl text-sm font-medium text-slate-700">
          Developed by Shubham Arun Hajare — Contact: 9022761401
        </div>
      </div>
    </div>
  );
}
