import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { triggerFCMNotification } from '../../utils/notifications';
import { Loader2, Send, PenTool } from 'lucide-react';
import NoticeBoard from './NoticeBoard';

export default function NoticeManager() {
  const { schoolSettings, role } = useAppStore();
  const queryClient = useQueryClient();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState(role === 'teacher' ? 'students' : 'all');
  const [photoLink, setPhotoLink] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const broadcastMutation = useMutation({
    mutationFn: async (payload) => {
      // 1. Physically Insert into the Postgres Database Tree
      const { data, error } = await supabase
        .from('notices')
        .insert({
           school_id: schoolSettings.school_id,
           title: payload.title,
           content: payload.content,
           date: new Date().toISOString().split('T')[0],
           scope: payload.scope,
           photo_link: payload.photoLink || null
        });
        
      if (error) throw error;
      
      // 2. Fire the simulated Firebase push notification beam wrapper
      await triggerFCMNotification(payload.title, payload.scope, schoolSettings.school_id);
    },
    onSuccess: () => {
      // Hydrate React Query UI immediately
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      setTitle('');
      setContent('');
      setScope(role === 'teacher' ? 'students' : 'all');
      setPhotoLink('');
      setIsComposing(false);
    }
  });

  const handleBroadcast = (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    
    broadcastMutation.mutate({ title, content, scope, photoLink });
  };

  return (
    <div className="space-y-8">
      {/* Action Header Container */}
      <div className="flex justify-between items-center bg-[#0a1128] p-5 rounded-2xl border border-glass shadow-xl relative overflow-hidden">
         {/* Deep flare aesthetic */}
         <div className="absolute left-0 bottom-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full -ml-16 -mb-16 pointer-events-none"></div>

         <div className="relative z-10">
            <h2 className="text-xl font-bold text-white tracking-tight mb-1">Notice Board Manager</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Send school-wide announcements</p>
         </div>
         <button 
           onClick={() => setIsComposing(!isComposing)}
           className={`relative z-10 flex items-center gap-2 px-5 py-2.5 font-bold uppercase tracking-wider text-xs rounded-xl transition-all shadow-lg ${isComposing ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-primary hover:bg-primary-dark text-white shadow-primary/30'}`}
         >
           {isComposing ? 'Cancel Notice' : <><PenTool size={16}/> New Notice</>}
         </button>
      </div>

      {/* Primary Composer Module */}
      {isComposing && (
        <div className="bg-surface border border-glass rounded-2xl p-6 shadow-2xl animate-in slide-in-from-top-4 duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 mb-6 border-b border-glass pb-3">New Notice Details</h3>
          
          <form onSubmit={handleBroadcast} className="space-y-5 relative z-10">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1">
                <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Notice Title</label>
                <input 
                  type="text" 
                  autoFocus
                  required 
                  maxLength={100}
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors font-medium text-lg placeholder-slate-600 shadow-inner"
                  placeholder="e.g. Critical Update: Emergency Closure Today"
                />
              </div>
              <div className="w-full sm:w-72 flex-shrink-0">
                <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Send To Scope</label>
                <select 
                  value={scope} 
                  onChange={e => setScope(e.target.value)} 
                  className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none cursor-pointer shadow-inner"
                >
                  {role !== 'teacher' && <option value="all">Global (All Users)</option>}
                  <option value="students">My Students Only</option>
                  {role !== 'teacher' && <option value="teachers">Teachers Only</option>}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Photo Link (Optional)</label>
              <input 
                type="url" 
                value={photoLink} 
                onChange={e => setPhotoLink(e.target.value)} 
                className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors font-medium text-sm placeholder-slate-600 shadow-inner"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold tracking-widest text-slate-400 mb-2 uppercase">Message Content</label>
              <textarea 
                required 
                value={content} 
                onChange={e => setContent(e.target.value)} 
                rows="6"
                className="w-full bg-[#0a1128] border border-glass rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors text-sm leading-relaxed placeholder-slate-600 custom-scrollbar resize-y shadow-inner"
                placeholder="Write the details of this notice here..."
              ></textarea>
            </div>

            <div className="flex justify-end pt-4 border-t border-glass">
               <button 
                 disabled={broadcastMutation.isPending} 
                 className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wider text-xs px-8 py-4 rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
               >
                  {broadcastMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {broadcastMutation.isPending ? 'Sending...' : 'Send Notice'}
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
