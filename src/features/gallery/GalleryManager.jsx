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
  const [file, setFile] = useState(null);
  const [uploadingGdrive, setUploadingGdrive] = useState(false);

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
    mutationFn: async (payload) => {
      const { error } = await supabase.from('gallery').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
      setAddModalOpen(false);
      setTitle('');
      setLink('');
      setFile(null);
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
    let finalLink = link;

    if (file && schoolSettings?.gdrive_config) {
      setUploadingGdrive(true);
      try {
        // Read file as base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = error => reject(error);
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        const { data, error } = await supabase.functions.invoke('gdrive-upload', {
          body: {
            fileName: file.name,
            mimeType: file.type,
            fileBase64
          }
        });

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        finalLink = data.link;
      } catch (err) {
        alert('Google Drive upload failed: ' + err.message);
        setUploadingGdrive(false);
        return;
      }
      setUploadingGdrive(false);
    } else if (!finalLink) {
       alert('Please provide a direct URL or connect Google Drive to upload files.');
       return;
    }

    addMutation.mutate({
      school_id: schoolSettings.school_id,
      title,
      link: finalLink,
      category
    });
  };

  const isYouTube = (url) => url.includes('youtube.com') || url.includes('youtu.be');

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {media.map((item) => (
            <div key={item.id} className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm group hover:border-primary/30 transition-all flex flex-col">
              <div className="aspect-video relative overflow-hidden bg-slate-100">
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
                    onClick={() => { if(window.confirm('Delete this item?')) deleteMutation.mutate(item.id) }}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="absolute top-2 left-2 px-2.5 py-1 bg-slate-800/40 backdrop-blur-md rounded-lg text-[10px] font-bold text-white uppercase tracking-widest">
                  {item.category}
                </div>
              </div>
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-slate-800 mb-3 line-clamp-1">{item.title}</h3>
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-auto flex items-center justify-center gap-2 w-full py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all"
                >
                   {isYouTube(item.link) ? 'Watch Video' : 'View Full Image'} <ExternalLink size={12} />
                </a>
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
                    accept="image/*,video/*"
                    onChange={e => setFile(e.target.files[0])} 
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm text-sm" 
                  />
                  <p className="text-xs text-muted mt-2 text-green-600 font-semibold">Google Drive connected. File will be uploaded securely.</p>
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
                {(addMutation.isPending || uploadingGdrive) ? 'Uploading...' : 'Add Media'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
