import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Megaphone, Calendar, Users, Briefcase, Trash2, PenTool, Clock } from 'lucide-react';

const getDirectGDriveImageUrl = (url) => {
  if (!url) return '';
  if (url.includes('drive.google.com')) {
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
    }
  }
  return url;
};

export default function NoticeBoard() {
  const { role, schoolSettings, user } = useAppStore();
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
        .eq('school_id', schoolSettings.school_id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (role === 'student') {
        const studentClass = user?.class ? user.class.toString().trim() : '';
        const baseClass = studentClass.includes('-') ? studentClass.split('-')[0].trim() : studentClass;
        
        const orConditions = ['scope.eq.all', 'scope.eq.students'];
        if (studentClass) orConditions.push(`scope.eq.class:${studentClass}`);
        if (baseClass && baseClass !== studentClass) orConditions.push(`scope.eq.class:${baseClass}`);
        
        query = query.or(orConditions.join(','));
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
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData(['notices', schoolSettings?.school_id, role], (old) => {
        return old ? old.filter(n => n.id !== id) : [];
      });
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
    if (!scope) return <Megaphone size={14} />;
    if (scope.startsWith('class:')) return <Users size={14} />;
    if (scope === 'students') return <Users size={14} />;
    if (scope === 'teachers') return <Briefcase size={14} />;
    return <Megaphone size={14} />;
  };

  const getScopeLabel = (scope) => {
    if (!scope) return 'Global Broadcast';
    if (scope.startsWith('class:')) return `Targeted: Class ${scope.replace('class:', '')}`;
    if (scope === 'students') return 'Targeted: Students & Parents';
    if (scope === 'teachers') return 'Targeted: Campus Staff';
    return 'Global Broadcast';
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="section-title">
         <Megaphone className="text-accent" />
         <h3>Notice Board</h3>
      </div>

      {/* Notice Retention Policy Info Banner */}
      <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-8px' }}>
        <Clock size={14} className="text-indigo-400" />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Notice retention policy: Notices are automatically deleted after <strong>{
            schoolSettings?.notice_retention_months_override || (schoolSettings?.plan_type === 'free' ? 3 : 6)
          } month(s)</strong>.
        </span>
      </div>

      {notices?.length === 0 ? (
        <div className="card text-center py-5 muted small">
           No active notices.
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((notice) => (
             <div key={notice.id} className="card">
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{ width: '50px', height: '50px', background: 'var(--glass)', borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--accent)' }}>
                        <Megaphone size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', flexWrap: 'wrap', gap: '10px' }}>
                            <h4 style={{ margin: 0 }}>{notice.title}</h4>
                            <span className="muted small text-right">{new Date(notice.date).toLocaleDateString('en-US', { 'month': 'short', 'day': 'numeric', 'year': 'numeric' })}</span>
                        </div>
                        <p className="muted small mb-0"><span className="badge">{getScopeLabel(notice.scope)}</span></p>
                        
                        {editingId === notice.id ? (
                            <div className="mt-4 p-4 rounded-xl border border-border bg-slate-50 dark:bg-slate-900 border-white/5">
                                <input 
                                   type="text" 
                                   value={editTitle} 
                                   onChange={e => setEditTitle(e.target.value)} 
                                   className="sp-input mb-3"
                                />
                                <textarea 
                                   rows="4" 
                                   value={editContent} 
                                   onChange={e => setEditContent(e.target.value)} 
                                   className="sp-input mb-3 custom-scrollbar"
                                />
                                <div className="flex justify-end gap-2">
                                   <button onClick={() => setEditingId(null)} className="btn outline text-xs">Cancel</button>
                                   <button onClick={() => saveEditMutation.mutate({ id: notice.id, title: editTitle, content: editContent })} className="btn btn-primary text-xs">Save</button>
                                </div>
                            </div>
                        ) : (
                            <p style={{ marginTop: '10px', fontSize: '0.95em', whiteSpace: 'pre-wrap' }}>
                                {notice.content}
                            </p>
                        )}
                        
                        {notice.photo_url && (
                            <div className="mt-4 border border-glass rounded-xl overflow-hidden shadow-sm bg-slate-900 w-full max-w-sm">
                                <img 
                                src={getDirectGDriveImageUrl(notice.photo_url)} 
                                alt="Notice Attachment" 
                                className="w-full h-auto object-contain" 
                                referrerPolicy="no-referrer"
                                onError={(e) => e.target.style.display = 'none'}
                                />
                            </div>
                        )}

                        {editingId !== notice.id && (() => {
                          const cleanRole = (role || '').toLowerCase();
                          const canEditOrDelete =
                            cleanRole === 'admin' ||
                            cleanRole === 'app_manager' ||
                            cleanRole === 'platform_admin' ||
                            (cleanRole === 'teacher' && 
                              (notice.author_id === user?.id || 
                                (notice.author_id === null && notice.author_role === 'teacher')
                              )
                            );
                          
                          if (!canEditOrDelete) return null;

                          return (
                            <div className="flex gap-2 mt-4 pt-4 border-t border-glass">
                                <button onClick={() => handleEditClick(notice)} className="muted border-0 bg-transparent cursor-pointer p-0 hover:text-indigo-400" title="Edit"><PenTool size={16} /></button>
                                <button onClick={() => deleteMutation.mutate(notice.id)} disabled={deleteMutation.isPending} className="muted border-0 bg-transparent cursor-pointer p-0 hover:text-red-400 ml-2" title="Delete"><Trash2 size={16} /></button>
                            </div>
                          );
                        })()}
                    </div>
                </div>
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
