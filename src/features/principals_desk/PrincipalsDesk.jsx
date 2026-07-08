import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import {
  MessageSquare, Send, Loader2, Lock, Reply,
  CheckCircle2, ChevronDown, User, ShieldCheck
} from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';
import { usePlan } from '../../hooks/usePlan';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmt = (ts) => new Date(ts).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

/* ─── Compose Form (Students) ──────────────────────────────────────────────── */
function StudentCompose({ schoolId, senderId, userClass, queryClient }) {
  const { isFree } = usePlan();
  const [recipientType, setRecipientType] = useState('admin'); // 'admin' | 'teacher'
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Fetch teachers in the same school (filtered by student's class)
  const { data: teachers = [] } = useQuery({
    queryKey: ['school-teachers', schoolId, userClass],
    queryFn: async () => {
      let q = supabase
        .from('users')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('role', 'teacher');
      
      if (userClass) {
        q = q.eq('class', userClass);
      }
      
      const { data } = await q.order('name');
      return data || [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (isFree) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count, error: countErr } = await supabase
          .from('complaint_box')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .gte('created_at', startOfMonth);

        if (countErr) {
          console.error('Error checking complaint count:', countErr);
        } else if (count >= 10) {
          throw new Error('Free Plan limit reached: You can submit a maximum of 10 complaints/suggestions per month on the Free Plan. Please upgrade to the Premium Plan.');
        }
      }

      const payload = {
        school_id: schoolId,
        sender_id: senderId,
        sender_role: 'student',
        is_anonymous: isAnonymous,
        recipient_type: recipientType,
        recipient_id: recipientType === 'teacher' ? recipientId || null : null,
        subject,
        message,
      };
      const { error } = await supabase.from('complaint_box').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint-box'] });
      queryClient.invalidateQueries({ queryKey: ['executive-briefing'] });
      setSubject(''); setMessage(''); setIsAnonymous(false);
      setRecipientId(''); setRecipientType('admin');
      alert('Your complaint has been submitted securely.');
    },
    onError: (err) => alert(err.message),
  });

  return (
    <div className="card" style={{ borderTop: '4px solid #6366f1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Send size={18} color="#6366f1" />
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>Submit a Complaint</h3>
      </div>

      {/* Recipient selector */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Send To</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { value: 'admin', label: 'School Admin / Principal', icon: <ShieldCheck size={15} /> },
            { value: 'teacher', label: 'My Class Teacher', icon: <User size={15} /> },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setRecipientType(opt.value); setRecipientId(''); }}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: '12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700,
                background: recipientType === opt.value ? 'rgba(99,102,241,0.12)' : 'var(--input-bg)',
                border: `1.5px solid ${recipientType === opt.value ? '#6366f1' : 'var(--card-border)'}`,
                color: recipientType === opt.value ? '#6366f1' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Teacher picker */}
      {recipientType === 'teacher' && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Select Teacher</label>
          <div style={{ position: 'relative' }}>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="sp-input"
              style={{ width: '100%', paddingRight: '32px', appearance: 'none' }}
            >
              <option value="">— Choose your class teacher —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
          </div>
        </div>
      )}

      {/* Subject */}
      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief topic of your complaint" className="sp-input" style={{ width: '100%' }} />
      </div>

      {/* Message */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Message</label>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the issue in detail..." className="sp-input"
          style={{ width: '100%', resize: 'none' }} />
      </div>

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)}
            style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: isAnonymous ? '#6366f1' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Lock size={13} /> Keep my identity anonymous
          </span>
        </label>
        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !subject.trim() || !message.trim() || (recipientType === 'teacher' && !recipientId)}
          className="btn accent"
          style={{ width: 'auto', padding: '10px 20px' }}
        >
          {submit.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Submit Securely
        </button>
      </div>
    </div>
  );
}

/* ─── Teacher Compose Form ─────────────────────────────────────────────────── */
function TeacherCompose({ schoolId, senderId, userClass, queryClient }) {
  const { isFree } = usePlan();
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  // Fetch students in the teacher's school (filtered by teacher's class)
  const { data: students = [] } = useQuery({
    queryKey: ['school-students', schoolId, userClass],
    queryFn: async () => {
      let q = supabase
        .from('users')
        .select('id, name, class')
        .eq('school_id', schoolId)
        .eq('role', 'student');
      
      if (userClass) {
        q = q.eq('class', userClass);
      }
      
      const { data } = await q.order('name');
      return data || [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (isFree) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count, error: countErr } = await supabase
          .from('complaint_box')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .gte('created_at', startOfMonth);

        if (countErr) {
          console.error('Error checking complaint count:', countErr);
        } else if (count >= 10) {
          throw new Error('Free Plan limit reached: You can submit a maximum of 10 complaints/suggestions per month on the Free Plan. Please upgrade to the Premium Plan.');
        }
      }

      const { error } = await supabase.from('complaint_box').insert({
        school_id: schoolId,
        sender_id: senderId,
        sender_role: 'teacher',
        is_anonymous: false, // Teachers always identified
        recipient_type: 'student',
        recipient_id: recipientId,
        subject,
        message,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint-box'] });
      queryClient.invalidateQueries({ queryKey: ['executive-briefing'] });
      setSubject(''); setMessage(''); setRecipientId('');
      alert('Message sent to the student.');
    },
    onError: (err) => alert(err.message),
  });

  return (
    <div className="card" style={{ borderTop: '4px solid #f59e0b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Send size={18} color="#f59e0b" />
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: '16px' }}>Send Message to Student</h3>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Select Student</label>
        <div style={{ position: 'relative' }}>
          <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}
            className="sp-input" style={{ width: '100%', paddingRight: '32px', appearance: 'none' }}>
            <option value="">— Choose a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.class ? ` (${s.class})` : ''}</option>
            ))}
          </select>
          <ChevronDown size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject of the message" className="sp-input" style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Message</label>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your message here..." className="sp-input" style={{ width: '100%', resize: 'none' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !subject.trim() || !message.trim() || !recipientId}
          className="btn"
          style={{ width: 'auto', padding: '10px 20px', background: '#f59e0b', color: '#fff' }}
        >
          {submit.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Send to Student
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)', marginBottom: '6px',
};

