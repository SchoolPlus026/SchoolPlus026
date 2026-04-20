import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import {
  Save, Loader2, Info, LayoutGrid, Plus, X,
  Trash2, AlertTriangle, ShieldCheck, Palette, Globe, KeyRound
} from 'lucide-react';

export default function AdminSettings() {
  const { user, schoolSettings, setSchoolSettings, setClasses } = useAppStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState(schoolSettings?.name || '');
  const [logoUrl, setLogoUrl] = useState(schoolSettings?.logo_url || '');
  const [classList, setClassList] = useState(schoolSettings?.classes || []);
  const [newClass, setNewClass] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
       const fileExt = file.name.split('.').pop();
       const fileName = `${schoolSettings.school_id}_${Date.now()}.${fileExt}`;
       const { error: uploadError } = await supabase.storage.from('school_assets').upload(fileName, file);
       if (uploadError) throw uploadError;
       const { data: { publicUrl } } = supabase.storage.from('school_assets').getPublicUrl(fileName);
       setLogoUrl(publicUrl);
    } catch (err) {
       alert('Upload failed: ' + err.message);
    } finally {
       setUploadingLogo(false);
    }
  };

  // Danger Zone
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // App Preferences
  const [theme, setTheme] = useState(localStorage.getItem('sp_theme') || 'dark');
  const [language, setLanguage] = useState(localStorage.getItem('sp_lang') || 'en');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // ── Theme switcher (matches legacy data-theme behavior) ──
  const handleThemeChange = (val) => {
    setTheme(val);
    localStorage.setItem('sp_theme', val);
    document.documentElement.setAttribute('data-theme', val);
    document.body.setAttribute('data-theme', val);
  };

  // ── Language switcher (stored to localStorage, matching legacy) ──
  const handleLanguageChange = (val) => {
    setLanguage(val);
    localStorage.setItem('sp_lang', val);
  };

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
      alert('Branding synchronized successfully!');
    },
    onError: (e) => alert('Error: ' + e.message)
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
    },
    onError: (e) => alert('Error: ' + e.message)
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
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: confirmPassword
      });
      if (authError) throw new Error('Identity verification failed. Incorrect password.');
      const tables = ['attendance', 'fees', 'notices', 'calendar_events', 'leaves', 'gallery'];
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq('school_id', schoolSettings.school_id);
        if (error) throw error;
      }
      alert('Workspace data purged successfully.');
      setIsResetModalOpen(false);
      setConfirmPassword('');
      queryClient.invalidateQueries();
    } catch (err) {
      alert(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert('Password must be at least 6 characters');
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      alert('Password updated successfully!');
      setNewPassword('');
    } catch (err) {
      alert(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Reusable section card wrapper ──
  const SectionCard = ({ children, className = '' }) => (
    <div className={`sp-card ${className}`}>{children}</div>
  );

  const SectionHead = ({ title, subtitle }) => (
    <div className="mb-6">
      <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">{title}</h3>
      {subtitle && <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{subtitle}</p>}
    </div>
  );

  const inputClass = "sp-input";
  const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2";

  return (
    <div className="space-y-8 fade-in pb-12">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
          <ShieldCheck size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">Portal Configuration</h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">System Settings &amp; Preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ────── LEFT COLUMN ────── */}
        <div className="space-y-6">

          {/* School Identity */}
          <SectionCard>
            <SectionHead title="School Identity" subtitle="Public facing metadata" />
            <form onSubmit={(e) => { e.preventDefault(); brandingMutation.mutate(); }} className="space-y-5">
              <div>
                <label className={labelClass}>Legal Entity Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Institutional Emblem / Logo</label>
                <div className="flex flex-col gap-2">
                  <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className={inputClass} placeholder="https://... (Or upload below)" />
                  <div className="relative">
                    <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                    <div className={`sp-input text-center text-sm ${uploadingLogo ? 'text-slate-400 bg-slate-100' : 'text-primary bg-indigo-50 hover:bg-indigo-100'} transition-colors font-bold`}>
                       {uploadingLogo ? 'Uploading to Server...' : 'Click to Upload Custom Logo'}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={brandingMutation.isPending}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {brandingMutation.isPending
                  ? <><Loader2 size={16} className="animate-spin" /> Propagating...</>
                  : <><Save size={16} /> Synchronize Identity</>
                }
              </button>
            </form>
          </SectionCard>

          {/* Credits */}
          <SectionCard>
            <div className="flex items-center gap-2 text-indigo-400 mb-4">
              <Info size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Architectural Credits</span>
            </div>
            <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] text-center">
              Built by Shubham Arun Hajare — 9022761401
            </div>
          </SectionCard>
        </div>

        {/* ────── RIGHT COLUMN ────── */}
        <div className="space-y-6">

          {/* App Preferences — Theme & Language (THIS is what was "missing") */}
          <SectionCard>
            <SectionHead title="App Preferences" subtitle="Personalize workspace experience" />
            <div className="space-y-6">

              {/* Theme */}
              <div>
                <label className={labelClass}>
                  <Palette size={10} className="inline mr-1" />
                  Visual Theme
                </label>
                <select
                  value={theme}
                  onChange={e => handleThemeChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="dark">🌙 Dark (Default)</option>
                  <option value="light">☀ Light</option>
                  <option value="system">⚙ System</option>
                </select>
              </div>

              {/* Language */}
              <div>
                <label className={labelClass}>
                  <Globe size={10} className="inline mr-1" />
                  Language
                </label>
                <select
                  value={language}
                  onChange={e => handleLanguageChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                  <option value="mr">मराठी (Marathi)</option>
                </select>
              </div>

              {/* Change Password */}
              <form onSubmit={handleChangePassword} className="pt-4 border-t border-white/5">
                <label className={labelClass}>
                  <KeyRound size={10} className="inline mr-1" />
                  Change Account Password
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New authentication key..."
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all disabled:opacity-50 border border-white/5"
                  >
                    {passwordLoading ? '...' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </SectionCard>

          {/* Class Registry */}
          <SectionCard>
            <SectionHead title="Class Registry" subtitle="Structural unit configuration" />
            <div className="space-y-5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newClass}
                  onChange={e => setNewClass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddClass()}
                  placeholder="New standard label (e.g. Class 5th)..."
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={handleAddClass}
                  className="p-3 rounded-xl bg-indigo-600/50 hover:bg-indigo-600 text-white border border-indigo-500/30 transition-all"
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {classList.map(cls => (
                  <div
                    key={cls}
                    className="group flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full text-xs font-black text-indigo-300 transition-all hover:bg-indigo-500/20"
                  >
                    {cls}
                    <button
                      onClick={() => handleRemoveClass(cls)}
                      className="text-indigo-500 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {classList.length === 0 && (
                  <p className="text-[11px] text-slate-600 italic">No classes added yet.</p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Danger Zone */}
          <div className="sp-card border border-red-500/20 bg-red-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 text-red-400">
              <Trash2 size={80} />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-red-400" />
              <h3 className="text-sm font-black text-red-400 uppercase tracking-widest">Danger Zone</h3>
            </div>
            <p className="text-[10px] font-bold text-red-500/70 uppercase tracking-widest mb-6 leading-relaxed">
              Structural Purge: Irreversible data deletion for all operational modules.
            </p>
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-900/30"
            >
              Reset All Institutional Data
            </button>
          </div>
        </div>
      </div>

      {/* ── Reset Confirmation Modal ── */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="sp-card w-full max-w-md shadow-2xl p-8 border border-red-500/20">
            <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mb-6 border border-red-500/20 mx-auto">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-100 uppercase tracking-tight text-center mb-2">
              Protocol Authorization
            </h3>
            <p className="text-xs text-slate-500 font-medium text-center mb-8 px-4 leading-relaxed">
              Enter your administrative credentials to authorize the purge sequence. This cannot be undone.
            </p>
            <form onSubmit={handleResetData} className="space-y-5">
              <div>
                <label className={labelClass}>Confirmation Password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsResetModalOpen(false); setConfirmPassword(''); }}
                  className="flex-1 py-3 text-xs font-black uppercase text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Abort
                </button>
                <button
                  disabled={resetLoading}
                  className="flex-[2] py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {resetLoading ? 'Purging...' : 'Confirm Purge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
