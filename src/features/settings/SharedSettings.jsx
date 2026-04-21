import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';

/* ─── helpers ─── */
function toast(msg, setT) {
  setT(msg);
  setTimeout(() => setT(''), 3000);
}

const TABLES_EXPORT = ['users', 'notices', 'attendance', 'fees', 'fees_payments', 'leaves', 'gallery', 'timetable', 'calendar_events', 'notifications'];
const TABLES_RESET  = ['notifications', 'fees_payments', 'leaves', 'attendance', 'fees', 'timetable', 'calendar_events', 'gallery', 'notices', 'users'];

export default function SharedSettings() {
  const { user, role } = useAppStore();
  const [toastMsg, setToastMsg] = useState('');
  const [loading, setLoading]   = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const userRole = (role || '').toLowerCase();

  /* ── About Text (admin/app_manager only) ── */
  const [aboutText, setAboutText] = useState('');
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [newAbout, setNewAbout] = useState('');
  const [dangerPwd, setDangerPwd] = useState('');

  React.useEffect(() => {
    supabase.from('app_config').select('value_content').eq('key_name', 'about_text').single()
      .then(({ data }) => {
        if (data) { setAboutText(data.value_content); setNewAbout(data.value_content); }
      });
  }, []);

  const saveAboutText = async () => {
    setLoading(true);
    const { error } = await supabase.from('app_config').update({ value_content: newAbout }).eq('key_name', 'about_text');
    setLoading(false);
    if (error) return toast('Error: ' + error.message, setToastMsg);
    setAboutText(newAbout);
    setIsEditingAbout(false);
    toast('About text updated!', setToastMsg);
  };

  /* ── Theme ── */
  const [theme, setTheme] = useState(() => localStorage.getItem('sp_theme') || 'light');
  const applyTheme = (val) => {
    setTheme(val);
    localStorage.setItem('sp_theme', val);
    document.documentElement.setAttribute('data-theme', val);
    document.body.setAttribute('data-theme', val);
  };

  /* ── Language ── */
  const [lang, setLang] = useState(() => localStorage.getItem('sp_lang') || 'en');
  const applyLang = (val) => {
    setLang(val);
    localStorage.setItem('sp_lang', val);
    document.documentElement.lang = val;
  };

  /* ── Change Password ── */
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const changePassword = async () => {
    if (!oldPwd || !newPwd) return toast('Please enter both old and new passwords.', setToastMsg);
    if (newPwd.length < 6) return toast('New password must be at least 6 characters.', setToastMsg);
    setPwdLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPwd });
    if (signInErr) { toast('Old password is incorrect.', setToastMsg); setPwdLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setPwdLoading(false);
    if (error) return toast('Error: ' + error.message, setToastMsg);
    toast('Password updated successfully!', setToastMsg);
    setOldPwd(''); setNewPwd('');
  };

  /* ── Export ── */
  const exportAll = async () => {
    setLoading(true);
    const out = {};
    for (const t of TABLES_EXPORT) {
      const { data } = await supabase.from(t).select('*');
      out[t] = data || [];
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'school-export.json'; a.click();
    URL.revokeObjectURL(url);
    toast('Data exported!', setToastMsg);
    setLoading(false);
  };

  /* ── Danger Zone Reset ── */
  const resetAll = async () => {
    if (!dangerPwd) return toast('Enter your current password first.', setToastMsg);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: dangerPwd });
    if (authErr) { toast('Incorrect password. Reset cancelled.', setToastMsg); return; }
    const typed = window.prompt('Type  DELETE ALL DATA  to confirm permanent deletion:');
    if (typed !== 'DELETE ALL DATA') { toast('Reset cancelled.', setToastMsg); return; }
    for (const t of TABLES_RESET) {
      await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    toast('All data reset. Signing out…', setToastMsg);
    setDangerPwd('');
    await supabase.auth.signOut();
  };

  /* ─────────── RENDER ─────────── */
  return (
    <div className="space-y-4 fade-in pb-12">

      {/* Toast notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: 'var(--card)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '10px 20px', fontWeight: 600, fontSize: '14px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)', color: 'var(--text)'
        }}>
          ✅ {toastMsg}
        </div>
      )}

      {/* ── Settings Header ── */}
      <div className="card">
        <div className="section-title"><h3>Settings</h3></div>
      </div>

      {/* ── 1. THEME ── */}
      <div className="card">
        <h4>Theme</h4>
        <select
          value={theme}
          onChange={e => applyTheme(e.target.value)}
          className="sp-input block w-full mt-2"
        >
          <option value="light">☀ Light</option>
          <option value="dark">🌙 Dark</option>
        </select>
      </div>

      {/* ── 2. LANGUAGE ── */}
      <div className="card">
        <h4>Language</h4>
        <select
          value={lang}
          onChange={e => applyLang(e.target.value)}
          className="sp-input block w-full mt-2"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="mr">मराठी (Marathi)</option>
        </select>
      </div>

      {/* ── 3. CHANGE PASSWORD ── */}
      <div className="card">
        <h4>Change Password</h4>
        <input
          type="password"
          placeholder="Old Password"
          value={oldPwd}
          onChange={e => setOldPwd(e.target.value)}
          className="sp-input block w-full mt-2 mb-2"
        />
        <input
          type="password"
          placeholder="New Password"
          value={newPwd}
          onChange={e => setNewPwd(e.target.value)}
          className="sp-input block w-full mb-3"
        />
        <button onClick={changePassword} disabled={pwdLoading} className="btn accent">
          {pwdLoading ? 'Saving…' : 'Save New Password'}
        </button>
      </div>

      {/* ── 4. DATA MANAGEMENT (admin only) ── */}
      {userRole === 'admin' && (
        <>
          <div className="card">
            <h4>Data Management</h4>
            <div className="muted small" style={{ marginBottom: '12px' }}>
              Exports all data from all modules as a single JSON file.
            </div>
            <button onClick={exportAll} disabled={loading} className="btn outline">
              {loading ? 'Exporting…' : 'Export All Data (JSON)'}
            </button>
          </div>

          {/* ── 5. DANGER ZONE (admin only) ── */}
          <div className="card" style={{ borderLeft: '3px solid #ef4444' }}>
            <h4 style={{ color: '#ef4444' }}>Danger Zone</h4>
            <div className="muted small" style={{ marginBottom: '12px' }}>
              This will permanently delete all records from all tables. This cannot be undone.
            </div>
            <input
              type="password"
              placeholder="Enter your current password to unlock"
              value={dangerPwd}
              onChange={e => setDangerPwd(e.target.value)}
              className="sp-input block w-full mb-3"
            />
            <button onClick={resetAll} disabled={!dangerPwd} className="btn danger">
              Reset All Data
            </button>
          </div>
        </>
      )}

      {/* ── 6. ABOUT ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0 }}>About This Application</h4>
          {(userRole === 'admin' || userRole === 'app_manager') && (
            !isEditingAbout
              ? <button onClick={() => setIsEditingAbout(true)} className="btn outline" style={{ fontSize: '12px', padding: '4px 12px' }}>Edit</button>
              : <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setIsEditingAbout(false); setNewAbout(aboutText); }} className="btn ghost" style={{ fontSize: '12px' }}>Cancel</button>
                  <button onClick={saveAboutText} disabled={loading} className="btn accent" style={{ fontSize: '12px' }}>Save</button>
                </div>
          )}
        </div>

        {isEditingAbout ? (
          <textarea
            rows="8"
            value={newAbout}
            onChange={e => setNewAbout(e.target.value)}
            className="sp-input"
            style={{ width: '100%', resize: 'vertical' }}
          />
        ) : (
          <div className="muted small" style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {aboutText || 'Loading…'}
          </div>
        )}

        <div style={{ marginTop: '16px', padding: '10px 14px', background: 'var(--glass)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <p className="muted small">
            <strong>Backend:</strong> Supabase &nbsp;&bull;&nbsp;
            <strong>Frontend:</strong> React &nbsp;&bull;&nbsp;
            <strong>Hosting:</strong> Netlify
          </p>
        </div>
      </div>

    </div>
  );
}
