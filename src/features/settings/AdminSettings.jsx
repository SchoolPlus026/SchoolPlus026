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
    // Basic validation
    if (file.size > 2 * 1024 * 1024) { alert('Logo file must be under 2MB'); return; }
    setUploadingLogo(true);
    try {
       const fileExt = file.name.split('.').pop();
       const fileName = `logos/${schoolSettings.school_id}_logo.${fileExt}`;
       // upsert: true replaces any existing logo file
       const { error: uploadError } = await supabase.storage
         .from('school_assets')
         .upload(fileName, file, { upsert: true, cacheControl: '3600' });
       if (uploadError) throw uploadError;

       // Get the public URL
       const { data: { publicUrl } } = supabase.storage.from('school_assets').getPublicUrl(fileName);
       // Append cache-buster so browser shows fresh image
       const finalUrl = `${publicUrl}?t=${Date.now()}`;
       setLogoUrl(finalUrl);

       // Auto-save to school_settings immediately
       const { data: updatedSettings, error: dbErr } = await supabase
         .from('school_settings')
         .update({ logo_url: finalUrl })
         .eq('school_id', schoolSettings.school_id)
         .select().single();
       if (dbErr) throw dbErr;

       // Sync to global store so header reflects it instantly
       setSchoolSettings(updatedSettings);
       alert('Logo uploaded and saved successfully! The header will now show your logo.');
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

  return (
    <div className="space-y-6 fade-in pb-12">
      
      {/* School Identity */}
      <div className="card">
        <div className="section-title"><h3>School Identity</h3></div>
        <form onSubmit={(e) => { e.preventDefault(); brandingMutation.mutate(); }}>
          <div className="mb-4">
            <label className="muted small mb-2 block">Legal Entity Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="sp-input" />
          </div>
          <div className="mb-4">
            <label className="muted small mb-2 block">Institutional Emblem / Logo</label>
            <div className="flex flex-col gap-3">
              {logoUrl && (
                <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                  <img src={logoUrl} alt="School Logo" className="w-[50px] h-[50px] object-contain rounded-lg bg-white border border-slate-200 p-1 shadow-sm" />
                  <div className="text-xs text-slate-400 font-medium">Current logo</div>
                </div>
              )}
              <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className="sp-input" placeholder="https://... (or upload below)" />
              <div className="relative">
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                <div className={`sp-input text-center text-sm py-3 ${uploadingLogo ? 'opacity-50 cursor-not-allowed' : 'btn outline cursor-pointer'}`}>
                    {uploadingLogo ? 'Uploading to Cloud...' : 'Click to Upload School Logo (max 2MB)'}
                </div>
              </div>
            </div>
          </div>
          <button type="submit" disabled={brandingMutation.isPending} className="btn btn-primary mt-2">
            {brandingMutation.isPending ? 'Synchronizing...' : 'Synchronize Identity'}
          </button>
        </form>
      </div>

      {/* Class Registry */}
      <div className="card">
        <div className="section-title"><h3>Class Registry</h3></div>
        <div className="flex gap-2 mb-4 max-w-sm">
            <input type="text" value={newClass} onChange={e => setNewClass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddClass()} placeholder="New standard label..." className="sp-input flex-1" />
            <button onClick={handleAddClass} className="btn outline">Add</button>
        </div>
        <div className="flex gap-2 flex-wrap">
            {classList.map(cls => (
                <span key={cls} className="badge" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {cls} <X size={12} className="cursor-pointer opacity-70 hover:opacity-100 text-red-300" onClick={() => handleRemoveClass(cls)} />
                </span>
            ))}
            {classList.length === 0 && <span className="muted small">No classes added yet.</span>}
        </div>
      </div>

      {/* App Preferences */}
      <div className="card">
         <div className="section-title"><h3>App Preferences</h3></div>
         <div style={{ maxWidth: '400px' }}>
            <div className="mb-4">
                <label className="muted small mb-2 block">Language</label>
                <select value={language} onChange={e => handleLanguageChange(e.target.value)} className="sp-input">
                    <option value="en">English</option>
                    <option value="hi">हिन्दी (Hindi)</option>
                    <option value="mr">मराठी (Marathi)</option>
                </select>
            </div>
            <div className="mb-4">
                <label className="muted small mb-2 block">Theme Preference</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" className={`btn ${theme === 'dark' ? 'btn-primary' : 'outline'}`} style={{ flex: 1 }} onClick={() => handleThemeChange('dark')}>Dark</button>
                    <button type="button" className={`btn ${theme === 'light' ? 'btn-primary' : 'outline'}`} style={{ flex: 1 }} onClick={() => handleThemeChange('light')}>Light</button>
                </div>
            </div>
            <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />
            <form onSubmit={handleChangePassword}>
                <label className="muted small mb-2 block">Change Password</label>
                <div className="flex gap-2">
                   <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Key..." className="sp-input flex-1" />
                   <button className="btn outline" type="submit" disabled={passwordLoading}>Update</button>
                </div>
            </form>
         </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-500/30">
         <div className="section-title"><h3 className="text-red-500">Danger Zone</h3></div>
         <p className="muted small mb-4">Structural Purge: Irreversible data deletion for all operational modules.</p>
         <button onClick={() => setIsResetModalOpen(true)} className="btn badge-danger w-full max-w-sm py-3 text-red-500 hover:text-white transition-colors border border-red-500/20">Reset All Institutional Data</button>
      </div>

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md border-red-500/30">
            <h3 className="text-lg font-bold mb-2">Protocol Authorization</h3>
            <p className="muted small mb-6">Enter your administrative credentials to authorize the purge sequence. This cannot be undone.</p>
            <form onSubmit={handleResetData} className="space-y-5">
              <div>
                <label className="muted small mb-2 block">Confirmation Password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="sp-input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setIsResetModalOpen(false); setConfirmPassword(''); }} className="btn outline flex-1">Abort</button>
                <button disabled={resetLoading} className="btn badge-danger text-red-500 hover:text-white border-red-500/20 flex-[2]">
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
