import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Mail, Send, Loader2, Lock, Reply, ShieldAlert, CheckCircle2 } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

export default function PrincipalsDesk() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);

  const isPrincipal = role === 'admin' || role === 'platform_admin';

  // Fetch messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['principals-desk', schoolSettings.school_id],
    queryFn: async () => {
      const query = supabase
        .from('principals_desk')
        .select(`*, sender:users!principals_desk_sender_id_fkey(name, role)`)
        .eq('school_id', schoolSettings.school_id)
        .order('created_at', { ascending: false });
        
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Submit message (Students/Teachers/Parents)
  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('principals_desk').insert({
        school_id: schoolSettings.school_id,
        sender_id: user.id,
        is_anonymous: isAnonymous,
        subject,
        message,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['principals-desk']);
      setSubject('');
      setMessage('');
      setIsAnonymous(false);
      alert('Your message has been securely sent to the Principal.');
    },
    onError: (err) => alert(err.message)
  });

  // Reply mutation (Admins)
  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }) => {
      const { error } = await supabase
        .from('principals_desk')
        .update({ reply_text: reply, status: 'replied' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['principals-desk']);
      setReplyingTo(null);
      setReplyText('');
    },
    onError: (err) => alert(err.message)
  });

  return (
    <ModuleGuard moduleName="principals_desk">
      <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="card text-center py-10" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
            <Mail size={32} />
          </div>
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">The Principal's Desk</h2>
          <p className="text-indigo-200/70 text-sm max-w-md mx-auto">
            {isPrincipal 
              ? "Review and respond to messages from your students and staff." 
              : "A secure, direct line to the school administration. You can choose to remain anonymous."}
          </p>
        </div>

        {/* Sender Form */}
        {!isPrincipal && (
          <div className="card border-t-4 border-indigo-500">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <Send size={18} className="text-indigo-600" />
              <h3 className="font-bold text-lg">Send a Message</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Subject</label>
                <input 
                  type="text" 
                  value={subject} 
                  onChange={e => setSubject(e.target.value)} 
                  placeholder="What is this regarding?" 
                  className="sp-input w-full"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Message</label>
                <textarea 
                  rows={4} 
                  value={message} 
                  onChange={e => setMessage(e.target.value)} 
                  placeholder="Write your message here..." 
                  className="sp-input w-full resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={isAnonymous} 
                    onChange={e => setIsAnonymous(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-900 transition-colors flex items-center gap-1.5">
                    <Lock size={14} className={isAnonymous ? "text-indigo-600" : "text-slate-400"} />
                    Keep my identity anonymous
                  </span>
                </label>

                <button 
                  onClick={() => submitMutation.mutate()} 
                  disabled={submitMutation.isPending || !subject.trim() || !message.trim()}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Submit Securely
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages Feed */}
        <div className="space-y-4">
          <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 px-2">
            {isPrincipal ? "Inbox" : "Your Messages"}
          </h3>
          
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
          ) : !messages || messages.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
              <Mail size={32} className="mx-auto text-slate-300 mb-3" />
              <div className="text-sm font-bold text-slate-500">No messages found.</div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className="card shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-800 text-base">{msg.subject}</h4>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {msg.is_anonymous ? (
                        <span className="bg-slate-800 text-white px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
                          <Lock size={10} /> Anonymous
                        </span>
                      ) : (
                        <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          {msg.sender?.name || 'Unknown User'} ({msg.sender?.role})
                        </span>
                      )}
                      <span className="text-slate-400 font-medium">
                        {new Date(msg.created_at).toLocaleDateString()} at {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                  {msg.status === 'replied' ? (
                     <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                       <CheckCircle2 size={12} /> Replied
                     </span>
                  ) : (
                     <span className="text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full text-xs font-bold">
                       Awaiting Reply
                     </span>
                  )}
                </div>
                
                <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                
                {/* Reply Block */}
                {msg.reply_text ? (
                  <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                    <div className="flex items-center gap-2 text-indigo-800 text-xs font-bold mb-2 uppercase tracking-wider">
                      <Reply size={14} /> Official Response
                    </div>
                    <p className="text-indigo-900 text-sm whitespace-pre-wrap">{msg.reply_text}</p>
                  </div>
                ) : isPrincipal ? (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    {replyingTo === msg.id ? (
                      <div className="space-y-3 animate-in slide-in-from-top-2">
                        <textarea 
                          rows={3}
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Type your official response..."
                          className="sp-input w-full text-sm resize-none"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setReplyingTo(null)} className="btn outline text-xs py-1.5">Cancel</button>
                          <button 
                            onClick={() => replyMutation.mutate({ id: msg.id, reply: replyText })}
                            disabled={!replyText.trim() || replyMutation.isPending}
                            className="btn-primary flex items-center gap-2 text-xs py-1.5"
                          >
                            {replyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Send Reply
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setReplyingTo(msg.id)} className="btn outline text-xs py-1.5 flex items-center gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                        <Reply size={14} /> Write Reply
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </ModuleGuard>
  );
}
