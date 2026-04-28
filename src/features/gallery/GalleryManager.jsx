import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Image as ImageIcon, Plus, Loader2, X, ExternalLink, Folder, CloudOff } from 'lucide-react';

// ── Helper: read a File as a pure base64 string (no data: prefix) ────────────
// GDrive multipart upload expects raw base64, not a data URI.
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      // result is "data:image/jpeg;base64,/9j/..."  — strip the prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const MAX_FILE_SIZE_MB = 5;

export default function GalleryManager() {
  const { role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form states
  const [title, setTitle]           = useState('');
  const [link, setLink]             = useState(''); // Manual URL fallback (no GDrive)
  const [category, setCategory]     = useState('Events');
  const [isCreating, setIsCreating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [coverFiles, setCoverFiles] = useState([]); // Array<File>
  const [sizeWarning, setSizeWarning] = useState('');

  const gdriveConnected = !!schoolSettings?.gdrive_config?.refresh_token;

  // ── Fetch gallery events ─────────────────────────────────────────────────
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

  // ── Save event record to Supabase DB ────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('gallery').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
      resetForm();
    },
    onError: (err) => {
      alert(`Failed to save event: ${err.message}`);
      setIsCreating(false);
      setProgressText('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('gallery').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
  });

  function resetForm() {
    setTitle('');
    setLink('');
    setCategory('Events');
    setCoverFiles([]);
    setSizeWarning('');
    setProgressText('');
    setIsCreating(false);
    setAddModalOpen(false);
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files);
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      setSizeWarning(
        `⚠️ ${oversized.length} file(s) exceed ${MAX_FILE_SIZE_MB}MB and will be skipped. ` +
        `Upload them manually into the Google Drive folder after creation.`
      );
      const safe = files.filter(f => f.size <= MAX_FILE_SIZE_MB * 1024 * 1024);
      setCoverFiles(safe);
    } else {
      setSizeWarning('');
      setCoverFiles(files);
    }
  }

  // ── Main submission handler ──────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();

    // PATH A: GDrive connected — upload everything directly to Drive
    if (gdriveConnected) {
      if (coverFiles.length === 0) {
        return alert('Please select at least one photo to upload.');
      }

      setIsCreating(true);
      try {
        // ── Step 1: Create event subfolder in GDrive ──────────────────────
        setProgressText('Creating Google Drive folder...');
        const { data: folderData, error: folderError } = await supabase.functions.invoke('gdrive-upload', {
          body: { action: 'create_folder', folderName: title },
        });
        if (folderError) throw new Error(folderError.message);
        if (folderData?.error) throw new Error(folderData.error);
        if (!folderData?.id)   throw new Error('No folder ID returned from Google Drive');

        const folderId   = folderData.id;
        const folderLink = folderData.link; // The "Open Folder" URL saved in DB

        // ── Step 2: Upload each file into that subfolder ──────────────────
        const gdriveMeta = []; // { thumbnailLink, webViewLink } per file

        for (let i = 0; i < coverFiles.length; i++) {
          const file = coverFiles[i];
          setProgressText(`Uploading photo ${i + 1} of ${coverFiles.length} to Google Drive...`);

          const fileBase64 = await readFileAsBase64(file);

          const { data: uploadData, error: uploadError } = await supabase.functions.invoke('gdrive-upload', {
            body: {
              action:         'upload_file',
              parentFolderId: folderId,
              fileName:       file.name,
              mimeType:       file.type || 'application/octet-stream',
              fileBase64:     fileBase64,
            },
          });

          if (uploadError) throw new Error(`File "${file.name}": ${uploadError.message}`);
          if (uploadData?.error) throw new Error(`File "${file.name}": ${uploadData.error}`);

          gdriveMeta.push({
            thumbnailLink: uploadData.thumbnailLink,
            webViewLink:   uploadData.webViewLink,
          });
        }

        // ── Step 3: Save to Supabase DB — ZERO bytes in Supabase Storage ──
        setProgressText('Saving event...');
        // cover_link  = first file's thumbnail (for card UI preview)
        // photo_urls  = all GDrive webViewLinks (for lightbox / viewing)
        // link        = the GDrive subfolder link (for "Open Folder" button)
        const firstMeta   = gdriveMeta[0];
        const coverLink   = firstMeta.thumbnailLink || firstMeta.webViewLink;
        const photoUrls   = gdriveMeta.map(m => m.webViewLink);

        addMutation.mutate({
          school_id:  schoolSettings.school_id,
          title,
          category,
          link:       folderLink,
          cover_link: coverLink,
          photo_urls: photoUrls,
        });

      } catch (err) {
        alert(`Upload failed: ${err.message}`);
        setIsCreating(false);
        setProgressText('');
      }

    // PATH B: GDrive NOT connected — save a manually entered URL only
    } else {
      if (!link.trim()) return alert('Please enter a folder URL.');
      setIsCreating(true);
      setProgressText('Saving event...');
      addMutation.mutate({
        school_id:  schoolSettings.school_id,
        title,
        category,
        link:       link.trim(),
        cover_link: null,
        photo_urls: [],
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <ImageIcon className="text-pink-500" size={28} /> Memory Gallery
          </h2>
          <p className="text-sm text-muted">Browse through school events, activities, and milestones.</p>
        </div>
        {role === 'admin' && (
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md"
          >
            <Plus size={20} /> Add Event
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : !media || media.length === 0 ? (
        <div className="text-center py-20 bg-white border-2 border-dashed border-border rounded-3xl text-muted">
          Your gallery is currently empty.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {media.map((item) => {
            const photoUrls  = Array.isArray(item.photo_urls) ? item.photo_urls : [];
            const thumbUrl   = item.cover_link || null;
            const photoCount = photoUrls.length;

            return (
              <div
                key={item.id}
                className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm group hover:border-primary/50 transition-all flex flex-col relative"
              >
                {/* Thumbnail */}
                <div className="aspect-[4/3] relative overflow-hidden bg-slate-100">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-50">
                      <Folder size={64} className="text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                    </div>
                  )}

                  {/* Photo count badge */}
                  {photoCount > 1 && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-bold rounded-full backdrop-blur-sm flex items-center gap-1">
                      <ImageIcon size={10} /> {photoCount} photos
                    </div>
                  )}

                  {/* Delete button (admin only) */}
                  {role === 'admin' && (
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (window.confirm('Delete this event from the gallery?')) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                      className="absolute top-3 right-3 p-2 bg-red-100 text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Card footer */}
                <div className="p-4 flex flex-col items-start bg-white border-t border-slate-100">
                  <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 truncate w-full">{item.title}</h3>
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase tracking-widest mb-3">
                    {item.category}
                  </span>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all"
                  >
                    <Folder size={14} /> Open Folder <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Event Modal ─────────────────────────────────────────────────── */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-800/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            {/* Modal header */}
            <div className="p-5 border-b border-border bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-lg text-text">Create Gallery Event</h3>
              <button onClick={resetForm} className="text-muted hover:text-text"><X size={20} /></button>
            </div>

            <form onSubmit={handleAdd} className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Title / Occasion</label>
                <input
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  type="text"
                  className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm"
                  placeholder="e.g. Annual Sports Day 2025"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm"
                >
                  <option value="Events">School Events</option>
                  <option value="Activities">Student Activities</option>
                  <option value="Campus">Campus &amp; Infrastructure</option>
                  <option value="Awards">Awards &amp; Honors</option>
                </select>
              </div>

              {/* Photos / URL based on GDrive status */}
              {gdriveConnected ? (
                <div>
                  {/* GDrive connected — show file picker */}
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 font-semibold flex items-center gap-2 mb-3">
                    <Folder size={14} className="text-green-600" />
                    Google Drive connected — photos upload directly to Drive. Zero Supabase storage used.
                  </div>

                  <label className="block text-sm font-semibold text-text mb-1.5">
                    Photos / Videos <span className="text-muted font-normal">(select multiple, max {MAX_FILE_SIZE_MB}MB each)</span>
                  </label>
                  <input
                    required
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileChange}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />

                  {coverFiles.length > 0 && (
                    <p className="text-xs text-primary font-semibold mt-1.5">
                      ✓ {coverFiles.length} file{coverFiles.length > 1 ? 's' : ''} selected — first photo will be the card cover.
                    </p>
                  )}

                  {sizeWarning && (
                    <p className="text-xs text-amber-600 font-medium mt-1.5 leading-relaxed">{sizeWarning}</p>
                  )}
                </div>
              ) : (
                <div>
                  {/* GDrive NOT connected — show manual URL input + info banner */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold flex items-start gap-2 mb-3">
                    <CloudOff size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <span>Google Drive is not connected. Direct photo upload is unavailable. Ask your Platform Admin to connect Google Drive in Settings to enable zero-cost storage.</span>
                  </div>

                  <label className="block text-sm font-semibold text-text mb-1.5">
                    Folder URL <span className="text-muted font-normal">(paste a shared Google Drive or album link)</span>
                  </label>
                  <input
                    required
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    type="url"
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm font-mono text-sm"
                    placeholder="https://drive.google.com/drive/folders/..."
                  />
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={addMutation.isPending || isCreating}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {(addMutation.isPending || isCreating)
                  ? <><Loader2 size={18} className="animate-spin" /> {progressText || 'Creating...'}</>
                  : <><Plus size={18} /> Create Event</>
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
