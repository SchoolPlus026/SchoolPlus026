import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { HeartPulse, Loader2, Send, Calendar } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

const EMOJIS = [
  { id: 'happy', emoji: '😊', label: 'Great!' },
  { id: 'good',  emoji: '🙂', label: 'Good' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
  { id: 'sick',  emoji: '🤒', label: 'Unwell' },
];

/* ── Student View ────────────────────────────────────────────────────────── */
function StudentMoodNote({ schoolId, studentId }) {
  const [emoji, setEmoji] = useState('😊');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const monthYear = today.substring(0, 7); // 'YYYY-MM'

  const { data: record, isLoading } = useQuery({
    queryKey: ['mood-note', schoolId, studentId, monthYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('health_mood_notes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('student_id', studentId)
        .eq('month_year', monthYear)
        .single();
      return data || { notes: {} };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const currentNotes = record?.notes || {};
      const newNotes = { ...currentNotes, [today]: { emoji, note } };

      if (record?.id) {
        await supabase.from('health_mood_notes').update({ notes: newNotes }).eq('id', record.id);
      } else {
        await supabase.from('health_mood_notes').insert({
          school_id: schoolId,
          student_id: studentId,
          month_year: monthYear,
          notes: newNotes
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mood-note']);
      alert('Morning note saved for today!');
    }
  });

  const todaysNote = record?.notes?.[today];

  return (
    <div className="card" style={{ borderTop: '4px solid #ec4899', textAlign: 'center' }}>
      <h3 style={{ margin: '0 0 8px', fontWeight: 900, fontSize: '18px' }}>Good Morning!</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>How are you feeling today? Let your teacher know.</p>

      {todaysNote ? (
        <div style={{ padding: '24px', background: 'rgba(236,72,153,0.05)', borderRadius: '16px', border: '1px dashed rgba(236,72,153,0.3)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>{todaysNote.emoji}</div>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-main)' }}>You're all set for today.</p>
          {todaysNote.note && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>"{todaysNote.note}"</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            {EMOJIS.map(em => (
              <button
                key={em.id}
                onClick={() => setEmoji(em.emoji)}
                style={{
                  width: '60px', height: '60px', borderRadius: '16px', fontSize: '28px',
                  background: emoji === em.emoji ? 'rgba(236,72,153,0.1)' : 'var(--bg-main)',
                  border: `2px solid ${emoji === em.emoji ? '#ec4899' : 'var(--card-border)'}`,
                  cursor: 'pointer', transition: 'all 0.2s ease',
                  transform: emoji === em.emoji ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {em.emoji}
              </button>
            ))}
          </div>

          <input 
            type="text" value={note} onChange={e => setNote(e.target.value)} 
            placeholder="Any special notes? (e.g. didn't sleep well)" 
            className="sp-input" style={{ width: '100%', textAlign: 'center' }} 
          />

          <button 
            onClick={() => updateMutation.mutate()} 
            disabled={updateMutation.isPending}
            className="btn" style={{ background: '#ec4899', color: '#fff', margin: '0 auto' }}
          >
            {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit Daily Note
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Teacher View ────────────────────────────────────────────────────────── */
function TeacherMoodNote({ schoolId, userClass }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const monthYear = date.substring(0, 7);

  // Fetch students in class
  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['mood-students', schoolId, userClass],
    queryFn: async () => {
      let q = supabase.from('users').select('id, name').eq('school_id', schoolId).eq('role', 'student');
      if (userClass) q = q.eq('class', userClass);
      const { data } = await q.order('name');
      return data || [];
    },
  });

  const studentIds = students.map(s => s.id);

  // Fetch notes for those students for this month
  const { data: notesList = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['mood-notes', schoolId, monthYear, studentIds],
    queryFn: async () => {
      if (!studentIds.length) return [];
      const { data } = await supabase
        .from('health_mood_notes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('month_year', monthYear)
        .in('student_id', studentIds);
      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  const isLoading = loadingStudents || loadingNotes;

  const notesMap = notesList.reduce((acc, row) => {
    acc[row.student_id] = row.notes?.[date];
    return acc;
  }, {});

  return (
    <div className="card" style={{ borderTop: '4px solid #ec4899' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, fontWeight: 800 }}>Class Mood Overview ({userClass})</h3>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="sp-input" style={{ width: 'auto' }} />
      </div>

      {isLoading ? <Loader2 className="animate-spin mx-auto text-slate-400 my-8" /> : 
       students.length === 0 ? <p className="text-center text-slate-400 py-8">No students found.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {students.map(s => {
            const dayNote = notesMap[s.id];
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{s.name}</span>
                {dayNote ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {dayNote.note && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{dayNote.note}"</span>}
                    <span style={{ fontSize: '24px' }}>{dayNote.emoji}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontWeight: 600 }}>No entry</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function MoodNote() {
  const { user, role, schoolSettings } = useAppStore();
  const isTeacher = role === 'teacher';

  return (
    <ModuleGuard moduleName="mood_note">
      <div className="fade-in max-w-3xl mx-auto pb-12">
        
        {/* Header */}
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #831843, #be185d)',
          padding: '28px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '18px',
        }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '15px', background: 'rgba(244,114,182,0.2)', border: '1px solid rgba(244,114,182,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <HeartPulse size={26} color="#f9a8d4" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Health & Mood Note</h2>
            <p style={{ color: 'rgba(252,231,243,0.65)', fontSize: '13px', margin: '4px 0 0' }}>
              {isTeacher ? 'Daily overview of your students\' morning check-ins.' : 'Send a quick morning note to your teacher.'}
            </p>
          </div>
        </div>

        {isTeacher ? (
          <TeacherMoodNote schoolId={schoolSettings.school_id} userClass={user?.class} />
        ) : (
          <StudentMoodNote schoolId={schoolSettings.school_id} studentId={user.id} />
        )}
      </div>
    </ModuleGuard>
  );
}
