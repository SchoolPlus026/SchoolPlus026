import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Megaphone, Calendar, Users, Briefcase, Trash2, PenTool } from 'lucide-react';

export default function NoticeBoard() {
  const { role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = React.useState(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editContent, setEditContent] = React.useState('');

  const { data: notices, isLoading } = useQuery({
    queryKey: ['notices', schoolSettings?.school_id, role],
    queryFn: async () => {
      // Build the scope query payload based strictly on the active router role map.
      let query = supabase
        .from('notices')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (role === 'student') {
        query = query.in('scope', ['all', 'students']);
      } else if (role === 'teacher') {
        query = query.in('scope', ['all', 'teachers']);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolSettings?.school_id
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('notices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
    }
  });

  const saveEditMutation = useMutation({
    mutationFn: async ({ id, title, content }) => {
      const { error } = await supabase.from('notices').update({ title, content }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      setEditingId(null);
    }
  });

  const handleEditClick = (notice) => {
    setEditingId(notice.id);
    setEditTitle(notice.title);
    setEditContent(notice.content);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getScopeIcon = (scope) => {
    if (scope === 'students') return <Users size={14} />;
    if (scope === 'teachers') return <Briefcase size={14} />;
    return <Megaphone size={14} />;
  };

  const getScopeLabel = (scope) => {
    if (scope === 'students') return 'Targeted: Students & Parents';
    if (scope === 'teachers') return 'Targeted: Campus Staff';
    return 'Global Broadcast';
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center gap-3 px-2 mb-2">
         <Megaphone className="text-primary" size={24} />
         <h2 className="text-2xl font-bold text-white tracking-tight">Timeline Announcements</h2>
      </div>

      {notices?.length === 0 ? (
        <div className="bg-surface border border-glass rounded-2xl p-12 text-center shadow-xl">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-glass">
             <Calendar size={32} className="text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">No active transmissions</h3>
          <p className="text-slate-400 text-sm mt-1">Your timeline is currently fully clear.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {notices.map((notice) => (
             <div key={notice.id} className="relative overflow-hidden bg-surface/80 backdrop-blur-md rounded-2xl border border-glass shadow-lg hover:border-primary/30 transition-all group">
                {/* Visual Flair Base Line */}
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-accent"></div>
                
                <div className="p-6 pl-8">
                   <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 border-b border-glass pb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white tracking-tight leading-snug">{notice.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/40 text-slate-300 border border-glass shadow-inner">
                             <Calendar size={12}/> {new Date(notice.date).toLocaleDateString('en-US', { 'month': 'short', 'day': 'numeric', 'year': 'numeric' })}
                          </span>
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-inner ${notice.scope === 'all' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                             {getScopeIcon(notice.scope)} {getScopeLabel(notice.scope)}
                          </span>
                        </div>
                      </div>
                      
                      {role !== 'student' && (
                        <div className="flex gap-2">
                          <button 
                             onClick={() => handleEditClick(notice)}
                             className="flex-shrink-0 text-slate-500 hover:text-indigo-400 p-2 rounded-xl hover:bg-indigo-500/10 transition-colors"
                          >
                             <PenTool size={16} />
                          </button>
                          <button 
                             onClick={() => deleteMutation.mutate(notice.id)}
                             disabled={deleteMutation.isPending}
                             className="flex-shrink-0 text-slate-500 hover:text-red-400 p-2 rounded-xl hover:bg-red-500/10 transition-colors"
                          >
                             <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                   </div>
                   
                   {editingId === notice.id ? (
                     <div className="mt-4 bg-[#0a1128] p-4 rounded-xl border border-glass">
                        <input 
                           type="text" 
                           value={editTitle} 
                           onChange={e => setEditTitle(e.target.value)} 
                           className="w-full mb-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                        />
                        <textarea 
                           rows="4" 
                           value={editContent} 
                           onChange={e => setEditContent(e.target.value)} 
                           className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm mb-3 custom-scrollbar"
                        />
                        <div className="flex justify-end gap-2">
                           <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white">Cancel</button>
                           <button onClick={() => saveEditMutation.mutate({ id: notice.id, title: editTitle, content: editContent })} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Save</button>
                        </div>
                     </div>
                   ) : (
                     <div className="text-slate-300 text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                       {notice.content}
                     </div>
                   )}
                   
                   {notice.photo_link && (
                      <div className="mt-5 border border-glass rounded-xl overflow-hidden shadow-lg bg-[#0a1128]">
                        <img 
                          src={notice.photo_link} 
                          alt="Notice Attachment" 
                          className="w-full h-auto max-h-96 object-contain" 
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      </div>
                   )}
                </div>
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
