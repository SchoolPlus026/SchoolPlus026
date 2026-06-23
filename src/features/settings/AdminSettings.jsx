import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { 
  Building, Sun, Globe, Lock, Database, ShieldAlert, 
  Upload, Save, Eye, EyeOff, MoreHorizontal, ChevronRight, Loader2, Image as ImageIcon, Trash2, HardDrive, HelpCircle, FileText, Send, Plus, X,
  Phone, Mail, MapPin, Sparkles
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { logAuditAction } from '../../utils/auditLogger';
import { usePlan } from '../../hooks/usePlan';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import BiometricSetup from './BiometricSetup';
import RecoverySetup from './RecoverySetup';
import WebSyncPanel from './WebSyncPanel';
import ArchiveConsole from './ArchiveConsole';
import { useToast } from '../../components/ToastProvider';

/* ── Protected Demo Schools (Sales Protection) ── */
const PROTECTED_SCHOOL_CODES = ['120', '777'];

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
  const { user, role, schoolSettings, setSchoolSettings } = useAppStore();
  const userRole = (role || '').toLowerCase();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFree } = usePlan();
  const { addToast } = useToast();
  const [apkUrl, setApkUrl] = useState(null);

  // Email & Google OAuth states
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [linkingLoading, setLinkingLoading] = useState(false);
  const [profileEmail, setProfileEmail] = useState(user?.email || '');

  React.useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('users')
      .select('email')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.email) {
          setProfileEmail(data.email);
        }
      });

    supabase.auth.getUser().then(({ data: { user: freshUser } }) => {
      if (freshUser) {
        const currentUser = useAppStore.getState().user;
        useAppStore.getState().setUserAndRole({
          ...freshUser,
          class: currentUser?.class || null,
          avatar_url: currentUser?.avatar_url || null,
          avatar_file_id: currentUser?.avatar_file_id || null,
          hide_avatar_from_class: !!currentUser?.hide_avatar_from_class
        }, role);
      }
    });
  }, [user?.id, role]);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailLoading(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      const { error } = await supabase.rpc('update_user_email_direct', { p_email: newEmail.trim() });
      if (error) throw error;

      // Clear profile cache so next app load fetches fresh email
      useAppStore.getState().setProfileLastFetched(null);

      // Refresh cached user in Zustand store
      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (freshUser) {
        const currentUser = useAppStore.getState().user;
        useAppStore.getState().setUserAndRole({
          ...freshUser,
          class: currentUser?.class || null,
          avatar_url: currentUser?.avatar_url || null,
          avatar_file_id: currentUser?.avatar_file_id || null,
          hide_avatar_from_class: !!currentUser?.hide_avatar_from_class
        }, role);
      }

      setEmailSuccess('Email updated successfully!');
      setNewEmail('');
      window.location.reload();
    } catch (err) {
      setEmailError(err.message || 'Failed to update email.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingLoading(true);
    try {
      const redirectUrl = Capacitor.isNativePlatform() 
        ? 'schoolosplus://dashboard' 
        : `${window.location.origin}/dashboard`;

      if (Capacitor.isNativePlatform()) {
        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (data?.url) {
          await Browser.open({ url: data.url });
        } else {
          throw new Error('Google link URL not found.');
        }
      } else {
        const { error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectUrl
          }
        });
        if (error) throw error;
      }
      // Clear cache so identity list is always re-fetched after Google link returns
      useAppStore.getState().setProfileLastFetched(null);
    } catch (err) {
      if (err.message && err.message.includes('Manual linking is disabled')) {
        alert('Manual identity linking is disabled in your Supabase project configuration. To enable it, go to Authentication > Sign In / Providers in your Supabase Dashboard and enable "Allow manual linking".');
      } else {
        alert(`Linking Google failed: ${err.message}`);
      }
    } finally {
      setLinkingLoading(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Google account? You will need to use your password to log in.')) return;
    setLinkingLoading(true);
    try {
      // Refresh session first to avoid 'Auth session missing' on stale tokens
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw new Error('Session expired. Please log in again before disconnecting Google.');

      const { data: { user: freshUser }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const googleIdentity = freshUser?.identities?.find(id => id.provider === 'google');
      if (!googleIdentity) {
        throw new Error('Google account is not currently linked.');
      }
      const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
      if (error) throw error;

      // Clear cache and update store with fresh user
      useAppStore.getState().setProfileLastFetched(null);
      const { data: { user: updatedUser } } = await supabase.auth.getUser();
      if (updatedUser) {
        const currentUser = useAppStore.getState().user;
        useAppStore.getState().setUserAndRole({
          ...updatedUser,
          class: currentUser?.class || null,
          avatar_url: currentUser?.avatar_url || null,
          avatar_file_id: currentUser?.avatar_file_id || null,
          hide_avatar_from_class: !!currentUser?.hide_avatar_from_class
        }, role);
      }

      alert('Google account disconnected successfully.');
      window.location.reload();
    } catch (err) {
      alert(`Disconnecting Google failed: ${err.message}`);
    } finally {
      setLinkingLoading(false);
    }
  };

  /* ── Google Drive State ── */
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  /* ── Platform Settings & Legal ── */
  const [platformSettings, setPlatformSettings] = useState(null);

  /* ── Support Ticket State ── */
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showContactDetailsModal, setShowContactDetailsModal] = useState(false);
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

      supabase.from('app_versions')
        .select('apk_url')
        .order('version_code', { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data?.apk_url) setApkUrl(data.apk_url);
        });
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
    } catch (error) {
      alert('Error submitting ticket: ' + error.message);
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleWhatsAppClick = () => {
    const rawNumber = platformSettings?.contact_number || '';
    const cleanNumber = rawNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      alert('No contact number available for WhatsApp.');
      return;
    }
    const waUrl = `https://wa.me/${cleanNumber}`;
    window.open(waUrl, '_blank');
  };

  const handleConnectDrive = async () => {
    const drives = Array.isArray(schoolSettings?.gdrive_config) ? schoolSettings.gdrive_config : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
    if (isFree && drives.length >= 3) {
       setShowUpgradeModal(true);
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
  const [dangerPwd, setDangerPwd] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const checkForUpdates = async () => {
    if (!Capacitor.isNativePlatform()) {
      addToast({ type: 'info', message: 'Updates are handled automatically on the web.' });
      return;
    }
    setCheckingUpdate(true);
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { FileOpener } = await import('@capacitor-community/file-opener');
      const info = await App.getInfo();
      const localVersionCode = parseInt(info.build, 10);

      const { data, error } = await supabase
        .from('app_versions')
        .select('version_code, version_name, apk_url')
        .order('version_code', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        addToast({ type: 'error', message: 'Failed to check for updates. Try again.' });
        setCheckingUpdate(false);
        return;
      }

      if (Number(data.version_code) <= Number(localVersionCode)) {
        addToast({ type: 'success', message: 'You are on the latest version.' });
        setCheckingUpdate(false);
        return;
      }

      // Update available
      addToast({ type: 'info', message: `Downloading v${data.version_name}… Please wait.`, duration: 3000 });

      const fileName = `SchoolOS_Update_v${data.version_name}.apk`;
      
      const downloadResult = await Filesystem.downloadFile({
        url: data.apk_url,
        path: fileName,
        directory: Directory.Cache
      });

      addToast({ type: 'success', message: 'Download complete! Opening installer…' });
      
      await FileOpener.open({
        filePath: downloadResult.path,
        contentType: 'application/vnd.android.package-archive',
        openWithDefault: true
      });

    } catch (err) {
      console.error('[AdminSettings] Update download failed:', err);
      addToast({ type: 'error', message: 'Download failed: ' + (err?.message || 'Unknown error') });
    }
    setCheckingUpdate(false);
  };
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
  const [showDemoLockModal, setShowDemoLockModal] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState('');
  const [resetting, setResetting]   = useState(false);

  const handleOpenResetModal = () => {
    // Check if this is a protected demo/test school
    const code = String(schoolSettings?.school_code || '').trim();
    if (PROTECTED_SCHOOL_CODES.includes(code)) {
      setShowDemoLockModal(true);
    } else {
      setShowResetModal(true);
    }
  };

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

  /* ── Scroll Lock ── */
  React.useEffect(() => {
    const isAnyModalOpen = showResetModal || showSupportModal || showDemoLockModal || !!legalTab || showContactDetailsModal || showUpgradeModal;
    const mainEl = document.querySelector('main');
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      if (mainEl) mainEl.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (mainEl) mainEl.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      if (mainEl) mainEl.style.overflow = '';
    };
  }, [showResetModal, showSupportModal, showDemoLockModal, legalTab, showContactDetailsModal, showUpgradeModal]);

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

        <button onClick={handleChangePassword} disabled={pwdLoading} className="btn accent w-full mt-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {pwdLoading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          {pwdLoading ? 'Updating...' : 'Update Password'}
        </button>
        
      </div>

      {/* ── 3.5 ACCOUNT & RECOVERY SETTINGS ── */}
      <div className="card">
        <div className="settings-header" style={{ marginBottom: '20px' }}>
          <div className="icon-box" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}><Lock size={20} /></div>
          <div className="text-content">
            <h4>Account & Recovery Settings</h4>
            <p>Manage your linked Google account and update recovery email</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          {/* Change Email Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>Change/Update Email</h5>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Change the email address associated with your account. A verification link will be sent to both your current and new email address.
            </p>
            <form onSubmit={handleUpdateEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Current Email</label>
                <div className="sp-input" style={{ fontSize: '13px', fontWeight: 600, padding: '10px 14px', background: 'var(--accent-light)', opacity: 0.8, borderRadius: '12px' }}>
                  {profileEmail || user?.email || 'No email registered'}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>New Email Address</label>
                <input 
                  type="email" 
                  required 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  className="sp-input" 
                  style={{ fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                  placeholder="Enter new email address" 
                />
              </div>
              {emailError && <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--danger)' }}>{emailError}</div>}
              {emailSuccess && <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', lineHeight: '1.4' }}>{emailSuccess}</div>}
              <button 
                type="submit" 
                disabled={emailLoading}
                className="btn accent"
                style={{ fontSize: '12px', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
              >
                {emailLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Send Verification Email
              </button>
            </form>
          </div>

          {/* Google OAuth Section */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContext: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>Google Login Integration</h5>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                Link your Google account to log in with a single click. When linked, you can bypass typing your username and password.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-main)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: user?.identities?.some(id => id.provider === 'google') ? '#10b981' : '#64748b', boxShadow: user?.identities?.some(id => id.provider === 'google') ? '0 0 8px rgba(16,185,129,0.6)' : 'none' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {user?.identities?.some(id => id.provider === 'google') 
                     ? 'Google Account Connected' 
                     : 'Google Account Disconnected'}
                </span>
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
              {user?.identities?.some(id => id.provider === 'google') ? (
                <button 
                  type="button"
                  onClick={handleUnlinkGoogle}
                  disabled={linkingLoading}
                  className="btn danger"
                  style={{ fontSize: '12px', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
                >
                  {linkingLoading && <Loader2 size={14} className="animate-spin" />}
                  Disconnect Google Account
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={handleLinkGoogle}
                  disabled={linkingLoading}
                  className="btn accent"
                  style={{ fontSize: '12px', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
                >
                  {linkingLoading && <Loader2 size={14} className="animate-spin" />}
                  Connect Google Account
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4.5 BIOMETRIC SETUP ── */}
      <BiometricSetup />

      {/* ── 4.6 ACCOUNT RECOVERY SETUP ── */}
      <RecoverySetup />

      {/* ── 4.7 WEB PC SYNC PANEL ── */}
      <WebSyncPanel />

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

      {/* ── 5.4 ACADEMIC YEAR ARCHIVAL ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
            <HardDrive size={20} />
          </div>
          <div className="text-content">
            <h4>Academic Year Archival</h4>
            <p>Archive past year data to free storage &amp; download secure JSON snapshots.</p>
          </div>
        </div>
        <div className="mt-4">
          <ArchiveConsole />
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
              
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mt-2">
                <button 
                  onClick={handleConnectDrive} 
                  disabled={connectingDrive} 
                  className="btn outline flex-1 flex justify-center items-center gap-2"
                  style={{ width: '100%' }}
                >
                  {connectingDrive ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 
                  {drives.length > 0 ? 'Add Another Drive' : 'Connect School Google Drive'}
                </button>
                {isFree ? (
                  <span className="text-sm font-semibold text-slate-400 whitespace-nowrap bg-slate-800/20 px-3 py-2 rounded-lg border border-slate-700/30">
                    Connected: {drives.length}/3
                  </span>
                ) : (
                  <span className="text-sm font-bold text-amber-500 whitespace-nowrap bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20 flex items-center gap-1.5 animate-pulse" style={{ color: '#f59e0b' }}>
                    <Sparkles size={14} /> Unlimited drives
                  </span>
                )}
              </div>
              {!isFree && (
                <div className="text-[10px] font-bold mt-1 px-1 flex items-center gap-1 animate-pulse" style={{ color: '#f59e0b' }}>
                  <Sparkles size={10} /> Unlimited Storage & GDrive Connections
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── 5.6 CONTACT US ── */}
      <div className="card">
        <div className="settings-header">
          <div className="icon-box"><HelpCircle size={20} /></div>
          <div className="text-content">
            <h4>Contact Us</h4>
            <p>Need help? Reach out to support or view official details.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button onClick={() => setShowSupportModal(true)} className="btn outline w-full text-left justify-start">
            <Send size={16} /> Contact Support
          </button>
          <button onClick={() => setShowContactDetailsModal(true)} className="btn outline w-full text-left justify-start">
            <Phone size={16} /> Contact Details
          </button>
        </div>
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

          {platformSettings?.refund_policy && (userRole === 'admin' || userRole === 'platform_admin') && (
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
        <button className="btn danger w-full" onClick={handleOpenResetModal}>
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
        {Capacitor.isNativePlatform() ? (
          <button
            onClick={checkForUpdates}
            disabled={checkingUpdate}
            className="btn outline"
            style={{ width: '100%', maxWidth: '260px', marginTop: '12px' }}
          >
            {checkingUpdate ? '⬇️ Downloading…' : '🔍 Check for Updates'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', width: '100%', justifyContent: 'center', marginTop: '12px' }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('show-pwa-install-modal'))}
              className="btn accent"
              style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '12px', width: '100%', maxWidth: '220px' }}
            >
              📱 Add to Home Screen (PWA)
            </button>
            {apkUrl && (
              <a
                href={apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn outline"
                style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '12px', width: '100%', maxWidth: '220px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
              >
                ⬇️ Download Android APK
              </a>
            )}
          </div>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Silent in-app updates enabled</span>
      </div>

      {/* ── RESET MODAL ── */}
      {showResetModal && createPortal(
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
        </div>,
        document.body
      )}

      {/* ── DEMO LOCK MODAL (Sales Protection — School Codes 120 & 777) ── */}
      {showDemoLockModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.70)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px', borderLeft: '4px solid #6366f1', textAlign: 'center', padding: '32px 24px' }}>
            {/* Lock Icon */}
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px', lineHeight: 1.3 }}>Delete Function Temporarily Locked</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px' }}>
              This is <strong>test data</strong>, so the delete function is temporarily locked to prevent accidental wipes.
              However, in your <strong>actual registered school</strong>, there will be no locks — you will have
              <strong> full control</strong> to permanently delete your data anytime.
            </p>
            <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: '12px', padding: '12px 16px', marginBottom: '24px', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600, margin: 0 }}>💡 This demo environment is kept intact so you can freely explore all features without risk.</p>
            </div>
            <button
              onClick={() => setShowDemoLockModal(false)}
              className="btn accent w-full"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderColor: 'transparent' }}
            >
              Got it, Continue Exploring
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── SUPPORT MODAL ── */}
      {showSupportModal && createPortal(
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
        </div>,
        document.body
      )}

      {/* ── UPGRADE PLAN MODAL ── */}
      {showUpgradeModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card flex flex-col items-center text-center" style={{ width: '100%', maxWidth: '440px', border: '1px solid rgba(245, 158, 11, 0.35)', boxShadow: '0 10px 40px rgba(245, 158, 11, 0.15)' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', marginBottom: '16px' }}>
              <Sparkles size={32} className="animate-pulse" />
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>Upgrade to Premium</h3>
            <p className="muted small" style={{ marginBottom: '24px', lineHeight: 1.5 }}>
              You have reached the maximum limit of **3 Google Drive connections** allowed on the Free plan. Upgrade to Premium for unlimited storage, unlimited connections, real-time bus tracking, and full analytics.
            </p>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button 
                type="button" 
                className="btn outline" 
                style={{ flex: 1 }} 
                onClick={() => setShowUpgradeModal(false)}
              >
                Dismiss
              </button>
              <button 
                type="button" 
                className="btn accent" 
                style={{ flex: 2, background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#fff' }} 
                onClick={() => {
                  setShowUpgradeModal(false);
                  window.location.href = '/admin/billing';
                }}
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── CONTACT DETAILS MODAL ── */}
      {showContactDetailsModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
          <div className="card flex flex-col" style={{ width: '100%', maxWidth: '460px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0">Contact Details</h3>
              <button onClick={() => setShowContactDetailsModal(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200" style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-3 text-sm flex-1">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                <Building size={18} className="text-slate-400 mt-0.5" />
                <div>
                  <span className="muted small block font-semibold mb-0.5">Developer</span>
                  <span className="font-semibold text-slate-800 text-base">{platformSettings?.developer_name || 'SchoolOS+ Developer'}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-slate-400 mt-0.5" />
                  <div>
                    <span className="muted small block font-semibold mb-0.5">Contact Number</span>
                    <span className="font-semibold text-slate-800 text-base">{platformSettings?.contact_number || 'Not Available'}</span>
                  </div>
                </div>
                {platformSettings?.contact_number && (
                  <button 
                    onClick={handleWhatsAppClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-semibold transition-all hover:opacity-90 active:scale-95"
                    style={{ 
                      backgroundColor: '#25D366', 
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.335 4.991L2 22l5.133-1.347A9.953 9.953 0 0 0 12.01 22c5.508 0 9.99-4.478 9.99-9.986 0-2.67-1.037-5.18-2.92-7.062A9.925 9.925 0 0 0 12.012 2zm5.727 14.18c-.313.882-1.815 1.706-2.5 1.764-.685.059-1.336.294-4.385-.97-3.666-1.52-5.908-5.32-6.09-5.566-.184-.247-1.48-1.968-1.48-3.753 0-1.786.93-2.664 1.263-3.018.33-.353.72-.44.96-.44.24 0 .48 0 .69.01.22.01.51-.08.8.61.3.73 1.02 2.48 1.11 2.66.09.18.15.39.03.63-.12.24-.18.38-.36.59-.18.21-.38.47-.54.63-.18.18-.37.38-.16.74.21.36.93 1.53 1.99 2.48 1.36 1.22 2.51 1.6 2.87 1.78.36.18.57.15.78-.09.21-.24.9-1.05 1.14-1.41.24-.36.48-.3.8-.18.33.12 2.07 1.02 2.43 1.2.36.18.6.27.69.42.09.15.09.88-.22 1.76z"/>
                    </svg>
                    WhatsApp
                  </button>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                <Mail size={18} className="text-slate-400 mt-0.5" />
                <div>
                  <span className="muted small block font-semibold mb-0.5">Email Address</span>
                  <span className="font-semibold text-slate-800 text-base">{platformSettings?.contact_email || 'Not Available'}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                <MapPin size={18} className="text-slate-400 mt-0.5" />
                <div>
                  <span className="muted small block font-semibold mb-0.5">Address</span>
                  <span className="font-semibold text-slate-800 text-base">{platformSettings?.contact_address || 'Parli Vaijnath, Maharashtra'}</span>
                </div>
              </div>
            </div>
            
            <button onClick={() => setShowContactDetailsModal(false)} className="btn outline w-full mt-4">Close</button>
          </div>
        </div>,
        document.body
      )}

      {/* ── LEGAL MODAL ── */}
      {legalTab && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
}

