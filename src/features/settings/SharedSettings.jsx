import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Settings, Moon, Sun, Globe, KeyRound, Database, Trash2, Loader2, Download, CheckCircle } from 'lucide-react';

/* ─── helpers ─── */
function toast(msg, setT) {
  setT(msg);
  setTimeout(() => setT(''), 3000);
}

const TABLES_EXPORT = ['users', 'notices', 'attendance', 'fees', 'fees_payments', 'leaves', 'gallery', 'timetable', 'calendar_events', 'notifications'];
const TABLES_RESET = ['notifications', 'fees_payments', 'leaves', 'attendance', 'fees', 'timetable', 'calendar_events', 'gallery', 'notices', 'users'];

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card">
      <div className="section-title mb-4">
        <Icon className="text-accent" />
        <h3>{title}</h3>
      </div>
      <div style={{ maxWidth: '400px' }}>
        {children}
      </div>
    </div>
  );
}

export default function SharedSettings() {
  const { user, role } = useAppStore();
  const [toastMsg, setToastMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const userRole = (role || '').toLowerCase();
  const [dangerPwd, setDangerPwd] = useState('');

  // app_config state
  const [aboutText, setAboutText] = useState('Loading...');
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [newAbout, setNewAbout] = useState('');

  React.useEffect(() => {
    supabase.from('app_config').select('value_content').eq('key_name', 'about_text').single()
      .then(({ data }) => {
         if (data) {
           setAboutText(data.value_content);
           setNewAbout(data.value_content);
         }
      });
  }, []);

  const saveAboutText = async () => {
    setLoading(true);
    const { error } = await supabase.from('app_config').update({ value_content: newAbout }).eq('key_name', 'about_text');
    setLoading(false);
    if (error) return toast('Error: ' + error.message, setToastMsg);
    setAboutText(newAbout);
    setIsEditingAbout(false);
    toast('About text updated successfully', setToastMsg);
  };

  /* ──── Theme ──── */
  const [theme, setTheme] = useState(() => localStorage.getItem('lfs_theme') || 'dark');
  const applyTheme = (val) => {
    setTheme(val);
    localStorage.setItem('lfs_theme', val);
    document.documentElement.classList.toggle('dark', val === 'dark');
    document.documentElement.classList.toggle('light', val === 'light');
    document.documentElement.setAttribute('data-theme', val);
  };

  /* ──── Language ──── */
  const [lang, setLang] = useState(() => localStorage.getItem('lfs_lang') || 'en');
  const applyLang = (val) => {
    setLang(val);
    localStorage.setItem('lfs_lang', val);
    document.documentElement.lang = val;
  };

  /* ──── Change Password ──── */
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const changePassword = async () => {
    if (!oldPwd || !newPwd) return toast('Please enter old and new passwords.', setToastMsg);
    setPwdLoading(true);
    // Verify old password with Supabase Auth
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPwd,
    });
    if (signInErr) { toast('Old password does not match.', setToastMsg); setPwdLoading(false); return; }
    // Update to new
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdLoading(false);
    if (error) return toast('Error updating password: ' + error.message, setToastMsg);
    toast('Password updated successfully.', setToastMsg);
    setOldPwd(''); setNewPwd('');
  };

  /* ──── Export All Data (Admin only) ──── */
  const exportAll = async () => {
    setLoading(true);
    const out = {};
    for (const t of TABLES_EXPORT) {
      const { data } = await supabase.from(t).select('*');
      out[t] = data || [];
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'lfs-export.json'; a.click();
    URL.revokeObjectURL(url);
    toast('Data exported!', setToastMsg);
    setLoading(false);
  };

  /* ──── Reset All Data (Admin only) ──── */
  const resetAll = async () => {
    // Step 1: Verify current password
    if (!dangerPwd) return toast('Enter your current password first.', setToastMsg);
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: dangerPwd
    });
    if (authErr) { toast('Incorrect password. Reset cancelled.', setToastMsg); return; }

    // Step 2: Typed confirmation
    const confirmText = 'DELETE ALL DATA';
    const typed = window.prompt(`Password verified. Type to permanently delete all school data:\n${confirmText}`);
    if (typed !== confirmText) { toast('Reset cancelled.', setToastMsg); return; }

    toast('Resetting... Please wait.', setToastMsg);
    for (const t of TABLES_RESET) {
      await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    toast('Reset complete. Please re-run the SQL seed script.', setToastMsg);
    setDangerPwd('');
    await supabase.auth.signOut();
  };

  return (
    <div className="space-y-4 fade-in pb-10">
      {/* Header */}
      <div className="sp-card">
        <div className="flex items-center gap-3">
          <Settings size={18} className="text-indigo-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Settings</h3>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 bg-slate-900 border border-white/10 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle size={14} className="text-emerald-400" />
          {toastMsg}
        </div>
      )}

      {/* Theme */}
      <div className="card">
        <h4>Theme</h4>
        <select
          value={theme}
          onChange={e => applyTheme(e.target.value)}
          className="sp-input mt-2"
        >
          <option value="dark">🌙 Dark</option>
          <option value="light">☀ Light</option>
        </select>
      </div>

      {/* Language */}
      <div className="card">
        <h4>Language</h4>
        <select
          value={lang}
          onChange={e => applyLang(e.target.value)}
          className="sp-input mt-2"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="mr">मराठी (Marathi)</option>
        </select>
      </div>

      {/* Change Password */}
      <div className="card">
        <h4>Change Password</h4>
        <input
          type="password"
          placeholder="Old Password"
          value={oldPwd}
          onChange={e => setOldPwd(e.target.value)}
          className="sp-input block"
          style={{ marginBottom: '10px', marginTop: '10px' }}
        />
        <input
          type="password"
          placeholder="New Password"
          value={newPwd}
          onChange={e => setNewPwd(e.target.value)}
          className="sp-input block"
          style={{ marginBottom: '10px' }}
        />
        <button
          onClick={changePassword}
          disabled={pwdLoading}
          className="btn accent"
        >
          {pwdLoading ? 'Saving...' : 'Save New Password'}
        </button>
      </div>

      {/* Admin-only sections */}
      {userRole === 'admin' && (
        <div id="adminSettings">
          <div className="card">
            <h4>Data Management</h4>
            <div style={{ marginTop: '8px' }} className="flex">
              <button
                onClick={exportAll}
                disabled={loading}
                className="btn"
              >
                {loading ? 'Exporting...' : 'Export All Data (JSON)'}
              </button>
            </div>
          </div>

          <div className="card">
            <h4>Danger Zone</h4>
            <div className="muted small">
              This will permanently delete all records from all tables. This cannot be undone.
            </div>
            <div style={{ marginTop: '8px' }}>
              <input
                type="password"
                placeholder="Your current password"
                value={dangerPwd}
                onChange={e => setDangerPwd(e.target.value)}
                className="sp-input block"
                style={{ marginBottom: '10px' }}
              />
              <button
                onClick={resetAll}
                disabled={!dangerPwd}
                className="btn danger"
              >
                Reset All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About This Application */}
      <div className="sp-card mt-8">
        <div className="flex items-center justify-between mb-4">
           <h4 className="text-xl font-bold text-slate-100">About This Application</h4>
           {(userRole === 'admin' || userRole === 'app_manager') && (
              !isEditingAbout ? (
                 <button onClick={() => setIsEditingAbout(true)} className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg hover:bg-indigo-500/20">Edit Text</button>
              ) : (
                 <div className="flex gap-2">
                    <button onClick={() => { setIsEditingAbout(false); setNewAbout(aboutText); }} className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg">Cancel</button>
                    <button onClick={saveAboutText} disabled={loading} className="text-xs font-bold text-white bg-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-500">Save</button>
                 </div>
              )
           )}
        </div>
        
        {isEditingAbout ? (
           <textarea 
             rows="8"
             value={newAbout}
             onChange={e => setNewAbout(e.target.value)}
             className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-300 text-sm focus:outline-none focus:border-indigo-500 custom-scrollbar"
           />
        ) : (
           <div className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
             {aboutText === 'Loading...' ? (
               <div className="flex items-center justify-center p-6"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
             ) : aboutText}
           </div>
        )}

        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 mt-6">
          <p className="text-xs text-slate-500 flex flex-wrap gap-x-6 gap-y-2">
            <span><strong>Backend & Database:</strong> Supabase</span>
            <span><strong>Frontend:</strong> React, JavaScript, Tailwind CSS</span>
            <span><strong>Hosting:</strong> Netlify</span>
          </p>
        </div>
      </div>
    </div>
  );
}
