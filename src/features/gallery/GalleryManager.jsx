import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Image as ImageIcon, Plus, Loader2, X, ExternalLink, Folder } from 'lucide-react';

export default function GalleryManager() {
  const { role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [link, setLink] = useState(''); // For direct URL fallback
  const [category, setCategory] = useState('Events');
  const [isCreating, setIsCreating] = useState(false);
  const [progressText, setProgressText] = useState('');
  
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
      setCategory('Events');
      setProgressText('');
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

    if (schoolSettings?.gdrive_config && !link) {
      setIsCreating(true);
      setProgressText('Creating Google Drive Folder...');
      try {
        const { data, error } = await supabase.functions.invoke('gdrive-upload', {
          body: {
            action: 'create_folder',
            folderName: title
          }
        });

        if (error) throw new Error(error.message);
        if (!data || data.error) throw new Error(data?.error || 'Failed to create folder');
        if (!data.link) throw new Error('No link returned from Google Drive');

        finalLink = data.link;
      } catch (err) {
        alert(`Failed to create folder: ${err.message}`);
        setIsCreating(false);
        setProgressText('');
        return;
      }
      setIsCreating(false);
      setProgressText('');
    }

    if (!finalLink) {
       alert('Please provide a direct URL or connect Google Drive.');
       return;
    }

    addMutation.mutate({
      school_id: schoolSettings.school_id,
      title,
      link: finalLink,
      category
    });
  };

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
            <Plus size={20} /> Add Event
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
            <div 
              key={item.id} 
              className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm group hover:border-primary/50 transition-all flex flex-col relative"
            >
              <div className="aspect-[4/3] relative overflow-hidden bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <Folder size={64} className="text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{item.title}</h3>
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-widest mt-2">
                  {item.category}
                </span>
                
                {role === 'admin' && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      if(window.confirm('Delete this event?')) {
                        deleteMutation.mutate(item.id);
                      }
                    }}
                    className="absolute top-3 right-3 p-2 bg-red-100 text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="p-3 bg-white border-t border-slate-100">
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all"
                >
                   Open <ExternalLink size={16} />
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
              <h3 className="font-bold text-lg text-text">Create Gallery Event</h3>
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
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
                    <p className="font-semibold flex items-center gap-2 mb-1"><Folder size={16} /> Google Drive Connected</p>
                    <p className="text-blue-600/80">A new shared folder will be automatically created in your Google Drive for this event.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Direct Folder URL (e.g. Google Drive Link)</label>
                  <input 
                    required 
                    value={link} 
                    onChange={e => setLink(e.target.value)} 
                    type="url" 
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary shadow-sm font-mono text-sm" 
                    placeholder="https://..." 
                  />
                  <p className="text-xs text-muted mt-2">To create folders automatically, ask Platform Admin to connect Google Drive.</p>
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={addMutation.isPending || isCreating}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                {(addMutation.isPending || isCreating) ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                {(addMutation.isPending || isCreating) ? (progressText || 'Creating...') : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
