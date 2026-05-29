import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { User, Loader2, Mail, Phone, MapPin, Briefcase, Calendar, Info, GraduationCap, FileText, Users, BookOpen, Award, Star, Camera, Trash2 } from 'lucide-react';

// Client-side image compression utility
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
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
  const { user, role, schoolSettings } = useAppStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef(null);

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
      });
  }, [user]);

  useEffect(() => {
    setImgError(false);
  }, [profile?.avatar_url]);

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
      alert('Profile picture removed successfully!');
    } catch (err) {
      console.error('Failed to remove profile picture:', err);
      alert(`Removal failed: ${err.message}`);
    } finally {
      setUploading(false);
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
            <div className="absolute -top-16 md:-top-20 bg-slate-900 border-[6px] border-slate-900 shadow-2xl rounded-full w-32 h-32 md:w-40 md:h-40 flex items-center justify-center relative overflow-hidden group">
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
                  <span className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 z-10">{initial}</span>
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
            
            <div className="mt-20 md:mt-24 flex items-start justify-between flex-wrap gap-4">
               <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-1">{profile.name || 'Unknown User'}</h2>
                  <div className="flex items-center gap-3">
                     <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)'}}>{profile.role || r.toUpperCase()}</span>
                     <span className="muted small font-medium">@{profile.username || profile.email}</span>
                  </div>
               </div>

               {/* Action Buttons for own profile */}
               {profile.id === user.id && (
                  <div className="flex items-center gap-2 mt-2 sm:mt-4">
                     {profile.avatar_url && (
                        <button 
                           onClick={handleRemoveAvatar} 
                           disabled={uploading}
                           className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                           {uploading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                           Remove Photo
                        </button>
                     )}
                     <button 
                        onClick={triggerFileInput} 
                        disabled={uploading}
                        className="px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
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
               <h3 className="m-0 text-sm font-black uppercase tracking-widest text-[var(--muted)]">Personal Information</h3>
            </div>
            <div className="space-y-4 flex-1">
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><User size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Full Name</div><div className="font-semibold text-[15px] text-white">{profile.name || '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Calendar size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Date of Birth</div><div className="font-semibold text-[15px] text-white">{profile.dob ? new Date(profile.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Info size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Blood Group</div><div className="font-semibold text-[15px] text-white space-x-1">{profile.blood_group ? <span className="text-red-400 font-black">{profile.blood_group}</span> : '—'}</div></div>
               </div>
               <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><FileText size={16} className="text-slate-400" /></div>
                  <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Aadhar Card</div><div className="font-semibold text-[15px] text-white tracking-widest font-mono text-sm">{profile.aadhar_card || '—'}</div></div>
               </div>
            </div>
         </div>

         <div className="flex flex-col gap-6">
            {/* Contact Info Card */}
            <div className="card p-6">
               <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
                  <Briefcase size={18} className="text-emerald-400" />
                  <h3 className="m-0 text-sm font-black uppercase tracking-widest text-[var(--muted)]">Contact & Address</h3>
               </div>
               <div className="space-y-4">
                  <div className="flex items-start gap-3">
                     <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Phone size={16} className="text-emerald-400/70" /></div>
                     <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Contact Number</div><div className="font-semibold text-[15px] text-white">{profile.contact || '—'}</div></div>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><MapPin size={16} className="text-emerald-400/70" /></div>
                     <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Residential Address</div><div className="font-semibold text-[15px] text-white leading-relaxed">{profile.address || '—'}</div></div>
                  </div>
               </div>
            </div>

            {/* Academic/Role Details Card */}
            <div className="card p-6 flex-1">
               <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
                  <GraduationCap size={18} className="text-amber-400" />
                  <h3 className="m-0 text-sm font-black uppercase tracking-widest text-[var(--muted)]">Academic / Role Duties</h3>
               </div>
               
               <div className="space-y-4">
                  {r === 'student' && (
                     <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Users size={16} className="text-amber-400/70" /></div>
                        <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Enrolled Class</div><div className="font-semibold text-xl text-white">{profile.class || 'Unassigned'}</div></div>
                     </div>
                  )}

                  {r === 'teacher' && (
                     <>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><BookOpen size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Allocated Class</div><div className="font-semibold text-lg text-white">Class {profile.class || 'Unassigned'}</div></div>
                        </div>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Award size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Qualification</div><div className="font-semibold text-[15px] text-white">{profile.qualification || '—'}</div></div>
                        </div>
                     </>
                  )}

                  {r === 'staff' && (
                     <>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Star size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Designation</div><div className="font-semibold text-lg text-white">{profile.designation || 'Staff Member'}</div></div>
                        </div>
                        <div className="flex items-start gap-3">
                           <div className="mt-1 p-2 rounded-lg bg-[var(--glass)]"><Award size={16} className="text-amber-400/70" /></div>
                           <div><div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-0.5">Qualification</div><div className="font-semibold text-[15px] text-white">{profile.qualification || '—'}</div></div>
                        </div>
                     </>
                  )}
                  
                  {r === 'admin' && (
                     <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-amber-200 text-sm mt-2">
                        <Info size={20} className="text-amber-400 shrink-0" />
                        <div>As an Administrator, you have full access to management modules, settings, and school database controls.</div>
                     </div>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
