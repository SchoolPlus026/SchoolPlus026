import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2 } from 'lucide-react';

/* ─────────────────────────
   TRANSLATION DICTIONARY
   Only translates hardcoded UI labels — never DB content.
─────────────────────────── */
const T = {
  en: {
    settings: 'Settings',
    schoolIdentity: 'School Identity',
    schoolName: 'School Name',
    schoolNamePlaceholder: 'Enter school name',
    currentLogo: 'Current Logo',
    noLogo: 'No logo uploaded yet.',
    uploadLogo: 'Click to Upload / Change Logo',
    uploading: 'Uploading…',
    saveName: 'Save School Name',
    saving: 'Saving…',
    theme: 'Theme',
    themeDark: '🌙 Dark',
    themeLight: '☀ Light',
    language: 'Language',
    changePassword: 'Change Password',
    oldPassword: 'Old Password',
    newPassword: 'New Password',
    savePassword: 'Save New Password',
    savingPassword: 'Saving…',
    dataManagement: 'Data Management',
    dataDesc: 'Exports all data from all modules as a single JSON file.',
    exportJson: 'Export All Data (JSON)',
    exporting: 'Exporting…',
    dangerZone: 'Danger Zone',
    dangerDesc: 'This will permanently delete all records. This cannot be undone.',
    resetAll: 'Reset All Data',
    confirmTitle: 'Confirm Reset',
    confirmDesc: 'Enter your password to authorize the data purge. This is irreversible.',
    confirmPwdLabel: 'Your Current Password',
    abort: 'Cancel',
    confirmPurge: 'Confirm & Purge',
    purging: 'Purging…',
  },
  hi: {
    settings: 'सेटिंग',
    schoolIdentity: 'स्कूल पहचान',
    schoolName: 'स्कूल का नाम',
    schoolNamePlaceholder: 'स्कूल का नाम दर्ज करें',
    currentLogo: 'वर्तमान लोगो',
    noLogo: 'अभी तक कोई लोगो अपलोड नहीं।',
    uploadLogo: 'लोगो अपलोड / बदलें',
    uploading: 'अपलोड हो रहा है…',
    saveName: 'नाम सहेजें',
    saving: 'सहेज रहा है…',
    theme: 'थीम',
    themeDark: '🌙 डार्क',
    themeLight: '☀ लाइट',
    language: 'भाषा',
    changePassword: 'पासवर्ड बदलें',
    oldPassword: 'पुराना पासवर्ड',
    newPassword: 'नया पासवर्ड',
    savePassword: 'नया पासवर्ड सहेजें',
    savingPassword: 'सहेज रहा है…',
    dataManagement: 'डेटा प्रबंधन',
    dataDesc: 'सभी मॉड्यूल का डेटा JSON के रूप में निर्यात करें।',
    exportJson: 'सभी डेटा निर्यात करें (JSON)',
    exporting: 'निर्यात हो रहा है…',
    dangerZone: 'खतरनाक क्षेत्र',
    dangerDesc: 'यह सभी रिकॉर्ड स्थायी रूप से हटा देगा।',
    resetAll: 'सभी डेटा रीसेट करें',
    confirmTitle: 'रीसेट की पुष्टि करें',
    confirmDesc: 'अपना पासवर्ड दर्ज करें। यह क्रिया अपरिवर्तनीय है।',
    confirmPwdLabel: 'आपका पासवर्ड',
    abort: 'रद्द करें',
    confirmPurge: 'पुष्टि करें',
    purging: 'हटाया जा रहा है…',
  },
  mr: {
    settings: 'सेटिंग्ज',
    schoolIdentity: 'शाळेची ओळख',
    schoolName: 'शाळेचे नाव',
    schoolNamePlaceholder: 'शाळेचे नाव टाका',
    currentLogo: 'सध्याचा लोगो',
    noLogo: 'अद्याप लोगो अपलोड केलेला नाही.',
    uploadLogo: 'लोगो अपलोड / बदला',
    uploading: 'अपलोड होत आहे…',
    saveName: 'नाव जतन करा',
    saving: 'जतन होत आहे…',
    theme: 'थीम',
    themeDark: '🌙 डार्क',
    themeLight: '☀ लाइट',
    language: 'भाषा',
    changePassword: 'पासवर्ड बदला',
    oldPassword: 'जुना पासवर्ड',
    newPassword: 'नवीन पासवर्ड',
    savePassword: 'नवीन पासवर्ड जतन करा',
    savingPassword: 'जतन होत आहे…',
    dataManagement: 'डेटा व्यवस्थापन',
    dataDesc: 'सर्व मॉड्युलचा डेटा JSON म्हणून निर्यात करा.',
    exportJson: 'सर्व डेटा निर्यात करा (JSON)',
    exporting: 'निर्यात होत आहे…',
    dangerZone: 'धोकादायक विभाग',
    dangerDesc: 'यामुळे सर्व नोंदी कायमस्वरूपी हटतील.',
    resetAll: 'सर्व डेटा रीसेट करा',
    confirmTitle: 'रीसेट ची पुष्टी करा',
    confirmDesc: 'पासवर्ड टाका. हे अपरिवर्तनीय आहे.',
    confirmPwdLabel: 'तुमचा पासवर्ड',
    abort: 'रद्द करा',
    confirmPurge: 'पुष्टी करा',
    purging: 'हटवत आहे…',
  },
};

