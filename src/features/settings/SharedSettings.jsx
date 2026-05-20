import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { 
  Sun, Moon, Globe, Lock, Database, ShieldAlert, Info,
  Upload, Eye, EyeOff, Trash2
} from 'lucide-react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import BiometricSetup from './BiometricSetup';
/* ─── helpers ─── */
function toast(msg, setT) {
  setT(msg);
  setTimeout(() => setT(''), 3000);
}

const TABLES_EXPORT = ['users', 'notices', 'attendance', 'fees', 'fees_payments', 'leaves', 'gallery', 'timetable', 'calendar_events', 'notifications'];
const TABLES_RESET  = ['notifications', 'fees_payments', 'leaves', 'attendance', 'fees', 'timetable', 'calendar_events', 'gallery', 'notices', 'users'];

/* ─────────────────────────
   TRANSLATION DICTIONARY
─────────────────────────── */
const T = {
  en: {
    settings: 'Settings',
    theme: 'Theme',
    themeDark: 'Dark Mode',
    themeLight: 'Light Mode',
    language: 'Language',
    changePassword: 'Change Password',
    oldPassword: 'Old Password',
    newPassword: 'New Password',
    savePassword: 'Save New Password',
    savingPassword: 'Saving…',
    about: 'About This Application',
    dataManagement: 'Data Management',
    dangerZone: 'Danger Zone',
  },
  hi: {
    settings: 'सेटिंग',
    theme: 'थीम',
    themeDark: 'डार्क मोड',
    themeLight: 'लाइट मोड',
    language: 'भाषा',
    changePassword: 'पासवर्ड बदलें',
    oldPassword: 'पुराना पासवर्ड',
    newPassword: 'नया पासवर्ड',
    savePassword: 'नया पासवर्ड सहेजें',
    savingPassword: 'सहेज रहा है…',
    about: 'इस एप्लिकेशन के बारे में',
    dataManagement: 'डेटा प्रबंधन',
    dangerZone: 'खतरनाक क्षेत्र',
  },
  mr: {
    settings: 'सेटिंग्ज',
    theme: 'थीम',
    themeDark: 'डार्क मोड',
    themeLight: 'लाइट मोड',
    language: 'भाषा',
    changePassword: 'पासवर्ड बदला',
    oldPassword: 'जुना पासवर्ड',
    newPassword: 'नवीन पासवर्ड',
    savePassword: 'नवीन पासवर्ड जतन करा',
    savingPassword: 'जतन होत आहे…',
    about: 'या ऍप्लिकेशन बद्दल',
    dataManagement: 'डेटा व्यवस्थापन',
    dangerZone: 'धोकादायक विभाग',
  },
};

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

  /* ── App Version & Update Check ── */
  const [appVersionName, setAppVersionName] = useState(import.meta.env.VITE_APP_VERSION_NAME || '1.0.0');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  React.useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.getInfo().then(info => setAppVersionName(info.version));
    }
  }, []);

  const checkForUpdates = async () => {
    if (!Capacitor.isNativePlatform()) {
      return toast('Updates are handled automatically on the web.', setToastMsg);
    }
    setCheckingUpdate(true);
    try {
      const info = await CapacitorApp.getInfo();
      const localVersionCode = parseInt(info.build, 10);

      const { data, error } = await supabase
        .from('app_versions')
        .select('version_code, version_name, apk_url')
        .order('version_code', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        toast('Failed to check for updates. Try again.', setToastMsg);
        setCheckingUpdate(false);
        return;
      }

      if (Number(data.version_code) <= Number(localVersionCode)) {
        toast('✅ You are on the latest version.', setToastMsg);
        setCheckingUpdate(false);
        return;
      }

      // Update available — download in-app (no browser redirect)
      toast(`⬇️ Downloading v${data.version_name}…`, setToastMsg);

      const fileName = `SchoolOS_Update_v${data.version_name}.apk`;
      
      const downloadResult = await Filesystem.downloadFile({
        url: data.apk_url,
        path: fileName,
        directory: Directory.Cache
      });

      toast('✅ Download complete! Opening installer…', setToastMsg);
      
      await FileOpener.open({
        filePath: downloadResult.path,
        contentType: 'application/vnd.android.package-archive',
        openWithDefault: true
      });

    } catch (err) {
      console.error('[SharedSettings] Update download failed:', err);
      toast('❌ Download failed: ' + (err?.message || 'Unknown error'), setToastMsg);
    }
    setCheckingUpdate(false);
  };

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
    const root = document.documentElement;
    root.setAttribute('data-theme', val);
    document.body.setAttribute('data-theme', val);
    if (val === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  };

  /* ── Language ── */
  const [lang, setLang] = useState(() => localStorage.getItem('sp_lang') || 'en');
  const t = T[lang] || T.en;
  const applyLang = (val) => {
    setLang(val);
    localStorage.setItem('sp_lang', val);
    document.documentElement.lang = val;

    // Google Translate Trigger
    if (val === 'en') {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${window.location.hostname}; path=/;`;
    } else {
      document.cookie = `googtrans=/en/${val}; path=/`;
      document.cookie = `googtrans=/en/${val}; domain=.${window.location.hostname}; path=/`;
    }
    window.location.reload();
  };

  /* ── Change Password ── */
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

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
    <div className="space-y-4 fade-in pb-12 max-w-2xl mx-auto">

      {/* Toast notification */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: '30px', fontWeight: 600, fontSize: '14px', zIndex: 1000, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
          {toastMsg}
        </div>
      )}

      {/* Page Header */}
      <div className="section-title" style={{ padding: '0 8px', marginTop: '16px' }}>
        <h3>{t.settings}</h3>
      </div>

      {/* ── 1. THEME ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
        <div className="icon-box">
          {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
        </div>
        <div className="text-content" style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{t.theme}</h4>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Choose your preferred appearance
          </p>
        </div>
        <div style={{ width: '140px' }}>
          <select value={theme} onChange={e => applyTheme(e.target.value)} className="sp-input">
            <option value="dark">{t.themeDark}</option>
            <option value="light">{t.themeLight}</option>
          </select>
        </div>
      </div>

      {/* ── 2. LANGUAGE ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
        <div className="icon-box"><Globe size={20} /></div>
        <div className="text-content" style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{t.language}</h4>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Select your preferred language</p>
        </div>
        <div style={{ width: '130px' }}>
          <select value={lang} onChange={e => applyLang(e.target.value)} className="sp-input">
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="mr">मराठी</option>
          </select>
        </div>
      </div>

      {/* ── 3. CHANGE PASSWORD ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><Lock size={20} /></div>
          <div className="text-content">
            <h4>{t.changePassword}</h4>
            <p>Keep your account secure</p>
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type={showOldPwd ? "text" : "password"}
            placeholder={t.oldPassword}
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
            className="sp-input block w-full"
            style={{ paddingRight: '40px' }}
          />
          <button type="button" onClick={() => setShowOldPwd(!showOldPwd)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
             {showOldPwd ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <input
            type={showNewPwd ? "text" : "password"}
            placeholder={t.newPassword}
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            className="sp-input block w-full"
            style={{ paddingRight: '40px' }}
          />
          <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
             {showNewPwd ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        
        <button onClick={changePassword} disabled={pwdLoading} className="btn accent w-full">
          <Lock size={16} /> {pwdLoading ? t.savingPassword : t.savePassword}
        </button>
      </div>

      {/* ── 4. BIOMETRIC SETUP ── */}
      <BiometricSetup />

      {/* ── 5. DATA MANAGEMENT (admin only) ── */}
      {userRole === 'admin' && (
        <>
          <div className="card">
            <div className="settings-header">
              <div className="icon-box"><Database size={20} /></div>
              <div className="text-content">
                <h4>{t.dataManagement}</h4>
                <p>Export all data from all modules as a single JSON file.</p>
              </div>
            </div>
            <button onClick={exportAll} disabled={loading} className="btn outline w-full">
              <Upload size={16} /> {loading ? 'Exporting…' : 'Export All Data (JSON)'}
            </button>
          </div>

          {/* ── 5. DANGER ZONE (admin only) ── */}
          <div className="card" style={{ backgroundColor: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
            <div className="settings-header" style={{ marginBottom: '16px' }}>
              <div className="icon-box danger"><ShieldAlert size={20} /></div>
              <div className="text-content">
                <h4 style={{ color: 'var(--danger)' }}>{t.dangerZone}</h4>
                <p style={{ color: 'var(--danger)' }}>This will permanently delete all records. This cannot be undone.</p>
              </div>
            </div>
            <input
              type="password"
              placeholder="Enter your current password to unlock"
              value={dangerPwd}
              onChange={e => setDangerPwd(e.target.value)}
              className="sp-input block w-full mb-3"
            />
            <button onClick={resetAll} disabled={!dangerPwd} className="btn danger w-full">
              <Trash2 size={16} /> Reset All Data
            </button>
          </div>
        </>
      )}

      {/* ── 6. ABOUT ── */}
      <div className="card">
        <div className="settings-header" style={{ marginBottom: '16px' }}>
          <div className="icon-box"><Info size={20} /></div>
          <div className="text-content">
            <h4>{t.about}</h4>
            <p>System information and credits</p>
          </div>
          {(userRole === 'admin' || userRole === 'app_manager') && (
            !isEditingAbout
              ? <button onClick={() => setIsEditingAbout(true)} className="btn outline" style={{ width: 'auto', padding: '6px 12px' }}>Edit</button>
              : <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setIsEditingAbout(false); setNewAbout(aboutText); }} className="btn ghost" style={{ width: 'auto', padding: '6px 12px' }}>Cancel</button>
                  <button onClick={saveAboutText} disabled={loading} className="btn accent" style={{ width: 'auto', padding: '6px 12px' }}>Save</button>
                </div>
          )}
        </div>

        <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
          {isEditingAbout ? (
            <textarea
              rows="5"
              value={newAbout}
              onChange={e => setNewAbout(e.target.value)}
              className="sp-input"
              style={{ width: '100%', resize: 'vertical' }}
            />
          ) : (
            <div className="muted small" style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>
              {aboutText || 'Loading…'}
            </div>
          )}
        </div>

        <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--icon-bg)', color: 'var(--icon-color)', borderRadius: '12px' }}>
          <p className="muted small" style={{ margin: 0 }}>
            <strong>Backend:</strong> Supabase &nbsp;&bull;&nbsp;
            <strong>Frontend:</strong> React &nbsp;&bull;&nbsp;
            <strong>Hosting:</strong> Netlify
          </p>
        </div>
      </div>

      {/* ── 7. APP UPDATES & VERSION ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 20px', alignItems: 'center', textAlign: 'center' }}>
        <p className="muted small" style={{ margin: 0 }}>
          Current Version: <strong>v{appVersionName}</strong>
        </p>
        {Capacitor.isNativePlatform() && (
          <button
            id="btn-check-for-updates"
            onClick={checkForUpdates}
            disabled={checkingUpdate}
            className="btn outline"
            style={{ width: '100%', maxWidth: '260px' }}
          >
            {checkingUpdate ? '⬇️ Downloading…' : '🔍 Check for Updates'}
          </button>
        )}
        {!Capacitor.isNativePlatform() && (
          <p className="muted small" style={{ margin: 0, fontSize: '11px', opacity: 0.6 }}>
            Web version updates automatically.
          </p>
        )}
      </div>

    </div>
  );
}