export default function ComplaintBox() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);

  const isAdmin = role === 'admin' || role === 'platform_admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  // Fetch complaints
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['complaint-box', schoolSettings.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_box')
        .select(`
          *,
          sender:users!complaint_box_sender_id_fkey(name, role, class),
          recipient:users!complaint_box_recipient_id_fkey(name, role)
        `)
        .eq('school_id', schoolSettings.school_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }) => {
      const complaint = messages.find(m => m.id === id);
      if (!complaint) throw new Error("Complaint not found");

      const { error } = await supabase
        .from('complaint_box')
        .update({ reply_text: reply, status: 'replied', replied_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      // Enqueue notification for the student (sender of the complaint)
      const notif = {
        school_id: schoolSettings.school_id,
        user_id: complaint.sender_id,
        title: 'New Reply to your Complaint',
        body: `Reply: ${complaint.subject}`,
        is_ephemeral: false,
        status: 'pending',
        route: '/complaint-box'
      };
      await supabase.from('app_notifications_queue').insert(notif);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaint-box'] });
      queryClient.invalidateQueries({ queryKey: ['executive-briefing'] });
      setReplyingTo(null); setReplyText('');
    },
    onError: (err) => alert(err.message),
  });

  return (
    <ModuleGuard moduleName="complaint_box">
      <div style={{ maxWidth: '760px', margin: '0 auto', paddingBottom: '48px' }} className="fade-in">

        {/* Header */}
        <div style={{
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #1e1b4b, #4c1d95)',
          padding: '28px 32px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '18px',
        }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '15px',
            background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <MessageSquare size={26} color="#c4b5fd" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Complaint Box</h2>
            <p style={{ color: 'rgba(221,214,254,0.65)', fontSize: '13px', margin: '4px 0 0' }}>
              {isAdmin
                ? 'Review and respond to complaints from students and teachers.'
                : isTeacher
                  ? 'Send messages to students or view complaints addressed to you.'
                  : 'Raise a concern securely. You can remain anonymous if you choose.'}
            </p>
          </div>
        </div>

        {/* Compose Forms */}
        {isStudent && (
          <div style={{ marginBottom: '24px' }}>
            <StudentCompose schoolId={schoolSettings.school_id} senderId={user.id} userClass={user?.class} queryClient={queryClient} />
          </div>
        )}
        {isTeacher && (
          <div style={{ marginBottom: '24px' }}>
            <TeacherCompose schoolId={schoolSettings.school_id} senderId={user.id} userClass={user?.class} queryClient={queryClient} />
          </div>
        )}

        {/* Messages feed */}
        <h3 style={{ fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '14px' }}>
          {isAdmin ? 'All Complaints' : 'Your Messages'}
        </h3>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', background: 'var(--glass)', borderRadius: '16px', border: '1px dashed var(--card-border)' }}>
            <MessageSquare size={32} style={{ color: 'var(--text-faint)', marginBottom: '10px' }} />
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-muted)' }}>No complaints yet.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg) => (
              <div key={msg.id} className="card" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                {/* Top bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--card-border)' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: 'var(--text-main)' }}>{msg.subject}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px', flexWrap: 'wrap' }}>
                      {/* Sender badge */}
                      {msg.is_anonymous ? (
                        <span style={{ background: '#1e293b', color: '#94a3b8', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Lock size={10} /> Anonymous
                        </span>
                      ) : (
                        <span style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                          From: {msg.sender?.name || 'Unknown'} ({msg.sender_role})
                        </span>
                      )}
                      {/* Recipient badge */}
                      <span style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                        To: {msg.recipient_type === 'admin' ? 'Admin / Principal' : (msg.recipient?.name || 'Unknown')}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600 }}>{fmt(msg.created_at)}</span>
                    </div>
                  </div>
                  {/* Status */}
                  {msg.status === 'replied' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.1)', color: '#059669', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>
                      <CheckCircle2 size={12} /> Replied
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>
                      Pending
                    </span>
                  )}
                </div>

                {/* Message body */}
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{msg.message}</p>

                {/* Reply */}
                {msg.reply_text ? (
                  <div style={{ marginTop: '14px', padding: '12px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: '12px', borderLeft: '3px solid #6366f1' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6366f1', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Reply size={12} /> Official Response
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{msg.reply_text}</p>
                  </div>
                ) : (isAdmin || msg.recipient_id === user.id) ? (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--card-border)' }}>
                    {replyingTo === msg.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your official response..." className="sp-input"
                          style={{ width: '100%', resize: 'none', fontSize: '13px' }} autoFocus />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setReplyingTo(null)} className="btn outline" style={{ width: 'auto', padding: '7px 14px', fontSize: '12px' }}>Cancel</button>
                          <button
                            onClick={() => replyMutation.mutate({ id: msg.id, reply: replyText })}
                            disabled={!replyText.trim() || replyMutation.isPending}
                            className="btn accent" style={{ width: 'auto', padding: '7px 14px', fontSize: '12px' }}
                          >
                            {replyMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setReplyingTo(msg.id)}
                        style={{ background: 'none', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Reply size={13} /> Write Reply
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModuleGuard>
  );
}
