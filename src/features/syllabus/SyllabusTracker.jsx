import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { BookOpen, CheckCircle2, Circle, Clock, Loader2, Plus, Save } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

/* ── Teacher View ────────────────────────────────────────────────────────── */
function TeacherSyllabus({ schoolId, teacherId, userClass }) {
  const [subject, setSubject] = useState('');
  const [newChapter, setNewChapter] = useState('');
  const queryClient = useQueryClient();

  const { data: syllabus, isLoading } = useQuery({
    queryKey: ['syllabus', schoolId, userClass, subject],
    queryFn: async () => {
      if (!subject) return null;
      const { data } = await supabase
        .from('syllabus_tracker')
        .select('*')
        .eq('school_id', schoolId)
        .eq('class', userClass)
        .eq('subject', subject)
        .single();
      return data || { chapters: [] };
    },
    enabled: !!subject && !!userClass,
  });

  const updateMutation = useMutation({
    mutationFn: async (newChapters) => {
      if (syllabus?.id) {
        await supabase.from('syllabus_tracker')
          .update({ chapters: newChapters, updated_by: teacherId, updated_at: new Date().toISOString() })
          .eq('id', syllabus.id);
      } else {
        await supabase.from('syllabus_tracker')
          .insert({ school_id: schoolId, class: userClass, subject, chapters: newChapters, updated_by: teacherId });
      }
    },
    onSuccess: () => queryClient.invalidateQueries(['syllabus']),
  });

  const handleAdd = () => {
    if (!newChapter.trim()) return;
    const ch = { id: Date.now().toString(), title: newChapter, status: 'Not Started' };
    updateMutation.mutate([...(syllabus?.chapters || []), ch]);
    setNewChapter('');
  };

  const handleStatus = (chapterId, newStatus) => {
    const updated = (syllabus?.chapters || []).map(c => 
      c.id === chapterId ? { ...c, status: newStatus } : c
    );
    updateMutation.mutate(updated);
  };

  return (
    <div className="card" style={{ borderTop: '4px solid #38bdf8' }}>
      <h3 style={{ margin: '0 0 16px', fontWeight: 800 }}>Manage Syllabus ({userClass})</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Subject</label>
        <select value={subject} onChange={e => setSubject(e.target.value)} className="sp-input w-full">
          <option value="">-- Choose Subject --</option>
          <option value="Mathematics">Mathematics</option>
          <option value="Science">Science</option>
          <option value="English">English</option>
          <option value="History">History</option>
        </select>
      </div>

      {subject && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input type="text" value={newChapter} onChange={e => setNewChapter(e.target.value)} placeholder="Add new chapter..." className="sp-input flex-1" />
            <button onClick={handleAdd} disabled={updateMutation.isPending} className="btn accent" style={{ width: 'auto' }}>
              {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {isLoading ? <Loader2 className="animate-spin mx-auto text-slate-400" /> : 
             (syllabus?.chapters || []).length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No chapters added yet.</p> :
             (syllabus?.chapters || []).map(ch => (
              <div key={ch.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{ch.title}</span>
                <select 
                  value={ch.status} 
                  onChange={e => handleStatus(ch.id, e.target.value)}
                  className="sp-input"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: 'auto', 
                           color: ch.status === 'Completed' ? '#10b981' : ch.status === 'In Progress' ? '#f59e0b' : 'var(--text-muted)' }}
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Student View ────────────────────────────────────────────────────────── */
function StudentSyllabus({ schoolId, userClass }) {
  const { data: allSyllabus, isLoading } = useQuery({
    queryKey: ['syllabus', schoolId, userClass],
    queryFn: async () => {
      const { data } = await supabase
        .from('syllabus_tracker')
        .select('*')
        .eq('school_id', schoolId)
        .eq('class', userClass);
      return data || [];
    },
    enabled: !!userClass,
  });

  if (isLoading) return <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>;
  if (!allSyllabus?.length) return <div className="card text-center text-slate-500 py-12">No syllabus available for your class yet.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {allSyllabus.map(subjectSyllabus => {
        const chapters = subjectSyllabus.chapters || [];
        const completed = chapters.filter(c => c.status === 'Completed').length;
        const progress = chapters.length > 0 ? Math.round((completed / chapters.length) * 100) : 0;

        return (
          <div key={subjectSyllabus.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={18} color="#38bdf8" /> {subjectSyllabus.subject}
              </h3>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '4px 10px', borderRadius: '999px' }}>
                {progress}%
              </span>
            </div>
            
            <div style={{ height: '6px', background: 'var(--card-border)', borderRadius: '999px', marginBottom: '20px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#38bdf8', transition: 'width 0.5s ease' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chapters.map(ch => (
                <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                  {ch.status === 'Completed' ? <CheckCircle2 size={16} color="#10b981" /> :
                   ch.status === 'In Progress' ? <Clock size={16} color="#f59e0b" /> :
                   <Circle size={16} color="var(--text-faint)" />}
                  <span style={{ color: ch.status === 'Completed' ? 'var(--text-muted)' : 'var(--text-main)', textDecoration: ch.status === 'Completed' ? 'line-through' : 'none', flex: 1 }}>
                    {ch.title}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)' }}>{ch.status}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function SyllabusTracker() {
  const { user, role, schoolSettings } = useAppStore();
  const isTeacher = role === 'teacher';
  
  return (
    <ModuleGuard moduleName="syllabus">
      <div className="fade-in max-w-4xl mx-auto pb-12">
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #0f172a, #0369a1)',
          padding: '28px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '18px',
        }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '15px', background: 'rgba(56,189,248,0.2)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={26} color="#7dd3fc" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Syllabus Tracker</h2>
            <p style={{ color: 'rgba(224,242,254,0.65)', fontSize: '13px', margin: '4px 0 0' }}>
              {isTeacher ? 'Track curriculum progress for your class.' : 'Check what has been covered in class today.'}
            </p>
          </div>
        </div>

        {isTeacher ? (
          <TeacherSyllabus schoolId={schoolSettings.school_id} teacherId={user.id} userClass={user?.class} />
        ) : (
          <StudentSyllabus schoolId={schoolSettings.school_id} userClass={user?.class} />
        )}
      </div>
    </ModuleGuard>
  );
}
