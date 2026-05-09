import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import { triggerFCMNotification } from '../../utils/notifications';
import { Loader2, Send, PenTool, Image as ImageIcon, CloudOff, X, Folder } from 'lucide-react';
import NoticeBoard from './NoticeBoard';

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function NoticeManager() {
  const { schoolSettings, role } = useAppStore();
  const { isPending } = usePending();
  const queryClient = useQueryClient();

  const [title, setTitle]           = useState('');
  const [content, setContent]       = useState('');
  const [scope, setScope]           = useState(role === 'teacher' ? 'students' : 'all');
  const [isComposing, setIsComposing] = useState(false);

  // GDrive image upload state
  const [imageFile, setImageFile]     = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const fileInputRef                  = useRef(null);

  const drives = Array.isArray(schoolSettings?.gdrive_config)
    ? schoolSettings.gdrive_config
    : (schoolSettings?.gdrive_config ? [schoolSettings.gdrive_config] : []);
  const gdriveConnected = drives.length > 0;

  // Ensure the "SchoolOS_Notices" folder exists, then upload the image
  async function uploadImageToDrive(file) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { Authorization: `Bearer ${session?.access_token}` };

    // 1. Create folder (Drive deduplicates by name in same parent, so it's safe to always call)
    const { data: folderData, error: folderErr } = await supabase.functions.invoke('gdrive-upload', {
      body: { action: 'create_folder', folderName: 'SchoolOS_Notices', driveIndex: 0 },
      headers,
    });
    if (folderErr || folderData?.error) {
      throw new Error(folderData?.error || folderErr?.message || 'Could not create Notices folder in Drive');
    }
    const folderId = folderData.id;

    // 2. Upload the image file
    const fileBase64 = await readFileAsBase64(file);
    const { data: uploadData, error: uploadErr } = await supabase.functions.invoke('gdrive-upload', {
      body: {
        action:         'upload_file',
        parentFolderId: folderId,
        fileName:       `notice_${Date.now()}_${file.name}`,
        mimeType:       file.type || 'image/jpeg',
        fileBase64,
        driveIndex:     0,
      },
      headers,
    });
    if (uploadErr || uploadData?.error) {
      throw new Error(uploadData?.error || uploadErr?.message || 'Image upload failed');
    }

    // Return the direct thumbnail for display and the webViewLink for storage
    return {
      webViewLink:   uploadData.webViewLink,
      thumbnailLink: uploadData.thumbnailLink || uploadData.webViewLink,
    };
  }

  const broadcastMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('notices')
        .insert({
          school_id: schoolSettings.school_id,
          title:     payload.title,
          content:   payload.content,
          date:      new Date().toISOString().split('T')[0],
          scope:     payload.scope,
          photo_url: payload.photoUrl || null,
        });

      if (error) throw error;
      await triggerFCMNotification(payload.title, payload.scope, schoolSettings.school_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      resetForm();
    },
  });

  function resetForm() {
    setTitle(''); setContent('');
    setScope(role === 'teacher' ? 'students' : 'all');
    setImageFile(null); setUploadedUrl(null);
    setIsComposing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setUploadedUrl(null); // reset any prior upload
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setUploadedUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    if (!title.trim() || !content.trim()) return;

    let photoUrl = null;

    // If a file is selected and GDrive is connected, upload it first
    if (imageFile && gdriveConnected) {
      setUploading(true);
      try {
        const result = await uploadImageToDrive(imageFile);
        photoUrl = result.webViewLink;
      } catch (err) {
        alert(`Image upload failed: ${err.message}\nNotice will be sent without an image.`);
      } finally {
        setUploading(false);
      }
    }

    broadcastMutation.mutate({ title, content, scope, photoUrl });
  };

  const isBusy = uploading || broadcastMutation.isPending;

  return (
    <div className="space-y-8">
      {/* Action Header */}
      <div className="flex justify-between items-center bg-slate-900 p-5 rounded-2xl border border-glass shadow-xl relative overflow-hidden">
        <div className="absolute left-0 bottom-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full -ml-16 -mb-16 pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-xl font-bold text-white tracking-tight mb-1">Notice Board Manager</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Send school-wide announcements</p>
        </div>
        <button
          onClick={() => { setIsComposing(!isComposing); if (isComposing) resetForm(); }}
          className={`relative z-10 flex items-center gap-2 px-5 py-2.5 font-bold uppercase tracking-wider text-xs rounded-xl transition-all shadow-lg ${isComposing ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-primary hover:bg-primary-dark text-white shadow-primary/30'}`}
        >
          {isComposing ? 'Cancel Notice' : <><PenTool size={16} /> New Notice</>}
        </button>
      </div>

      {/* Composer */}
      {isComposing && (
        <div className="bg-surface border border-glass rounded-2xl p-6 shadow-2xl animate-in slide-in-from-top-4 duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 mb-6 border-b border-glass pb-3">New Notice Details</h3>

          <form onSubmit={handleBroadcast} className="space-y-5 relative z-10">
            {/* Title + Scope row */}
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1">
                <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Notice Title</label>
                <input
                  type="text" autoFocus required maxLength={100}
                  value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-glass rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors font-medium text-lg placeholder-slate-600 shadow-inner"
                  placeholder="e.g. Critical Update: Emergency Closure Today"
                />
              </div>
              <div className="w-full sm:w-72 flex-shrink-0">
                <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Send To Scope</label>
                <select
                  value={scope} onChange={e => setScope(e.target.value)}
                  className="w-full bg-slate-900 border border-glass rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none cursor-pointer shadow-inner"
                >
                  {role !== 'teacher' && <option value="all">Global (All Users)</option>}
                  <option value="students">My Students Only</option>
                  {role !== 'teacher' && <option value="teachers">Teachers Only</option>}
                </select>
              </div>
            </div>

            {/* ── Image Upload Section ── */}
            <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">
                Attach Image <span className="font-normal normal-case text-slate-500">(optional)</span>
              </label>

              {gdriveConnected ? (
                imageFile ? (
                  /* File selected — show preview chip */
                  <div className="flex items-center gap-3 p-3 bg-emerald-900/30 border border-emerald-700/50 rounded-xl">
                    <ImageIcon size={18} className="text-emerald-400 flex-shrink-0" />
                    <span className="text-sm text-emerald-300 font-semibold truncate flex-1">{imageFile.name}</span>
                    <button type="button" onClick={handleRemoveImage} className="text-red-400 hover:text-red-300">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  /* GDrive connected — show drag-to-upload zone */
                  <label className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-glass rounded-xl cursor-pointer hover:border-emerald-500 transition-colors bg-slate-900/50">
                    <Folder size={28} className="text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-400">Click to select image — will upload to Google Drive</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                )
              ) : (
                /* No GDrive — show informational chip */
                <div className="flex items-center gap-3 p-3 bg-amber-900/20 border border-amber-700/40 rounded-xl">
                  <CloudOff size={16} className="text-amber-500 flex-shrink-0" />
                  <span className="text-xs text-amber-400 font-semibold">
                    Google Drive not connected. Connect it in Admin Settings to enable image uploads.
                  </span>
                </div>
              )}
            </div>

            {/* Message content */}
            <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Message Content</label>
              <textarea
                required value={content} onChange={e => setContent(e.target.value)}
                rows="6"
                className="w-full bg-slate-900 border border-glass rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm leading-relaxed placeholder-slate-600 custom-scrollbar resize-y shadow-inner"
                placeholder="Write the details of this notice here..."
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-glass">
              <button
                disabled={isBusy}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wider text-xs px-8 py-4 rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
              >
                {isBusy
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> {uploading ? 'Uploading image...' : 'Sending...'}</>
                  : <><Send className="w-5 h-5" /> Send Notice</>}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="pt-4 border-t border-glass">
        <NoticeBoard />
      </div>
    </div>
  );
}
