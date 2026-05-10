import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { 
  Building, Sun, Globe, Lock, Database, ShieldAlert, 
  Upload, Save, Eye, EyeOff, MoreHorizontal, ChevronRight, Loader2, Image as ImageIcon, Trash2, HardDrive, HelpCircle, FileText, Send, Plus, X, ToggleLeft
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { logAuditAction } from '../../utils/auditLogger';
import { usePlan } from '../../hooks/usePlan';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

/* ─────────────────────────
   TRANSLATION DICTIONARY
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
    themeDark: 'Dark',
    themeLight: 'Light',
    language: 'Language',
    changePassword: 'Change Password',
    oldPassword: 'Old Password',
    newPassword: 'New Password',
    savePassword: 'Save New Password',
    savingPassword: 'Saving…',
    dataManagement: 'Data Management',
    dataDesc: 'Export all data from all modules as a single JSON file.',
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
    themeDark: 'डार्क',
    themeLight: 'लाइट',
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
    themeDark: 'डार्क',
    themeLight: 'लाइट',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFree } = usePlan();

  /* ── Google Drive State ── */
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

  /* ── Platform Settings & Legal ── */
  const [platformSettings, setPlatformSettings] = useState(null);

  /* ── Support Ticket State ── */
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [legalTab, setLegalTab] = useState(null); // 'about' | 'terms' | null

  /* ── App Version ── */
  const [appVersion, setAppVersion] = useState('');

  React.useEffect(() => {
    const code = searchParams.get('code');
    if (code && !connectingDrive) {
      handleDriveCallback(code);
    }
    
    // Fetch Platform Legal Info
    const fetchPlatformInfo = async () => {
      const { data } = await supabase.from('platform_settings').select('*').single();
      if (data) setPlatformSettings(data);
    };
    fetchPlatformInfo();

    let browserListener = null;
    if (Capacitor.isNativePlatform()) {
      browserListener = Browser.addListener('browserFinished', async () => {
        // When the user closes the Capacitor Browser, refresh the Google Drive connection status
        setConnectingDrive(true);
        try {
          const { data: newSettings } = await supabase.from('school_settings').select('*').eq('school_id', schoolSettings.school_id).single();
          if (newSettings) setSchoolSettings(newSettings);
        } finally {
          setConnectingDrive(false);
        }
      });
    }

    if (Capacitor.isNativePlatform()) {
      App.getInfo().then(info => setAppVersion(`v${info.version}`));
    } else {
      // VITE_APP_VERSION_NAME from CI includes 'v' prefix (e.g. v1.0.28) — strip it
      const raw = import.meta.env.VITE_APP_VERSION_NAME || '1.0.0';
      const clean = raw.replace(/^v/, '');
      setAppVersion(`v${clean} (Web)`);
    }

    return () => {
      if (browserListener) {
        browserListener.then(l => l.remove());
      }
    };
  }, [searchParams, connectingDrive, schoolSettings.school_id, setSchoolSettings]);

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSubmittingTicket(true);
    
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error } = await supabase.from('support_tickets').insert({
        school_id: schoolSettings.school_id,
        admin_id: currentUser.id,
        subject: supportSubject,
        message: supportMessage
      });
      if (error) throw error;
      
      // Audit Log
      await logAuditAction('SUBMIT_SUPPORT_TICKET', schoolSettings.school_id, { subject: supportSubject });
      
      alert('Support ticket submitted successfully. The Platform Admin will review it shortly.');
      setShowSupportModal(false);
      setSupportSubject('');
      setSupportMessage('');
    } catch (err) {
      alert('Error submitting ticket: ' + err.message);
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleConnectDrive = async () => {
    const drives = Array.isArray(schoolSettings?.gdrive_config) ? schoolSettings.gdrive_config : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
    if (isFree && drives.length >= 1) {
       if (window.confirm('The Free plan is strictly limited to 1 Google Drive connection. Upgrade to Premium to connect multiple drives. Go to Billing now?')) {
          window.location.href = '/admin/billing';
       }
       return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const isNative = Capacitor.isNativePlatform();
    const redirectUri = isNative ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gdrive-auth` : window.location.origin + window.location.pathname;
    const stateParam = isNative ? `&state=${schoolSettings.school_id}` : '';
    
    if (!clientId) {
      return alert('Google Client ID is missing in environment variables.');
    }
    
    const scope = 'https://www.googleapis.com/auth/drive.file';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent${stateParam}`;
    
    if (isNative) {
       await Browser.open({ url: authUrl });
    } else {
       window.location.href = authUrl;
    }
  };

  const handleDriveCallback = async (code) => {
    setConnectingDrive(true);
    searchParams.delete('code');
    setSearchParams(searchParams, { replace: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('gdrive-auth', {
        body: { 
          code, 
          school_id: schoolSettings.school_id,
          redirect_uri: window.location.origin + window.location.pathname
        },
        headers: {
           Authorization: `Bearer ${session?.access_token}`
        }
      });
      
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      alert('Google Drive connected successfully!');
      const { data: newSettings } = await supabase.from('school_settings').select('*').eq('school_id', schoolSettings.school_id).single();
      setSchoolSettings(newSettings);
    } catch (err) {
      alert('Error connecting drive: ' + err.message);
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = async (index) => {
    if (!window.confirm('Are you sure you want to disconnect this Google Drive? New gallery images will fall back to Supabase Storage or external links.')) return;
    setDisconnectingDrive(true);
    try {
      const drives = Array.isArray(schoolSettings?.gdrive_config) ? [...schoolSettings.gdrive_config] : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
      drives.splice(index, 1);
      
      // Update DB with empty array instead of null for JSONB
      const { error } = await supabase.from('school_settings').update({ gdrive_config: drives }).eq('school_id', schoolSettings.school_id);
      if (error) throw error;
      
      const { data: newSettings } = await supabase.from('school_settings').select('*').eq('school_id', schoolSettings.school_id).single();
      setSchoolSettings(newSettings);
      alert('Google Drive disconnected.');
    } catch (err) {
      alert('Error disconnecting: ' + err.message);
    } finally {
      setDisconnectingDrive(false);
    }
  };

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
      const { error } = await supabase.from('school_settings').update({ name: schoolName.trim() }).eq('school_id', schoolSettings.school_id);
      if (error) throw error;
      setSchoolSettings({ ...schoolSettings, name: schoolName.trim() });
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

      const { error: uploadErr } = await supabase.storage.from('school_assets').upload(path, file, { upsert: true, cacheControl: '0' });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('school_assets').getPublicUrl(path);
      const freshUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      const { error: dbErr } = await supabase.from('school_settings').update({ logo_url: freshUrl }).eq('school_id', schoolSettings.school_id);
      if (dbErr) throw dbErr;

      setLogoUrl(freshUrl);
      setSchoolSettings({ ...schoolSettings, logo_url: freshUrl });
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ── Password ── */
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

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

  /* ── Modules Toggle ── */
  const ALL_MODULES = [
    // Legacy Modules
    { id: 'attendance', label: "Attendance" },
    { id: 'fees', label: "Fees" },
    { id: 'calendar', label: "Calendar" },
    { id: 'notices', label: "Notices" },
    { id: 'gallery', label: "Gallery" },
    { id: 'timetable', label: "Timetable" },
    { id: 'off_classes', label: "Off Classes" },
    { id: 'leaves', label: "Leaves" },
    { id: 'reports', label: "Reports" },
    
    // New/Optional Modules
    { id: 'principals_desk', label: "Principal's Desk" },
    { id: 'lost_found', label: "Lost & Found" },
    { id: 'bus_alerts', label: "Bus Alerts" },
    { id: 'syllabus', label: "Syllabus Tracker" },
    { id: 'duty_radar', label: "Duty Radar" },
    { id: 'exec_briefing', label: "Exec Briefing" },
    { id: 'mood_note', label: "Mood Note" },
  ];
  const [togglingModule, setTogglingModule] = useState(null);

  const handleToggleModule = async (moduleId) => {
    setTogglingModule(moduleId);
    try {
      const currentActive = schoolSettings?.modules_active || [];
      const newActive = currentActive.includes(moduleId)
        ? currentActive.filter(id => id !== moduleId)
        : [...currentActive, moduleId];

      const { error } = await supabase
        .from('school_settings')
        .update({ modules_active: newActive })
        .eq('school_id', schoolSettings.school_id);
      
      if (error) throw error;
      setSchoolSettings({ ...schoolSettings, modules_active: newActive });
    } catch (err) {
      alert('Error updating module: ' + err.message);
    } finally {
      setTogglingModule(null);
    }
  };

  /* ──────── RENDER ──────── */
  return (
    <div className="space-y-4 fade-in pb-12 max-w-2xl mx-auto">

      {/* Page Header */}
      <div className="section-title" style={{ padding: '0 8px', marginTop: '16px' }}>
        <h3>{t.settings}</h3>
      </div>

      {/* ── 1. SCHOOL IDENTITY ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><Building size={20} /></div>
          <div className="text-content">
            <h4>{t.schoolIdentity}</h4>
            <p>Manage your school's basic information</p>
          </div>
          <ChevronRight size={20} className="text-muted" />
        </div>

        <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
          <label className="muted small block" style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--text-main)' }}>{t.schoolName}</label>
          <input
            type="text"
            value={schoolName}
            onChange={e => setSchoolName(e.target.value)}
            placeholder={t.schoolNamePlaceholder}
            className="sp-input block w-full"
            style={{ marginBottom: '12px' }}
          />
          <button onClick={handleSaveSchoolName} disabled={savingName} className="btn accent w-full">
            <Save size={16} /> {savingName ? t.saving : t.saveName}
          </button>
        </div>

        <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--card-border)', marginTop: '16px' }}>
          {/* Logo Preview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="School Logo"
                  style={{ width: '48px', height: '48px', objectFit: 'contain', background: '#fff', borderRadius: '12px', padding: '4px' }}
                />
              ) : (
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--input-bg)', display: 'grid', placeItems: 'center' }}>
                   <ImageIcon size={20} color="var(--text-muted)" />
                </div>
              )}
              <span style={{ fontWeight: 600, fontSize: '15px' }}>{t.currentLogo}</span>
            </div>
            <button className="btn success" style={{ width: 'auto', padding: '8px', borderRadius: '12px' }}>
              <MoreHorizontal size={20} />
            </button>
          </div>

          {/* Upload Button */}
          <div style={{ position: 'relative' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: uploadingLogo ? 'not-allowed' : 'pointer', zIndex: 1 }}
            />
            <button className="btn outline w-full" disabled={uploadingLogo} style={{ height: '64px', flexDirection: 'column', gap: '4px', pointerEvents: 'none' }}>
              {uploadingLogo
                ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Loader2 size={16} className="animate-spin" /> {t.uploading}</div>
                : <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Upload size={16} /> {t.uploadLogo}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>JPG, PNG or SVG (Max. 2MB)</div>
                  </>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. THEME ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
        <div className="icon-box"><Sun size={20} /></div>
        <div className="text-content" style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{t.theme}</h4>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Choose your preferred appearance</p>
        </div>
        <div style={{ width: '130px' }}>
          <select value={theme} onChange={e => applyTheme(e.target.value)} className="sp-input">
            <option value="light">{t.themeLight}</option>
            <option value="dark">{t.themeDark}</option>
          </select>
        </div>
      </div>

      {/* ── 3. LANGUAGE ── */}
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

      {/* ── 4. CHANGE PASSWORD ── */}
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
        
        <button onClick={handleChangePassword} disabled={pwdLoading} className="btn accent w-full">
          <Lock size={16} /> {pwdLoading ? t.savingPassword : t.savePassword}
        </button>
      </div>

      {/* ── 5. DATA MANAGEMENT ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><Database size={20} /></div>
          <div className="text-content">
            <h4>{t.dataManagement}</h4>
            <p>{t.dataDesc}</p>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn outline w-full">
          <Upload size={16} /> {exporting ? t.exporting : t.exportJson}
        </button>
      </div>

      {/* ── MODULE SETTINGS ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><ToggleLeft size={20} /></div>
          <div className="text-content">
            <h4>Active Modules</h4>
            <p>Turn optional platform features on or off.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {ALL_MODULES.map(mod => {
            const isActive = (schoolSettings?.modules_active || []).includes(mod.id);
            return (
              <div key={mod.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50">
                <span className="font-semibold text-sm text-slate-700">{mod.label}</span>
                <button
                  onClick={() => handleToggleModule(mod.id)}
                  disabled={togglingModule === mod.id}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>



      {/* ── 5.5 GOOGLE DRIVE STORAGE ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><HardDrive size={20} /></div>
          <div className="text-content">
            <h4>Google Drive Storage</h4>
            <p>Connect Google Drive for zero-cost gallery storage.</p>
          </div>
        </div>
        
        {(() => {
          const drives = Array.isArray(schoolSettings?.gdrive_config) ? schoolSettings.gdrive_config : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
          return (
            <div className="flex flex-col gap-3 mt-4">
              {drives.map((drive, idx) => (
                 <div key={drive.id || idx} className="p-4 border border-green-500/30 bg-green-500/10 rounded-xl flex items-center justify-between">
                   <div className="text-sm">
                     <div className="font-bold text-green-600">Connected</div>
                     <div className="text-slate-500 text-[10px] mt-1 break-all">
                        {drive.email ? <strong>{drive.email}</strong> : `Folder ID: ${drive.folder_id}`}
                     </div>
                     {drive.storageQuota && (
                        <div className="text-slate-500 text-[10px] mt-2 flex items-center gap-2">
                           <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500" style={{ width: `${Math.min(100, (drive.storageQuota.usage / Math.max(1, drive.storageQuota.limit)) * 100)}%` }}></div>
                           </div>
                           <span>{Math.round((drive.storageQuota.usage || 0)/1024/1024/1024)}GB / {Math.round((drive.storageQuota.limit || 0)/1024/1024/1024)}GB</span>
                        </div>
                     )}
                   </div>
                   <button 
                     onClick={() => handleDisconnectDrive(idx)} 
                     disabled={disconnectingDrive}
                     className="btn danger"
                     style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}
                   >
                     {disconnectingDrive ? 'Disconnecting...' : 'Disconnect'}
                   </button>
                 </div>
              ))}
              
              <button 
                onClick={handleConnectDrive} 
                disabled={connectingDrive} 
                className="btn outline w-full flex justify-center items-center gap-2 mt-2"
              >
                {connectingDrive ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 
                {drives.length > 0 ? 'Add Another Drive' : 'Connect School Google Drive'}
              </button>
            </div>
          )
        })()}
      </div>

      {/* ── 5.6 HELP & SUPPORT ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><HelpCircle size={20} /></div>
          <div className="text-content">
            <h4>Help & Support</h4>
            <p>Need help? Submit a ticket to the Platform Admin.</p>
          </div>
        </div>
        <button onClick={() => setShowSupportModal(true)} className="btn outline w-full mt-2">
          Contact Support
        </button>
      </div>

      {/* ── 5.7 ABOUT PLATFORM (LEGAL) ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><FileText size={20} /></div>
          <div className="text-content">
            <h4>About {platformSettings?.app_name || 'SchoolOS+'}</h4>
            <p>Platform information and terms of service</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {platformSettings?.about_app && (
            <button className="btn outline w-full text-left justify-start" onClick={() => setLegalTab('about')}>
              <FileText size={16} /> About App
            </button>
          )}
          {platformSettings?.terms_conditions && (
            <button className="btn outline w-full text-left justify-start" onClick={() => setLegalTab('terms')}>
              <FileText size={16} /> Terms & Conditions
            </button>
          )}
          {platformSettings?.refund_policy && (
            <button className="btn outline w-full text-left justify-start" onClick={() => setLegalTab('refund')}>
              <FileText size={16} /> Refund Policy
            </button>
          )}
          {platformSettings?.privacy_policy && (
            <button className="btn outline w-full text-left justify-start" onClick={() => setLegalTab('privacy')}>
              <FileText size={16} /> Privacy Policy
            </button>
          )}
        </div>
      </div>

      {/* ── 6. DANGER ZONE ── */}
      <div className="card" style={{ backgroundColor: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
        <div className="settings-header" style={{ marginBottom: '16px' }}>
          <div className="icon-box danger"><ShieldAlert size={20} /></div>
          <div className="text-content">
            <h4 style={{ color: 'var(--danger)' }}>{t.dangerZone}</h4>
            <p style={{ color: 'var(--danger)' }}>{t.dangerDesc}</p>
          </div>
        </div>
        <button className="btn danger w-full" onClick={() => setShowResetModal(true)}>
          <Trash2 size={16} /> {t.resetAll}
        </button>
      </div>

      {/* ── 7. APP VERSION ── */}
      <div style={{ textAlign: 'center', marginTop: '32px', marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 700 }}>
            SchoolOS+ {appVersion || 'Loading...'}
          </span>
          <span style={{
            fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            color: 'white', padding: '2px 7px', borderRadius: '999px'
          }}>Latest</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Silent in-app updates enabled</span>
      </div>

      {/* ── RESET MODAL ── */}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', borderLeft: '4px solid #ef4444' }}>
            <h3 style={{ marginBottom: '8px' }}>{t.confirmTitle}</h3>
            <p className="muted small" style={{ marginBottom: '18px' }}>{t.confirmDesc}</p>
            <form onSubmit={handleReset}>
              <label className="muted small block" style={{ marginBottom: '6px' }}>{t.confirmPwdLabel}</label>
              <input type="password" required autoFocus value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="••••••••" className="sp-input block w-full mb-4" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => { setShowResetModal(false); setConfirmPwd(''); }}>{t.abort}</button>
                <button type="submit" disabled={resetting} className="btn danger" style={{ flex: 2 }}>{resetting ? t.purging : t.confirmPurge}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── SUPPORT MODAL ── */}
      {showSupportModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px' }}>
            <h3 style={{ marginBottom: '8px' }}>Submit Support Ticket</h3>
            <p className="muted small" style={{ marginBottom: '18px' }}>Describe your issue and the Platform Admin will respond to you.</p>
            <form onSubmit={handleSubmitTicket}>
              <label className="muted small block" style={{ marginBottom: '6px' }}>Subject</label>
              <input type="text" required value={supportSubject} onChange={e => setSupportSubject(e.target.value)} placeholder="e.g. Billing Issue" className="sp-input block w-full mb-4" />
              
              <label className="muted small block" style={{ marginBottom: '6px' }}>Message</label>
              <textarea required rows={4} value={supportMessage} onChange={e => setSupportMessage(e.target.value)} placeholder="Describe the problem in detail..." className="sp-input block w-full mb-6" />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => { setShowSupportModal(false); setSupportSubject(''); setSupportMessage(''); }}>Cancel</button>
                <button type="submit" disabled={submittingTicket} className="btn accent" style={{ flex: 2 }}>
                  {submittingTicket ? 'Submitting...' : <><Send size={16} /> Submit Ticket</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── LEGAL MODAL ── */}
      {legalTab && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card flex flex-col" style={{ width: '100%', maxWidth: '600px', maxHeight: '80vh' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0">
                {legalTab === 'about' ? 'About App' : 
                 legalTab === 'terms' ? 'Terms & Conditions' : 
                 legalTab === 'refund' ? 'Refund Policy' : 
                 'Privacy Policy'}
              </h3>
              <button onClick={() => setLegalTab(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-600 whitespace-pre-wrap flex-1">
              {legalTab === 'about' ? platformSettings?.about_app : 
               legalTab === 'terms' ? platformSettings?.terms_conditions : 
               legalTab === 'refund' ? platformSettings?.refund_policy : 
               platformSettings?.privacy_policy}
            </div>
            <button onClick={() => setLegalTab(null)} className="btn outline w-full mt-4">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

