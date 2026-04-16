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
    <div className="sp-card">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-indigo-400" />
        <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest">{title}</h4>
      </div>
      {children}
    </div>
  );
}

export default function SharedSettings() {
  const { user, role } = useAppStore();
  const [toastMsg, setToastMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const userRole = (role || '').toLowerCase();

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
    const confirmText = 'DELETE ALL DATA';
    const typed = window.prompt(`This will delete everything. To confirm, type: ${confirmText}`);
    if (typed !== confirmText) { toast('Reset cancelled.', setToastMsg); return; }
    toast('Resetting... Please wait.', setToastMsg);
    for (const t of TABLES_RESET) {
      await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    toast('Reset complete. Please re-run the SQL seed script.', setToastMsg);
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
      <Section title="Theme" icon={theme === 'dark' ? Moon : Sun}>
        <select
          value={theme}
          onChange={e => applyTheme(e.target.value)}
          className="sp-input w-full"
        >
          <option value="dark">🌙 Dark</option>
          <option value="light">☀ Light</option>
        </select>
      </Section>

      {/* Language */}
      <Section title="Language" icon={Globe}>
        <select
          value={lang}
          onChange={e => applyLang(e.target.value)}
          className="sp-input w-full"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="mr">मराठी (Marathi)</option>
        </select>
      </Section>

      {/* Change Password */}
      <Section title="Change Password" icon={KeyRound}>
        <div className="space-y-2">
          <input
            type="password"
            placeholder="Old Password"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            className="sp-input w-full"
          />
          <input
            type="password"
            placeholder="New Password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            className="sp-input w-full"
          />
          <button
            onClick={changePassword}
            disabled={pwdLoading}
            className="btn-primary flex items-center gap-2 text-sm mt-1"
          >
            {pwdLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            Save New Password
          </button>
        </div>
      </Section>

      {/* Admin-only sections */}
      {userRole === 'admin' && (
        <>
          <Section title="Data Management" icon={Database}>
            <p className="text-xs text-slate-500 mb-3">
              Exports all data from all tables as a single JSON file.
            </p>
            <button
              onClick={exportAll}
              disabled={loading}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export All Data (JSON)
            </button>
          </Section>

          <Section title="Danger Zone" icon={Trash2}>
            <p className="text-xs text-slate-500 mb-3">
              This will permanently delete all records from all tables. This cannot be undone.
            </p>
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold rounded-xl transition-all"
            >
              <Trash2 size={14} />
              Reset All Data
            </button>
          </Section>
        </>
      )}

      {/* About This Application */}
      <div className="sp-card mt-8">
        <h4 className="text-xl font-bold text-slate-100 mb-2">About This Application</h4>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
          The Little Flower School Web Application has been designed to modernize and simplify school management through a fully digital platform. This system ensures that the administration, teachers, students, and parents can collaborate effectively and stay informed at all times.
        </p>

        <h5 className="font-bold text-slate-200 mt-4 mb-1 text-sm">Purpose</h5>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
          The purpose of this application is to provide a centralized and reliable platform where all essential school functions are managed digitally. It reduces paperwork, improves communication, and creates transparency between school authorities, teachers, and students.
        </p>

        <h5 className="font-bold text-slate-200 mt-4 mb-2 text-sm">Key Functions</h5>
        <ul className="list-disc list-inside text-sm text-slate-400 mb-4 space-y-1 ml-1">
          <li><strong>Role-Based Dashboards:</strong> Admin, Teacher, and Student dashboards with customized access.</li>
          <li><strong>Core Modules:</strong> Secure login, dynamic calendar, attendance, fees, leave management, timetable, notices, gallery, and reports.</li>
        </ul>

        <h5 className="font-bold text-slate-200 mt-4 mb-1 text-sm">How the App Works</h5>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
          The application connects with Supabase (a secure backend service) for managing the database, authentication, and real-time updates. It is deployed on Netlify, making it fast, lightweight, and easily accessible on any device. The system ensures that each role has access only to the data and features relevant to them, maintaining strict separation of permissions.
        </p>

        <h5 className="font-bold text-slate-200 mt-4 mb-1 text-sm">Security and Privacy</h5>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
          Authentication is role-based, Row Level Security (RLS) policies are enabled, and password-protected advanced settings are in place. Data encryption is applied at both transmission and storage levels.
        </p>

        <h5 className="font-bold text-slate-200 mt-4 mb-1 text-sm">Credit</h5>
        <p className="text-sm text-slate-400 leading-relaxed mb-4">
          This application has been conceptualized, developed, and customized for <strong className="text-indigo-400">Little Flower School (Parli V.)</strong> by <strong className="text-slate-200">Mr. Shubham Arun Hajare</strong>, who has overseen its development, structure, and deployment.
        </p>

        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 mt-4">
          <p className="text-xs text-slate-500 flex flex-col gap-1.5">
            <span><strong>Backend & Database:</strong> Supabase</span>
            <span><strong>Frontend:</strong> React, JavaScript, Tailwind CSS</span>
            <span><strong>Hosting:</strong> Netlify</span>
            <span><strong>Engagement:</strong> OneSignal (Planned)</span>
          </p>
        </div>
      </div>
    </div>
  );
}
