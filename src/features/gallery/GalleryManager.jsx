import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Image as ImageIcon, Plus, Loader2, X, ExternalLink, PlayCircle } from 'lucide-react';

export default function GalleryManager() {
  const { role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [link, setLink] = useState(''); // For direct URL fallback
  const [category, setCategory] = useState('Events');
  const [files, setFiles] = useState([]);
  const [uploadingGdrive, setUploadingGdrive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  
  // View state
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  const { data: media, isLoading } = useQuery({
    queryKey: ['gallery', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!schoolSettings?.school_id
  });

  const addMutation = useMutation({
    mutationFn: async (payloads) => {
      // Allow inserting an array of payloads
      const { error } = await supabase.from('gallery').insert(payloads);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
      setAddModalOpen(false);
      setTitle('');
      setLink('');
      setFiles([]);
      setUploadProgress('');
      setCategory('Events');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('gallery').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
    }
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    let payloads = [];

    if (files.length > 0 && schoolSettings?.gdrive_config) {
      // Validate max 5 files at a time to avoid timeout
      if (files.length > 5) {
        alert('Please select a maximum of 5 files at a time to avoid upload timeouts.');
        return;
      }

      setUploadingGdrive(true);
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Uploading ${i + 1} of ${files.length}...`);
        const currentFile = files[i];
        try {
          // Read file as base64
          const reader = new FileReader();
          const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
          });
          reader.readAsDataURL(currentFile);
          const fileBase64 = await base64Promise;

          const { data, error } = await supabase.functions.invoke('gdrive-upload', {
            body: {
              fileName: currentFile.name,
              mimeType: currentFile.type || 'application/octet-stream',
              fileBase64
            }
          });

          if (error) throw new Error(error.message);
          if (!data) throw new Error('No response from upload service. Please try again.');
          if (data?.error) throw new Error(data.error);
          if (!data.link) throw new Error('Upload succeeded but no link returned.');

          payloads.push({
            school_id: schoolSettings.school_id,
            title,
            link: data.link,
            category
          });
        } catch (err) {
          alert(`Failed on file "${currentFile.name}": ${err.message}`);
          setUploadingGdrive(false);
          setUploadProgress('');
          return;
        }
      }
      setUploadingGdrive(false);
      setUploadProgress('');
    } else if (link) {
       payloads.push({
         school_id: schoolSettings.school_id,
         title,
         link,
         category
       });
    } else {
       alert('Please select files or provide a direct URL.');
       return;
    }

    addMutation.mutate(payloads);
  };

  const isYouTube = (url) => url.includes('youtube.com') || url.includes('youtu.be');

  // Group media into albums by title + category
  const albums = Object.values((media || []).reduce((acc, item) => {
    const key = `${item.title}_${item.category}`;
    if (!acc[key]) acc[key] = { title: item.title, category: item.category, cover: item, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {}));

  return (
    <div className="space-y-8">
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
            <Plus size={20} /> Add Media
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : !media || media.length === 0 ? (
        <div className="text-center py-20 bg-white border-2 border-dashed border-border rounded-3xl text-muted">
          Your gallery is currently empty.
        </div>
      ) : selectedAlbum ? (
        <div className="fade-in space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-800">{selectedAlbum.title}</h3>
              <p className="text-sm text-slate-500 font-medium">{selectedAlbum.items.length} Photos • {selectedAlbum.category}</p>
            </div>
            <button onClick={() => setSelectedAlbum(null)} className="btn outline">Back to Albums</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {selectedAlbum.items.map((item) => (
              <div key={item.id} className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm group hover:border-primary/30 transition-all flex flex-col">
                <div className="aspect-square relative overflow-hidden bg-slate-100">
                  {isYouTube(item.link) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 group-hover:bg-slate-200 transition-colors">
                      <PlayCircle size={48} className="text-red-500 mb-2" />
                      <span className="text-xs font-bold uppercase tracking-widest">Video Content</span>
                    </div>
                  ) : (
                    <img 
                      src={item.link} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=2071&auto=format&fit=crop'; }}
                    />
                  )}
                  {role === 'admin' && (
                    <button 
                      onClick={() => { 
                        if(window.confirm('Delete this item?')) {
                          deleteMutation.mutate(item.id);
                          setSelectedAlbum(prev => prev.items.length <= 1 ? null : { ...prev, items: prev.items.filter(i => i.id !== item.id) });
                        }
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="p-3 bg-slate-50 border-t border-slate-100">
                  <a 
                    href={item.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all"
                  >
                     {isYouTube(item.link) ? 'Watch Video' : 'View Full Image'} <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {albums.map((album) => (
            <div 
              key={`${album.title}_${album.category}`} 
              className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm group hover:border-primary/50 transition-all cursor-pointer relative"
              onClick={() => setSelectedAlbum(album)}
            >
              <div className="aspect-[4/3] relative overflow-hidden bg-slate-100">
                {isYouTube(album.cover.link) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 group-hover:bg-slate-200 transition-colors">
                    <PlayCircle size={48} className="text-red-500 mb-2" />
                    <span className="text-xs font-bold uppercase tracking-widest">Video Content</span>
                  </div>
                ) : (
                  <img 
                    src={album.cover.link} 
                    alt={album.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=2071&auto=format&fit=crop'; }}
                  />
                )}
                {/* CSS Overlay for Title readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex flex-col justify-end p-4">
                  <h3 className="font-bold text-white text-lg leading-tight mb-1">{album.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-white/20 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-widest">
                      {album.category}
                    </span>
                    <span className="text-xs text-white/80 font-medium">{album.items.length} item{album.items.length > 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Media Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-800/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-lg text-text">Add to Gallery</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-muted hover:text-text"><X size={20} /></button>
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
                  <option value="Campus">Campus & Infrastructure</option>
                  <option value="Awards">Awards & Honors</option>
                </select>
              </div>
              {schoolSettings?.gdrive_config ? (
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Upload Photo/Video to Google Drive</label>
                  <input 
                    type="file" 
                    multiple
                    accept="image/*,video/*"
                    onChange={e => {
                      const selected = Array.from(e.target.files);
                      if (selected.length > 5) {
                        alert('Maximum 5 files allowed at a time.');
                        e.target.value = '';
                        return;
                      }
                      setFiles(selected);
                    }} 
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm text-sm" 
                  />
                  <p className="text-xs text-muted mt-2 text-green-600 font-semibold">Google Drive connected. Max 5 files at a time.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Direct Image URL or YouTube Link</label>
                  <input 
                    required 
                    value={link} 
                    onChange={e => setLink(e.target.value)} 
                    type="url" 
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm font-mono text-sm" 
                    placeholder="https://..." 
                  />
                  <p className="text-xs text-muted mt-2">To upload files directly, ask Platform Admin to connect Google Drive.</p>
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={addMutation.isPending || uploadingGdrive}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                {(addMutation.isPending || uploadingGdrive) ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                {(addMutation.isPending || uploadingGdrive) ? (uploadProgress || 'Uploading...') : 'Add Media'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
