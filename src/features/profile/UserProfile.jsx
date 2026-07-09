import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { User, Loader2, Mail, Phone, MapPin, Briefcase, Calendar, Info, GraduationCap, FileText, Users, BookOpen, Award, Star, Camera, Trash2, Lock, Smartphone, Download, ChevronDown, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const isMobileOrPWA = () => {
  if (Capacitor.isNativePlatform()) return true;
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isMobileOS = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const hasTouch = navigator.maxTouchPoints > 0;
  return isMobileOS || hasTouch;
};

// Client-side image compression utility
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function UserProfile() {
  const { user, role, schoolSettings, platformSettings, setUserAndRole } = useAppStore();
  const [profile, setProfile] = useState(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef(null);

  // Email & Google OAuth states
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [linkingLoading, setLinkingLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Edit Profile modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleOpenEditModal = () => {
    setEditEmail(profile?.email || '');
    setEditContact(profile?.contact || '');
    setEditUsername(profile?.username || '');
    setIsEditModalOpen(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const code = String(schoolSettings?.school_code || '').trim();
    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
    if (isDemoAndDisabled) {
      const cleanUsername = editUsername.trim().toLowerCase();
      const cleanEmail = editEmail.trim().toLowerCase();
      const origUsername = (profile?.username || '').toLowerCase();
      const origEmail = (profile?.email || '').toLowerCase();
      if (cleanUsername !== origUsername || cleanEmail !== origEmail) {
        setShowDemoModal(true);
        return;
      }
    }
    if (!editEmail.trim() || !editEmail.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    
    setEditSaving(true);
    try {
      let usernameChangedNow = false;
      const cleanUsername = editUsername.trim().toLowerCase();
      
      // Username rule validation
      if (cleanUsername !== (profile?.username || '').toLowerCase()) {
        if (profile?.username_changed) {
          throw new Error('You have already changed your username once. It is locked.');
        }
        
        // Check uniqueness in same school tenant
        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .eq('username', cleanUsername)
          .eq('school_id', profile?.school_id)
          .not('id', 'eq', profile?.id)
          .maybeSingle();
          
        if (existing) {
          throw new Error('This username is already taken. Please choose a different one.');
        }
        usernameChangedNow = true;
      }

      // Email update
      let emailChangedNow = false;
      const cleanEmail = editEmail.trim();
      if (cleanEmail !== (profile?.email || '')) {
        const { error: emailErr } = await supabase.rpc('update_user_email_direct', { p_email: cleanEmail });
        if (emailErr) throw emailErr;
        emailChangedNow = true;
      }

      // Update contact and username
      const updates = {
        contact: editContact.trim()
      };
      if (usernameChangedNow) {
        updates.username = cleanUsername;
        updates.username_changed = true;
      }

      const { error: updateErr } = await supabase
        .from('users')
        .update(updates)
        .eq('id', profile?.id);

      if (updateErr) throw updateErr;

      setProfile(prev => ({
        ...prev,
        contact: editContact.trim(),
        ...(usernameChangedNow ? { username: cleanUsername, username_changed: true } : {}),
        ...(emailChangedNow ? { email: cleanEmail } : {})
      }));

      // Invalidate profile fetching cache
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

      alert('Profile updated successfully!');
      setIsEditModalOpen(false);
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // APK download states
  const [apkUrl, setApkUrl] = useState(null);
  const [apkLoading, setApkLoading] = useState(false);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    const code = String(schoolSettings?.school_code || '').trim();
    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
    if (isDemoAndDisabled) {
      setShowDemoModal(true);
      return;
    }
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
        : `${window.location.origin}${window.location.pathname}`;

      if (Capacitor.isNativePlatform()) {
        const browserFinishedListener = await Browser.addListener('browserFinished', () => {
          setLinkingLoading(false);
          browserFinishedListener.remove();
        });

        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true
          }
        });
        if (error) {
          browserFinishedListener.remove();
          throw error;
        }
        if (data?.url) {
          await Browser.open({ url: data.url });
        } else {
          browserFinishedListener.remove();
          throw new Error('Google link URL not found.');
        }
      } else {
        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (data?.url) {
          const width = 500;
          const height = 600;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          const popup = window.open(
            data.url,
            'google-oauth',
            `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
          );
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            // Popup was blocked — fallback to full page redirect
            window.location.href = data.url;
          }
        } else {
          throw new Error('Google link URL not found.');
        }
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
      if (!Capacitor.isNativePlatform()) {
        setLinkingLoading(false);
      }
    }
  };

  const handleUnlinkGoogle = async () => {
    const code = String(schoolSettings?.school_code || '').trim();
    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
    if (isDemoAndDisabled) {
      setShowDemoModal(true);
      return;
    }
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

      // Get fresh user with updated identities from the server
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

      // Clear cache so identity list is re-fetched on reload/reopen
      useAppStore.getState().setProfileLastFetched(null);

      // Refresh session in background
      await supabase.auth.refreshSession().catch(() => {});

      alert('Google account disconnected successfully.');
    } catch (err) {
      alert(`Disconnecting Google failed: ${err.message}`);
    } finally {
      setLinkingLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { 
        setProfile(data); 
        setLoading(false); 
      })
      .catch(() => { setLoading(false); });

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
  }, [user, role]);

  useEffect(() => {
    setImgError(false);
  }, [profile?.avatar_url]);

  useEffect(() => {
    setApkUrl('https://jbjtvosvwufimjcvvwcg.supabase.co/storage/v1/object/public/app-updates/SchoolOS_Plus.apk');
  }, []);

  const drives = Array.isArray(schoolSettings?.gdrive_config)
    ? schoolSettings.gdrive_config
    : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
  const isPlatformAdmin = role === 'platform_admin';
  const gdriveConnected = drives.length > 0 || isPlatformAdmin;

  // GDrive static CDN thumbnail link formatter
  const getThumbnailLink = (url) => {
    if (!url) return '';
    if (url.includes('drive.google.com/thumbnail') || url.includes('googleusercontent.com')) {
      if (url.includes('&sz=')) {
        return url.replace(/&sz=\w+/, '&sz=w300-h300');
      }
      return `${url}&sz=w300-h300`;
    }
    const match = url.match(/\/d\/(.*?)\//);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w300-h300`;
    }
    if (url.match(/^[a-zA-Z0-9_-]{25,}$/)) {
      return `https://drive.google.com/thumbnail?id=${url}&sz=w300-h300`;
    }
    return url;
  };

  const triggerFileInput = () => {
    if (!gdriveConnected) {
      alert("Google Drive connection is required to upload profile pictures. Please contact your administrator.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const code = String(schoolSettings?.school_code || '').trim();
    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
    if (isDemoAndDisabled) {
      setShowDemoModal(true);
      if (e.target) e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    setUploading(true);
    try {
      // 1. Client-side Canvas Compression (~30KB-50KB)
      const compressedBase64 = await compressImage(file);

      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      // 2. Resolve or Create Folder
      const folderName = 'SchoolOS Profile Photos';
      const searchRes = await supabase.functions.invoke('gdrive-upload', {
        body: { action: 'search_folder', folderName, driveIndex: 0, school_id: schoolSettings?.school_id },
        headers
      });

      let folderId = searchRes.data?.id;
      if (!folderId) {
        const createRes = await supabase.functions.invoke('gdrive-upload', {
          body: { action: 'create_folder', folderName, driveIndex: 0, school_id: schoolSettings?.school_id },
          headers
        });
        folderId = createRes.data?.id;
        if (!folderId) {
          throw new Error(createRes.error?.message || createRes.data?.error || 'Failed to create folder on Google Drive');
        }
      }

      // 3. Delete old file if present
      if (profile.avatar_file_id) {
        await supabase.functions.invoke('gdrive-upload', {
          body: { action: 'delete_file', fileId: profile.avatar_file_id, driveIndex: 0, school_id: schoolSettings?.school_id },
          headers
        }).catch(err => console.warn('Failed to delete old profile photo:', err));
      }

      // 4. Upload compressed photo
      const cleanFileName = `Profile_${role.toUpperCase()}_${profile.id}_${Date.now()}.jpg`;
      const uploadRes = await supabase.functions.invoke('gdrive-upload', {
        body: {
          action: 'upload_file',
          parentFolderId: folderId,
          fileName: cleanFileName,
          mimeType: 'image/jpeg',
          fileBase64: compressedBase64,
          driveIndex: 0,
          school_id: schoolSettings?.school_id
        },
        headers
      });

      if (uploadRes.error) throw new Error(uploadRes.error.message);
      if (!uploadRes.data?.webViewLink) throw new Error('Upload succeeded but no web link was returned');

      const uploadedUrl = uploadRes.data.thumbnailLink || uploadRes.data.webViewLink;
      const fileIdUploaded = uploadRes.data.id;

      // 5. Update user profile row
      const { error: dbError } = await supabase
        .from('users')
        .update({ avatar_url: uploadedUrl, avatar_file_id: fileIdUploaded })
        .eq('id', profile.id);

      if (dbError) throw dbError;

      setProfile(prev => ({ ...prev, avatar_url: uploadedUrl, avatar_file_id: fileIdUploaded }));
      setUserAndRole({ ...user, avatar_url: uploadedUrl, avatar_file_id: fileIdUploaded }, role);
      alert('Profile picture updated successfully!');
    } catch (err) {
      console.error('Profile image upload failed:', err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    const code = String(schoolSettings?.school_code || '').trim();
    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
    if (isDemoAndDisabled) {
      setShowDemoModal(true);
      return;
    }
    if (!window.confirm('Are you sure you want to remove your profile picture?')) return;
    setUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      // 1. Delete file from GDrive
      if (profile.avatar_file_id) {
        await supabase.functions.invoke('gdrive-upload', {
          body: { action: 'delete_file', fileId: profile.avatar_file_id, driveIndex: 0, school_id: schoolSettings?.school_id },
          headers
        }).catch(err => console.warn('Failed to delete profile photo from Drive:', err));
      }

      // 2. Nullify columns in Supabase
      const { error: dbError } = await supabase
        .from('users')
        .update({ avatar_url: null, avatar_file_id: null })
        .eq('id', profile.id);

      if (dbError) throw dbError;

      setProfile(prev => ({ ...prev, avatar_url: null, avatar_file_id: null }));
      setUserAndRole({ ...user, avatar_url: null, avatar_file_id: null }, role);
      alert('Profile picture removed successfully!');
    } catch (err) {
      console.error('Failed to remove profile picture:', err);
      alert(`Removal failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePrivacyToggle = async (e) => {
    const newValue = e.target.checked;
    try {
      const { error: dbError } = await supabase
        .from('users')
        .update({ hide_avatar_from_class: newValue })
        .eq('id', profile.id);

      if (dbError) throw dbError;

      setProfile(prev => ({ ...prev, hide_avatar_from_class: newValue }));
      setUserAndRole({ ...user, hide_avatar_from_class: newValue }, role);
    } catch (err) {
      console.error('Failed to update privacy setting:', err);
      alert(`Failed to update privacy settings: ${err.message}`);
    }
  };

  if (loading) return (
    <div className="card text-center py-10 muted">
      <Loader2 className="animate-spin mx-auto mb-2" size={24} />
      Loading profile...
    </div>
  );

  if (!profile) return (
    <div className="card muted text-sm text-center">Profile details not found.</div>
  );

  const r = (role || '').toLowerCase();
  
  // Dynamic Initial
  const initial = profile.name ? profile.name.charAt(0).toUpperCase() : (profile.username ? profile.username.charAt(0).toUpperCase() : 'U');

  return (
    <>
      <div className="space-y-6 fade-in pb-10 max-w-4xl mx-auto">
      
      {/* Banner & Avatar (Digital ID Card Header) */}
      <div className="relative overflow-hidden rounded-2xl shadow-xl border border-border bg-[var(--card)]">
        {/* Banner Background */}
        <div className="h-32 md:h-40 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 opacity-90 relative">
          <div className="absolute inset-0 bg-black/20" />
          {/* Subtle pattern / texture could go here */}
        </div>
        
        {/* Profile Info Overlay */}
        <div className="px-6 pb-6 relative">
            {/* Avatar */}
            <div className="absolute -top-24 md:-top-28 bg-[var(--card-bg)] border-[6px] border-[var(--card-bg)] shadow-2xl rounded-3xl w-48 h-48 md:w-56 md:h-56 flex items-center justify-center relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-500/20" />
               {profile.avatar_url && !imgError ? (
                  <img 
                     src={getThumbnailLink(profile.avatar_url)} 
                     alt="Avatar" 
                     className="w-full h-full object-cover z-10 transition-transform duration-300 group-hover:scale-105"
                     referrerPolicy="no-referrer"
                     onError={() => setImgError(true)}
                  />
               ) : (
                  <span className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 z-10">{initial}</span>
               )}

               {/* Upload Overlay */}
               {profile.id === user.id && (
                  <div 
                     className={`absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer ${uploading ? 'opacity-100' : ''}`}
                     onClick={triggerFileInput}
                  >
                     {uploading ? (
                        <Loader2 className="animate-spin text-white" size={24} />
                     ) : (
                        <>
                           <Camera className="text-white mb-1" size={24} />
                           <span className="text-[10px] font-bold text-white uppercase tracking-wider">Change</span>
                        </>
                     )}
                  </div>
               )}
            </div>

            {/* Hidden File Input */}
            <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileChange} 
               accept="image/*" 
               className="hidden" 
            />
            
            <div className="mt-28 md:mt-32 flex items-start justify-between flex-wrap gap-4">
               <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-[var(--text-main)] mb-1">{profile.name || 'Unknown User'}</h2>
                  <div className="flex items-center gap-3">
                     <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)'}}>{profile.role || r.toUpperCase()}</span>
                     <span className="muted small font-medium">@{profile.username || profile.email}</span>
                  </div>
               </div>

               {/* Action Buttons for own profile */}
               {profile.id === user.id && (
                  <div className="flex items-center gap-2 mt-2 sm:mt-4 flex-wrap">
                     <button 
                        onClick={handleOpenEditModal}
                        className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-500/25 text-xs font-black rounded-xl transition-all flex items-center gap-1.5"
                     >
                        <FileText size={14} />
                        Edit Profile
                     </button>
                     {profile.avatar_url && (
                        <button 
                           onClick={handleRemoveAvatar} 
                           disabled={uploading}
                           className="px-3.5 py-2 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-950 dark:text-red-400 border border-red-400 dark:border-red-500/25 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                           {uploading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                           Remove Photo
                        </button>
                     )}
                     <button 
                        onClick={triggerFileInput} 
                        disabled={uploading}
                        className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-950 dark:text-indigo-300 border border-indigo-400 dark:border-indigo-500/25 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                     >
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                        Upload Photo
                     </button>
                  </div>
               )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
         {/* Personal Info Card */}
         <div className="card p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
               <Info size={18} className="text-accent" />
                <h3 className="m-0 text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]/90">Personal Information</h3>
            </div>
            <div className="space-y-4 flex-1">
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><User size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Full Name</div><div className="font-semibold text-[15px] text-[var(--text-main)]">{profile.name || '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Calendar size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Date of Birth</div><div className="font-semibold text-[15px] text-[var(--text-main)]">{profile.dob ? new Date(profile.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Info size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Blood Group</div><div className="font-semibold text-[15px] text-[var(--text-main)] space-x-1">{profile.blood_group ? <span className="text-red-400 font-black">{profile.blood_group}</span> : '—'}</div></div>
               </div>
            </div>
         </div>

         <div className="flex flex-col gap-6">
            {/* Contact Info Card */}
            <div className="card p-6">
               <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
                  <Briefcase size={18} className="text-emerald-400" />
                   <h3 className="m-0 text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]/90">Contact & Address</h3>
               </div>
               <div className="space-y-4">
                  <div className="flex items-start gap-3">
                     <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Phone size={16} className="text-emerald-400/70" /></div>
                     <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Contact Number</div><div className="font-semibold text-[15px] text-[var(--text-main)]">{profile.contact || '—'}</div></div>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><MapPin size={16} className="text-emerald-400/70" /></div>
                     <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Residential Address</div><div className="font-semibold text-[15px] text-[var(--text-main)] leading-relaxed">{profile.address || '—'}</div></div>
                  </div>
               </div>
            </div>

            {/* Academic/Role Details Card */}
            <div className="card p-6 flex-1">
               <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
                  <GraduationCap size={18} className="text-amber-400" />
                   <h3 className="m-0 text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]/90">Academic / Role Duties</h3>
               </div>
               
               <div className="space-y-4">
                   {r === 'student' && (
                      <div className="space-y-4 w-full">
                         <div className="flex items-start gap-3">
                            <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Users size={16} className="text-amber-600 dark:text-amber-400" /></div>
                            <div>
                               <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Enrolled Class</div>
                               <div className="font-semibold text-xl text-[var(--text-main)]">{profile.class || 'Unassigned'}</div>
                            </div>
                         </div>
                         <div className="flex items-start gap-3">
                             <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Info size={16} className="text-amber-600 dark:text-amber-400" /></div>
                             <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Roll Number</div>
                                <div className="font-semibold text-xl text-[var(--text-main)]">{profile.roll_number || 'Unassigned'}</div>
                             </div>
                          </div>
                         {profile.id === user.id && (
                            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between gap-4">
                               <div>
                                  <div className="font-bold text-sm text-[var(--text-main)]">Hide profile pic from class</div>
                                  <div className="text-xs text-[var(--muted)]">Only teacher and headmaster can see</div>
                               </div>
                               <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input 
                                     type="checkbox" 
                                     checked={!!profile.hide_avatar_from_class} 
                                     onChange={handlePrivacyToggle}
                                     className="sr-only peer"
                                  />
                                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                               </label>
                            </div>
                         )}
                      </div>
                   )}

                  {r === 'teacher' && (
                     <>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><BookOpen size={16} className="text-amber-600 dark:text-amber-400" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Allocated Class</div><div className="font-semibold text-lg text-[var(--text-main)]">Class {profile.class || 'Unassigned'}</div></div>
                        </div>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Award size={16} className="text-amber-600 dark:text-amber-400" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Qualification</div><div className="font-semibold text-[15px] text-[var(--text-main)]">{profile.qualification || '—'}</div></div>
                        </div>
                     </>
                  )}

                  {r === 'staff' && (
                     <>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Star size={16} className="text-amber-600 dark:text-amber-400" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Designation</div><div className="font-semibold text-lg text-[var(--text-main)]">{profile.designation || 'Staff Member'}</div></div>
                        </div>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Award size={16} className="text-amber-600 dark:text-amber-400" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Qualification</div><div className="font-semibold text-[15px] text-[var(--text-main)]">{profile.qualification || '—'}</div></div>
                        </div>
                     </>
                  )}
                  
                  {r === 'admin' && (
                      <div className="border rounded-xl p-4 flex gap-3 text-sm mt-2 font-bold bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 text-indigo-900 dark:text-indigo-200">
                         <Info size={20} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                         <div>As an Administrator, you have full access to management modules, settings, and school database controls.</div>
                      </div>
                   )}
               </div>
            </div>
          </div>
       </div>

       {/* Account & Recovery Settings (Only visible to the owner of the profile) */}
       {profile.id === user.id && (
          <div className="card p-6 mt-6 border border-border bg-[var(--card)]">
             <div 
                className={`flex items-center justify-between pb-3 border-b border-border cursor-pointer select-none ${isSettingsOpen ? 'mb-5' : 'mb-0 border-b-0'}`}
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
             >
                <div className="flex items-center gap-2">
                   <Lock size={18} className="text-indigo-400" />
                   <h3 className="m-0 text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]/90">Account & Recovery Settings</h3>
                </div>
                <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${isSettingsOpen ? 'rotate-180' : ''}`} />
             </div>
             
             <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isSettingsOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {/* Replace Email Section */}
                   <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-main)] mb-2">Replace Email</h4>
                      <p className="text-xs text-[var(--muted)] leading-relaxed">
                         Replace the email address associated with your account. A verification link will be sent to both your current and replace email address.
                      </p>
                      <form onSubmit={handleUpdateEmail} className="space-y-3">
                         <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Current Email</label>
                             <div className="text-sm font-semibold text-[var(--text-main)] px-3 py-2 bg-[var(--glass)] rounded-xl border border-border/50">
                                {profile?.email || user?.email || 'No email registered'}
                             </div>
                         </div>
                         <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">Replace Email</label>
                            <input 
                               type="email" 
                               required 
                               value={newEmail} 
                               onChange={e => setNewEmail(e.target.value)} 
                               className="sp-input text-sm" 
                               placeholder="Enter email to replace" 
                            />
                         </div>
                         {emailError && <div className="text-xs font-bold text-red-400">{emailError}</div>}
                         {emailSuccess && <div className="text-xs font-bold text-emerald-400 leading-relaxed">{emailSuccess}</div>}
                         <button 
                            type="submit" 
                            disabled={emailLoading}
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                         >
                            {emailLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            Replace Email
                         </button>
                      </form>
                   </div>

                   {/* Google OAuth Section */}
                   <div className="space-y-4 flex flex-col justify-between">
                      <div>
                         <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-main)] mb-2">Google Login Integration</h4>
                         <p className="text-xs text-[var(--muted)] leading-relaxed mb-4">
                            Link your Google account to log in with a single click. When linked, you can bypass typing your username and password.
                         </p>
                         <div className="flex items-center gap-3 px-3.5 py-3 bg-[var(--glass)] rounded-xl border border-border/50 mb-4">
                             <div className={`w-2.5 h-2.5 rounded-full ${user?.identities?.some(id => id.provider === 'google') ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                             <span className="text-xs font-bold text-[var(--text-main)]">
                                {(() => {
                                   const googleId = user?.identities?.find(id => id.provider === 'google');
                                   return googleId 
                                      ? `Google Account Connected (${googleId.identity_data?.email || 'unknown'})` 
                                      : 'Google Account Disconnected';
                                })()}
                             </span>
                          </div>
                      </div>
                      <div>
                         {user?.identities?.some(id => id.provider === 'google') ? (
                            <button
                               type="button"
                               disabled={linkingLoading}
                               onClick={handleUnlinkGoogle}
                               className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-center active:scale-[0.98]"
                            >
                               Unlink Google Account
                            </button>
                         ) : (
                            <button
                               type="button"
                               disabled={linkingLoading}
                               onClick={handleLinkGoogle}
                               className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-center shadow-md shadow-indigo-600/20 active:scale-[0.98]"
                            >
                               Connect Google Account
                            </button>
                         )}
                      </div>
                   </div>
                </div>

                {/* APK Install / Version Info */}
                {isMobileOrPWA() && (
                   <div className="border-t border-border/50 mt-6 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                         <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-main)] mb-1 flex items-center gap-2">
                            <Smartphone size={14} className="text-indigo-400" /> Install Mobile App
                         </h4>
                         <p className="text-xs text-[var(--muted)] leading-relaxed">
                            Add the app to your home screen as a standalone PWA, or download the native Android app for push notifications and background features.
                         </p>
                      </div>
                      <div className="flex flex-col gap-2">
                         <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('show-pwa-install-modal'))}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-center shadow-md shadow-indigo-600/20 active:scale-[0.98]"
                         >
                            📱 Add to Home Screen (PWA)
                         </button>
                         {apkLoading ? (
                            <button disabled className="w-full py-3 bg-slate-800 text-slate-500 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5">
                               <Loader2 size={14} className="animate-spin" /> Fetching latest build...
                            </button>
                         ) : apkUrl ? (
                            <a 
                               href={apkUrl}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-center active:scale-[0.98] text-decoration-none"
                               style={{ textDecoration: 'none' }}
                            >
                               <Download size={14} /> Download Android App (APK)
                            </a>
                         ) : null}
                      </div>
                   </div>
                )}
             </div>
          </div>
       )}
    </div>

    {/* ── EDIT PROFILE MODAL ── */}
    {isEditModalOpen && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div 
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-[500px] p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          style={{ animation: 'pwaZoomIn 0.3s ease-out' }}
        >
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <FileText size={18} className="text-emerald-400" /> Edit Profile Details
            </h3>
            <button 
              onClick={() => setIsEditModalOpen(false)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Full Name - Disabled */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5">
                Full Name <Lock size={10} className="text-slate-400" />
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  disabled 
                  value={profile?.name || ''} 
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-semibold cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">To change your legal name, please contact the school administration.</p>
            </div>

            {/* Class/Designation - Disabled */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5">
                Class / Designation <Lock size={10} className="text-slate-400" />
              </label>
              <input 
                type="text" 
                disabled 
                value={profile?.role === 'student' ? (profile?.class || 'Unassigned') : (profile?.role === 'teacher' ? `Teacher (Class ${profile?.class || 'Unassigned'})` : (profile?.designation || 'Staff Member'))} 
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 font-semibold cursor-not-allowed"
              />
            </div>

            {/* Username - Editable once */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Username</span>
                {profile?.username_changed && <span className="text-[9px] text-amber-500 font-bold lowercase tracking-normal bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock size={8} /> locked after 1 edit</span>}
              </label>
              <input 
                type="text" 
                required
                disabled={profile?.username_changed}
                value={editUsername} 
                onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="Choose username (lowercase and numbers only)"
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 disabled:cursor-not-allowed"
              />
              {!profile?.username_changed && <p className="text-[10px] text-indigo-400 mt-1">⚠️ Warning: You can only change your username once. Choose wisely!</p>}
            </div>

            {/* Email - Editable */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={editEmail} 
                onChange={e => setEditEmail(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {/* Mobile Number - Editable */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Mobile Number</label>
              <input 
                type="tel" 
                value={editContact} 
                onChange={e => setEditContact(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Enter 10 digit number"
                maxLength={10}
              />
            </div>

            {/* Save & Close Actions */}
            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all border border-slate-200 dark:border-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="flex-[1.5] py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 dark:shadow-none"
              >
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    {showDemoModal && createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.70)', padding: '16px' }}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-[440px] text-center p-8 shadow-2xl relative" style={{ borderLeft: '4px solid #6366f1' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-3">Action Restricted</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            This is a demo school for global testing. You cannot delete or alter core data here. You will get 100% control over your data when you register your own school.
          </p>
          <button
            onClick={() => setShowDemoModal(false)}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-200"
          >
            Understand & Close
          </button>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