const TABLES_EXPORT = ['users', 'notices', 'attendance', 'fees', 'fees_payments', 'leaves', 'gallery', 'timetable', 'calendar_events'];

export default function AdminSettings() {
  const { user, schoolSettings, setSchoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  /* ── Language ── */
  const [lang, setLang] = useState(localStorage.getItem('sp_lang') || 'en');
  const t = T[lang] || T.en;
  const applyLang = (val) => {
    setLang(val);
    localStorage.setItem('sp_lang', val);
    document.documentElement.lang = val;
  };

  /* ── Theme ── */
  const [theme, setTheme] = useState(localStorage.getItem('sp_theme') || 'light');
  const applyTheme = (val) => {
    setTheme(val);
    localStorage.setItem('sp_theme', val);
    document.documentElement.setAttribute('data-theme', val);
    document.body.setAttribute('data-theme', val);
  };

  /* ── School Identity ── */
  const [schoolName, setSchoolName]   = useState(schoolSettings?.name || '');
  const [logoUrl, setLogoUrl]         = useState(schoolSettings?.logo_url || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingName, setSavingName]   = useState(false);

  const handleSaveSchoolName = async () => {
    if (!schoolName.trim()) return alert('School name cannot be empty.');
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('school_settings')
        .update({ name: schoolName.trim() })
        .eq('school_id', schoolSettings.school_id);
      if (error) throw error;
      setSchoolSettings({ ...schoolSettings, name: schoolName.trim() });
      alert('School name saved!');
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('File must be under 2MB.'); return; }
    setUploadingLogo(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `logos/${schoolSettings.school_id}_logo.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('school_assets')
        .upload(path, file, { upsert: true, cacheControl: '0' });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('school_assets').getPublicUrl(path);
      const freshUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from('school_settings')
        .update({ logo_url: freshUrl })
        .eq('school_id', schoolSettings.school_id);
      if (dbErr) throw dbErr;

      setLogoUrl(freshUrl);
      setSchoolSettings({ ...schoolSettings, logo_url: freshUrl });
      alert('Logo uploaded successfully! It will show in the header after refresh.');
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ── Password ── */
  const [oldPwd, setOldPwd]   = useState('');
  const [newPwd, setNewPwd]   = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) return alert('Please fill both password fields.');
    if (newPwd.length < 6) return alert('New password must be at least 6 characters.');
    setPwdLoading(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPwd });
      if (verifyErr) throw new Error('Old password is incorrect.');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      alert('Password updated successfully!');
      setOldPwd(''); setNewPwd('');
    } catch (err) {
      alert(err.message);
    } finally {
      setPwdLoading(false);
    }
  };

  /* ── Export ── */
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const out = {};
      for (const tbl of TABLES_EXPORT) {
        const { data } = await supabase.from(tbl).select('*');
        out[tbl] = data || [];
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `school-export-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export error: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  /* ── Danger Zone ── */
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState('');
  const [resetting, setResetting]   = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setResetting(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: confirmPwd });
      if (authErr) throw new Error('Incorrect password. Reset cancelled.');
      const tables = ['attendance', 'fees', 'fees_payments', 'notices', 'calendar_events', 'leaves', 'gallery', 'timetable'];
      for (const tbl of tables) {
        await supabase.from(tbl).delete().eq('school_id', schoolSettings.school_id);
      }
      alert('All school data has been reset.');
      setShowResetModal(false);
      setConfirmPwd('');
      queryClient.invalidateQueries();
    } catch (err) {
      alert(err.message);
    } finally {
      setResetting(false);
    }
  };

  /* ──────── RENDER ──────── */
  return (
    <div className="space-y-4 fade-in pb-12">

      {/* Page Header Card */}
      <div className="card">
        <div className="section-title"><h3>{t.settings}</h3></div>
      </div>

      {/* ── 1. SCHOOL IDENTITY ── */}
      <div className="card">
        <h4>{t.schoolIdentity}</h4>

        <div style={{ marginTop: '14px' }}>
          <label className="muted small block" style={{ marginBottom: '6px' }}>{t.schoolName}</label>
          <input
            type="text"
            value={schoolName}
            onChange={e => setSchoolName(e.target.value)}
            placeholder={t.schoolNamePlaceholder}
            className="sp-input block w-full"
            style={{ marginBottom: '10px' }}
          />
          <button onClick={handleSaveSchoolName} disabled={savingName} className="btn accent">
            {savingName ? t.saving : t.saveName}
          </button>
        </div>

        <hr style={{ borderColor: 'var(--border-color)', margin: '18px 0' }} />

        {/* Logo Preview */}
        <div style={{ marginBottom: '12px' }}>
          {logoUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <img
                src={logoUrl}
                alt="School Logo"
                style={{
                  width: '72px', height: '72px', objectFit: 'contain',
                  background: '#fff', borderRadius: '10px', padding: '6px',
                  border: '1px solid var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              />
              <span className="muted small">{t.currentLogo}</span>
            </div>
          ) : (
            <p className="muted small" style={{ marginBottom: '12px' }}>{t.noLogo}</p>
          )}
        </div>

        {/* Upload Button */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            disabled={uploadingLogo}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, cursor: uploadingLogo ? 'not-allowed' : 'pointer', zIndex: 1
            }}
          />
          <button className="btn outline" disabled={uploadingLogo} style={{ pointerEvents: 'none' }}>
            {uploadingLogo
              ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={14} className="animate-spin" /> {t.uploading}
                </span>
              : t.uploadLogo
            }
          </button>
        </div>
      </div>

      {/* ── 2. THEME ── */}
      <div className="card">
        <h4>{t.theme}</h4>
        <select
          value={theme}
          onChange={e => applyTheme(e.target.value)}
          className="sp-input block w-full mt-2"
        >
          <option value="light">{t.themeLight}</option>
          <option value="dark">{t.themeDark}</option>
        </select>
      </div>

      {/* ── 3. LANGUAGE ── */}
      <div className="card">
        <h4>{t.language}</h4>
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

      {/* ── 4. CHANGE PASSWORD ── */}
      <div className="card">
        <h4>{t.changePassword}</h4>
        <input
          type="password"
          placeholder={t.oldPassword}
          value={oldPwd}
          onChange={e => setOldPwd(e.target.value)}
          className="sp-input block w-full mt-3 mb-2"
        />
        <input
          type="password"
          placeholder={t.newPassword}
          value={newPwd}
          onChange={e => setNewPwd(e.target.value)}
          className="sp-input block w-full mb-3"
        />
        <button onClick={handleChangePassword} disabled={pwdLoading} className="btn accent">
          {pwdLoading ? t.savingPassword : t.savePassword}
        </button>
      </div>

      {/* ── 5. DATA MANAGEMENT ── */}
      <div className="card">
        <h4>{t.dataManagement}</h4>
        <div className="muted small" style={{ marginBottom: '12px' }}>{t.dataDesc}</div>
        <button onClick={handleExport} disabled={exporting} className="btn outline">
          {exporting ? t.exporting : t.exportJson}
        </button>
      </div>

      {/* ── 6. DANGER ZONE ── */}
      <div className="card" style={{ borderLeft: '3px solid #ef4444' }}>
        <h4 style={{ color: '#ef4444' }}>{t.dangerZone}</h4>
        <div className="muted small" style={{ marginBottom: '14px' }}>{t.dangerDesc}</div>
        <button className="btn danger" onClick={() => setShowResetModal(true)}>
          {t.resetAll}
        </button>
      </div>

      {/* ── RESET MODAL ── */}
      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', borderLeft: '4px solid #ef4444' }}>
            <h3 style={{ marginBottom: '8px' }}>{t.confirmTitle}</h3>
            <p className="muted small" style={{ marginBottom: '18px' }}>{t.confirmDesc}</p>
            <form onSubmit={handleReset}>
              <label className="muted small block" style={{ marginBottom: '6px' }}>{t.confirmPwdLabel}</label>
              <input
                type="password"
                required
                autoFocus
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="••••••••"
                className="sp-input block w-full mb-4"
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn outline"
                  style={{ flex: 1 }}
                  onClick={() => { setShowResetModal(false); setConfirmPwd(''); }}
                >
                  {t.abort}
                </button>
                <button type="submit" disabled={resetting} className="btn danger" style={{ flex: 2 }}>
                  {resetting ? t.purging : t.confirmPurge}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
