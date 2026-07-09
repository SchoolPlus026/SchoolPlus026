import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import { Image as ImageIcon, Plus, Loader2, X, ExternalLink, Folder, CloudOff, HardDrive } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

function readFileAsBase64(file) {
  const fileBlob = file instanceof File ? file : file.blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(fileBlob);
  });
}

export default function GalleryManager() {
  const { user, role, schoolSettings, addBackgroundUpload, updateBackgroundUpload, removeBackgroundUpload } = useAppStore();
  const { isPending } = usePending();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [title, setTitle]           = useState('');
  const [link, setLink]             = useState('');
  const [category, setCategory]     = useState('Events');
  const [visibilityScope, setVisibilityScope] = useState('Entire School');
  const [targetClass, setTargetClass]         = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [coverFiles, setCoverFiles] = useState([]);
  const [viewItem, setViewItem]     = useState(null);

  const getThumbnailLink = (url) => {
    if (!url) return '';
    const match = url.match(/\/d\/(.*?)\//);
    if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800-h800`;
    return url;
  };

  
  const [selectedDriveIndex, setSelectedDriveIndex] = useState(0);
  const drives = Array.isArray(schoolSettings?.gdrive_config) ? schoolSettings.gdrive_config : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
  const gdriveConnected = drives.length > 0;

  const { data: driveQuotas } = useQuery({
    queryKey: ['driveQuotas', drives.length],
    queryFn: async () => {
      const quotas = [];
      const { data: { session } } = await supabase.auth.getSession();
      for (let i = 0; i < drives.length; i++) {
         const { data, error } = await supabase.functions.invoke('gdrive-upload', {
            body: { action: 'get_quota', driveIndex: i },
            headers: { Authorization: `Bearer ${session?.access_token}` }
         });
         quotas.push(!error && data?.quota ? data.quota : null);
      }
      return quotas;
    },
    enabled: drives.length > 0
  });

  const { data: media, isLoading } = useQuery({
    queryKey: ['gallery', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .eq('school_id', schoolSettings.school_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!schoolSettings?.school_id,
  });

  const addMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('gallery').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
    onError: (err) => alert(`Failed to save event: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item) => {
      if (gdriveConnected && item.link && item.link.includes('drive.google.com/drive/folders/')) {
         const folderIdMatch = item.link.match(/folders\/([^?]+)/);
         if (folderIdMatch && folderIdMatch[1]) {
            const folderId = folderIdMatch[1];
            const { data: { session } } = await supabase.auth.getSession();
            await supabase.functions.invoke('gdrive-upload', {
               body: { action: 'delete_file', fileId: folderId, driveIndex: 0 },
               headers: { Authorization: `Bearer ${session?.access_token}` }
            });
         }
      }
      const { error } = await supabase.from('gallery').delete().eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
    onError: (err) => alert(`Delete failed: ${err.message}`)
  });

  function resetForm() {
    setTitle(''); setLink(''); setCategory('Events'); setCoverFiles([]);
    setVisibilityScope('Entire School'); setTargetClass('');
    setIsCreating(false); setAddModalOpen(false);
  }

  function handleFileChange(e) {
    setCoverFiles(Array.from(e.target.files));
  }

  const handleNativePhotoSelect = async () => {
    try {
      const { Camera: CapCamera } = await import('@capacitor/camera');
      const result = await CapCamera.pickImages({
        quality: 90
      });
      if (result && result.photos) {
        const enriched = [];
        for (let idx = 0; idx < result.photos.length; idx++) {
          const photo = result.photos[idx];
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          enriched.push({
            name: `gallery_${Date.now()}_${idx}.${photo.format}`,
            type: `image/${photo.format}`,
            blob: blob
          });
        }
        setCoverFiles(enriched);
      }
    } catch (err) {
      console.error('[GalleryManager] Native image picking error:', err);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }

    if (gdriveConnected) {
      if (coverFiles.length === 0) return alert('Please select at least one photo to upload.');

      const eventTitle = title; const eventCat = category; const filesToUpload = [...coverFiles]; const targetDriveIndex = selectedDriveIndex;
      resetForm();
      
      const uploadId = Date.now().toString();
      addBackgroundUpload({ id: uploadId, title: eventTitle, total: filesToUpload.length, current: 0, status: 'Creating folder...' });

      (async () => {
         try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers = { Authorization: `Bearer ${session?.access_token}` };

            const getOrCreateFolder = async (fName, parentId) => {
               const search = await supabase.functions.invoke('gdrive-upload', { body: { action: 'search_folder', folderName: fName, parentFolderId: parentId, driveIndex: targetDriveIndex, school_id: schoolSettings.school_id }, headers });
               if (search.error) throw new Error(search.error.message);
               if (search.data?.id) return search.data.id;
               
               const create = await supabase.functions.invoke('gdrive-upload', { body: { action: 'create_folder', folderName: fName, parentFolderId: parentId, driveIndex: targetDriveIndex, school_id: schoolSettings.school_id }, headers });
               if (create.error) throw new Error(create.error.message);
               if (create.data?.error) throw new Error(create.data.error);
               if (!create.data?.id) throw new Error('Failed to create folder, no ID returned.');
               return create.data.id;
            };

            const classFolderName = visibilityScope === 'Entire School' ? 'Entire School' : (visibilityScope === 'My Class' && user?.class ? user.class : targetClass);

            updateBackgroundUpload(uploadId, { status: `Creating folder ${classFolderName}...` });
            let currentParent = await getOrCreateFolder(classFolderName, null);

            updateBackgroundUpload(uploadId, { status: `Creating category ${eventCat}...` });
            currentParent = await getOrCreateFolder(eventCat, currentParent);

            updateBackgroundUpload(uploadId, { status: `Creating event ${eventTitle}...` });
            const { data: folderData, error: folderError } = await supabase.functions.invoke('gdrive-upload', {
              body: { action: 'create_folder', folderName: eventTitle, parentFolderId: currentParent, driveIndex: targetDriveIndex, school_id: schoolSettings.school_id },
              headers
            });
            if (folderError || folderData?.error) throw new Error(folderData?.error || folderError?.message || "Folder creation failed");
            
            const folderId = folderData.id;
            const folderLink = folderData.link;
            const gdriveMeta = [];
            let failedCount = 0;

            for (let i = 0; i < filesToUpload.length; i++) {
               const file = filesToUpload[i];
               const fileBase64 = await readFileAsBase64(file);
               
               updateBackgroundUpload(uploadId, { current: i + 1, status: `Uploading ${file.name}...` });

               const { data: uploadData, error: uploadError } = await supabase.functions.invoke('gdrive-upload', {
                 body: {
                   action: 'upload_file',
                   parentFolderId: folderId,
                   fileName: file.name,
                   mimeType: file.type || 'application/octet-stream',
                   fileBase64: fileBase64,
                   driveIndex: targetDriveIndex,
                   school_id: schoolSettings.school_id
                 },
                 headers
               });
               
               if (!uploadError && !uploadData?.error) {
                  gdriveMeta.push({ thumbnailLink: uploadData.thumbnailLink, webViewLink: uploadData.webViewLink });
               } else {
                  failedCount++;
               }
            }

            const firstMeta = gdriveMeta[0];
            const coverLink = firstMeta?.thumbnailLink || firstMeta?.webViewLink;
            const photoUrls = gdriveMeta.map(m => m.webViewLink);

            addMutation.mutate({
              school_id:  schoolSettings.school_id,
              title:      eventTitle,
              category:   eventCat,
              link:       folderLink,
              cover_link: coverLink,
              photo_urls: photoUrls,
              visibility_scope: visibilityScope,
              target_class: visibilityScope === 'Entire School' ? null : classFolderName
            });

            removeBackgroundUpload(uploadId);
            const msg = failedCount > 0 ? `⚠️ "${eventTitle}" saved, but ${failedCount} files failed to upload.` : `"${eventTitle}" uploaded successfully!`;
            alert(msg);
         } catch(err) {
            removeBackgroundUpload(uploadId);
            alert(`Upload failed for "${eventTitle}": ${err.message}`);
         }
      })();
    } else {
      if (!link.trim()) return alert('Please enter a folder URL.');
      setIsCreating(true);
      addMutation.mutate({ school_id: schoolSettings.school_id, title, category, link: link.trim(), cover_link: null, photo_urls: [] });
      resetForm();
    }
  };

  const displayMedia = media?.filter(item => {
    if (role === 'admin' || role === 'platform_admin') return true;
    if (item.visibility_scope === 'Entire School') return true;
    const userClass = user?.class;
    return userClass && item.target_class && userClass.toLowerCase() === item.target_class.toLowerCase();
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <ImageIcon className="text-pink-500" size={28} /> Memory Gallery
          </h2>
          <p className="text-sm text-muted">Browse through school events, activities, and milestones.</p>
        </div>
        {(role === 'admin' || role === 'teacher') && (
          <button onClick={() => setAddModalOpen(true)} className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md">
            <Plus size={20} /> Add Event
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : !displayMedia || displayMedia.length === 0 ? (
        <div className="text-center py-20 bg-white border-2 border-dashed border-border rounded-3xl text-muted">Your gallery is currently empty.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayMedia.map((item) => {
            const photoUrls = Array.isArray(item.photo_urls) ? item.photo_urls : [];
            const photoCount = photoUrls.length;

            return (
              <div key={item.id} onClick={() => setViewItem(item)} className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm group hover:border-primary/50 transition-all flex flex-col relative cursor-pointer">
                <div className="aspect-[4/3] relative overflow-hidden bg-slate-100">
                  {item.cover_link ? (
                    <img src={getThumbnailLink(item.cover_link)} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => e.target.style.display = 'none'} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-50">
                      <Folder size={64} className="text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                    </div>
                  )}
                  {photoCount > 1 && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-bold rounded-full backdrop-blur-sm flex items-center gap-1"><ImageIcon size={10} /> {photoCount} photos</div>
                  )}
                  {(role === 'admin' || role === 'platform_admin' || role === 'teacher') && (
                    <button onClick={(ev) => { ev.stopPropagation(); if (window.confirm('Delete this event? It will also be removed from Google Drive.')) deleteMutation.mutate(item); }} className="absolute top-3 right-3 p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white z-10">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="p-4 flex flex-col items-start bg-white border-t border-slate-100">
                  <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 truncate w-full">{item.title}</h3>
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase tracking-widest mb-3">{item.category}</span>
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all">
                    <Folder size={14} /> Open Folder <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {role === 'admin' && gdriveConnected && (
         <div className="flex flex-col sm:flex-row gap-4 mt-8">
            {drives.map((drive, idx) => {
               const quota = driveQuotas && driveQuotas[idx] ? driveQuotas[idx] : null;
               return (
                 <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                       <HardDrive size={18} className="text-primary" />
                       <span className="font-bold text-sm text-slate-800">Drive {idx + 1} Storage</span>
                    </div>
                    {quota ? (
                       <>
                         <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (quota.usage / Math.max(1, quota.limit)) * 100)}%` }}></div>
                         </div>
                         <div className="text-[11px] font-semibold text-slate-500">
                            {Math.round(quota.usage / 1024 / 1024 / 1024)} GB used of {Math.round(quota.limit / 1024 / 1024 / 1024)} GB
                         </div>
                       </>
                    ) : (
                       <div className="text-[11px] text-slate-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Fetching quota...</div>
                    )}
                 </div>
               )
            })}
         </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-800/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            <div className="p-5 border-b border-border bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-lg text-text">Create Gallery Event</h3>
              <button onClick={resetForm} className="text-muted hover:text-text"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Title / Occasion</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} type="text" className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm" placeholder="e.g. Annual Sports Day 2025" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm">
                  <option value="Events">School Events</option>
                  <option value="Activities">Student Activities</option>
                  <option value="Campus">Campus &amp; Infrastructure</option>
                  <option value="Awards">Awards &amp; Honors</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Visibility Scope</label>
                <select value={visibilityScope} onChange={e => setVisibilityScope(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm">
                  <option value="Entire School">Entire School</option>
                  {role === 'teacher' && <option value="My Class">My Class</option>}
                  <option value="Specific Class">Specific Class</option>
                </select>
              </div>
              {visibilityScope === 'Specific Class' && (
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Target Class</label>
                  <select required value={targetClass} onChange={e => setTargetClass(e.target.value)} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm appearance-none cursor-pointer">
                    <option value="" disabled>Select a Class</option>
                    {(schoolSettings?.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {gdriveConnected ? (
                <div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 font-semibold flex flex-col gap-2 mb-3">
                    <div className="flex items-center gap-2"><Folder size={14} className="text-green-600" /> Google Drive connected — photos upload directly.</div>
                    {drives.length > 1 && (
                       <select value={selectedDriveIndex} onChange={(e) => setSelectedDriveIndex(Number(e.target.value))} className="w-full bg-white border border-green-200 rounded p-1.5 outline-none text-green-800 font-mono text-[10px]">
                          {drives.map((d, i) => (<option key={i} value={i}>Drive {i + 1}: {d.email || d.folder_id}</option>))}
                       </select>
                    )}
                  </div>
                  {Capacitor.isNativePlatform() ? (
                    <button
                      type="button"
                      onClick={handleNativePhotoSelect}
                      className="w-full py-3 bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 rounded-xl text-primary font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <ImageIcon size={14} /> Select Photos / Videos
                    </button>
                  ) : (
                    <input required type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                  )}
                  {coverFiles.length > 0 && <p className="text-xs text-primary font-semibold mt-1.5">✓ {coverFiles.length} file{coverFiles.length > 1 ? 's' : ''} selected.</p>}
                </div>
              ) : (
                <div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold flex items-start gap-2 mb-3">
                    <CloudOff size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <span>Google Drive is not connected. Direct photo upload is unavailable. Ask your Platform Admin to connect Google Drive.</span>
                  </div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Folder URL</label>
                  <input required value={link} onChange={e => setLink(e.target.value)} type="url" className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm font-mono text-sm" placeholder="https://drive.google.com/drive/folders/..." />
                </div>
              )}
              <button type="submit" disabled={addMutation.isPending || isCreating} className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                {(addMutation.isPending || isCreating) ? <><Loader2 size={18} className="animate-spin" /> Submitting...</> : <><Plus size={18} /> Create Event</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md">
          <div className="flex justify-between items-center p-4 border-b border-white/10 text-white">
            <h3 className="font-bold truncate pr-4">{viewItem.title}</h3>
            <div className="flex items-center gap-3">
              <a href={viewItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-semibold transition-colors">
                <ExternalLink size={14} /> View Folder
              </a>
              <button onClick={() => setViewItem(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
             {viewItem.photo_urls?.length > 0 ? (
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {viewItem.photo_urls.map((url, idx) => (
                    <div key={idx} className="aspect-square bg-white/5 rounded-xl overflow-hidden border border-white/10">
                       <img src={getThumbnailLink(url)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                 ))}
               </div>
             ) : (
               <div className="w-full h-full flex flex-col items-center justify-center text-white/50">
                  <Folder size={64} className="mb-4 opacity-50" />
                  <p>No direct photos available. Please open the folder.</p>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
}
