import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, IndianRupee, Bell, CheckCircle, X, Send, AlertTriangle, Globe } from 'lucide-react';

/* ─── Multi-language message templates ─── */
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
];

export function buildMessage(lang, { name, className, schoolName, amount, dueDate }) {
  const amt = Number(amount).toLocaleString('en-IN');
  const due = dueDate
    ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  if (lang === 'hi') {
    return `[FEE_REMINDER] प्रिय ${name} के अभिभावक (कक्षा: ${className}), ${schoolName} की ओर से शुल्क अनुस्मारक। देय राशि: ₹${amt}। कृपया ${due} तक भुगतान करें। किसी भी सहायता के लिए कार्यालय से संपर्क करें।`;
  }
  if (lang === 'mr') {
    return `[FEE_REMINDER] प्रिय ${name} यांच्या पालकांसाठी (इयत्ता: ${className}), ${schoolName} कडून शुल्क स्मरणपत्र। देय रक्कम: ₹${amt}. कृपया ${due} पर्यंत भरणा करा. अधिक माहितीसाठी कार्यालयाशी संपर्क साधा.`;
  }
  return `[FEE_REMINDER] Dear Parent of ${name} (Class: ${className}), this is a fee reminder from ${schoolName}. Amount due: ₹${amt}. Please clear the dues by ${due}. Contact the office for any assistance.`;
}

/* ─────────────────────────────────────────────────────────
   EXPORTED: ReminderConfiguratorModal
   Used by both TeacherFeeReminder and AdminFeeManager
───────────────────────────────────────────────────────── */
function customizeMessageForStudent(text, firstStudent, targetStudent) {
  if (!text || !firstStudent || !targetStudent || firstStudent.id === targetStudent.id) {
    return text;
  }
  let result = text;
  if (firstStudent.name && targetStudent.name) {
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapeRegExp(firstStudent.name), 'gi');
    result = result.replace(regex, targetStudent.name);
  }
  if (firstStudent.class && targetStudent.class && firstStudent.class !== targetStudent.class) {
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapeRegExp(firstStudent.class), 'gi');
    result = result.replace(regex, targetStudent.class);
  }
  return result;
}

/* ─────────────────────────────────────────────────────────
   EXPORTED: ReminderConfiguratorModal
   Used by both TeacherFeeReminder and AdminFeeManager
   ───────────────────────────────────────────────────────── */
export function ReminderConfiguratorModal({ students, schoolSettings, onClose, onSent }) {
  const [targetAmount, setTargetAmount] = useState('');
  const [dueDate, setDueDate]           = useState('');
  const [lang, setLang]                 = useState('en');
  const [sending, setSending]           = useState(false);
  const [selected, setSelected]         = useState(() =>
    students.filter(s => (s.dueAmount || 0) > 0).map(s => s.id)
  );

  const [messageText, setMessageText] = useState('');
  const [prevInputs, setPrevInputs] = useState({ lang: 'en', targetAmount: '', dueDate: '', firstStudentId: '' });

  const schoolName = schoolSettings?.name || 'Your School';

  const firstSelected = students.find(s => s.id === selected[0]);

  // Synchronize text area with inputs/lang changes unless edited
  React.useEffect(() => {
    const currentStudentId = firstSelected?.id || '';
    const inputsChanged = prevInputs.lang !== lang ||
                          prevInputs.targetAmount !== targetAmount ||
                          prevInputs.dueDate !== dueDate ||
                          prevInputs.firstStudentId !== currentStudentId;

    if (inputsChanged) {
      setPrevInputs({ lang, targetAmount, dueDate, firstStudentId: currentStudentId });
    }

    if (targetAmount && dueDate && firstSelected) {
      const msg = buildMessage(lang, {
        name:      firstSelected.name,
        className: firstSelected.class || '—',
        schoolName,
        amount:    targetAmount,
        dueDate,
      }).replace('[FEE_REMINDER] ', '');

      if (inputsChanged || !messageText) {
        setMessageText(msg);
      }
    } else if (!firstSelected || !targetAmount || !dueDate) {
      setMessageText('');
    }
  }, [lang, targetAmount, dueDate, firstSelected, schoolName]);

  const toggleStudent = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSend = async () => {
    if (!targetAmount || !dueDate) {
      alert('Please enter both Target Amount and Due Date before sending.');
      return;
    }
    if (selected.length === 0) {
      alert('Please select at least one student to remind.');
      return;
    }
    if (!messageText.trim()) {
      alert('Message preview/content cannot be empty.');
      return;
    }
    setSending(true);
    try {
      const toNotify = students.filter(s => selected.includes(s.id));
      const rows = toNotify.map(student => {
        const personalizedMsg = customizeMessageForStudent(messageText, firstSelected, student);
        return {
          school_id: schoolSettings.school_id,
          to_user:   student.email,
          title:     'Fee Reminder',
          message:   `[FEE_REMINDER] ${personalizedMsg}`,
          is_read:   false,
        };
      });

      const { error } = await supabase.from('notifications').insert(rows);
      if (error) throw error;
      onSent(selected.length);
    } catch (err) {
      alert('Error sending reminders: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}>
      <div style={{
        width: '100%', maxWidth: '580px', maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--card-bg)', borderRadius: '24px 24px 0 0',
        padding: '28px 24px 40px', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
        border: '1px solid var(--card-border)',
      }}>
        {/* Handle bar */}
        <div style={{ width: '40px', height: '4px', borderRadius: '999px', background: 'var(--card-border)', margin: '0 auto 24px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>Fee Reminder Configurator</h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Customize and send in-app reminders to defaulting students
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'var(--input-bg)', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Field 1: Target Amount ── */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            Target Reminder Amount (₹)
          </label>
          <input
            type="number"
            value={targetAmount}
            onChange={e => setTargetAmount(e.target.value)}
            placeholder="e.g. 5000"
            className="sp-input block w-full"
            style={{ fontSize: '18px', fontWeight: 800 }}
          />
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            This amount will appear in the reminder message. It can be the standard fee or a specific due amount.
          </p>
        </div>

        {/* ── Field 2: Due Date ── */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            Payment Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="sp-input block w-full"
          />
        </div>

        {/* ── Field 3: Language Selector ── */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            <Globe size={12} style={{ display: 'inline', marginRight: '4px' }} />
            Message Language
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  padding: '8px 16px', borderRadius: '12px', fontSize: '12px',
                  fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  border: lang === l.code ? '1px solid var(--accent)' : '1px solid var(--card-border)',
                  background: lang === l.code ? 'var(--accent)' : 'var(--input-bg)',
                  color: lang === l.code ? '#ffffff' : 'var(--text-main)',
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Student Selection ── */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Students to Notify ({selected.length}/{students.length})
            </label>
            <button
              onClick={() => setSelected(selected.length === students.length ? [] : students.map(s => s.id))}
              style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {selected.length === students.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--card-border)', borderRadius: '16px', maxHeight: '200px', overflowY: 'auto' }}>
            {students.map((s, idx) => (
              <label
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 16px', cursor: 'pointer',
                  borderBottom: idx < students.length - 1 ? '1px solid var(--card-border)' : 'none',
                  background: selected.includes(s.id) ? 'rgba(99,102,241,0.05)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggleStudent(s.id)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main)' }}>{s.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {s.class} • Due: ₹{s.dueAmount?.toLocaleString() || '0'}
                  </div>
                </div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: (s.dueAmount || 0) > 0 ? '#ef4444' : 'var(--text-muted)', flexShrink: 0 }}>
                  ₹{s.dueAmount?.toLocaleString() || '0'}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Message Preview ── */}
        {firstSelected && targetAmount && dueDate && (
          <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              📋 Message Preview (Editable)
            </div>
            <textarea
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                fontSize: '12px',
                color: 'var(--text-main)',
                lineHeight: 1.6,
                background: 'var(--bg-main)',
                border: '1px solid var(--card-border)',
                borderRadius: '12px',
                padding: '10px 12px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              placeholder="Type or edit the reminder message..."
            />
            <p style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
              Tip: You can edit this text template. Student names and classes will be customized automatically for other recipients.
            </p>
          </div>
        )}

        {/* ── Send Button ── */}
        <button
          onClick={handleSend}
          disabled={sending || selected.length === 0 || !targetAmount || !dueDate || !messageText.trim()}
          style={{
            width: '100%', padding: '14px', borderRadius: '16px', border: 'none',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            color: '#fff', fontWeight: 800, fontSize: '14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: (sending || selected.length === 0 || !targetAmount || !dueDate || !messageText.trim()) ? 0.55 : 1,
            transition: 'all 0.2s', boxShadow: '0 6px 20px rgba(79,70,229,0.35)',
          }}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending
            ? 'Sending…'
            : `Send In-App Reminder to ${selected.length} Student${selected.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DEFAULT EXPORT: Teacher Fee Reminder Page
───────────────────────────────────────────────────────── */
export default function TeacherFeeReminder() {
  const { user, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [showConfigurator, setShowConfigurator] = useState(false);
  const [successCount, setSuccessCount]         = useState(null);

  // ── DB fallback: fetch the teacher's class directly from the users table.
  // This handles two scenarios:
  //   1. New login: user.class is already set via the enriched user object.
  //   2. Pre-fix session: user.class may be null; DB query fills it in.
  const { data: teacherProfile } = useQuery({
    queryKey: ['teacher-profile-class', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('class')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Prefer the store value first (fast), fall back to DB result (handles old sessions)
  const teacherClass = user?.class || teacherProfile?.class || null;

  // 1. Fetch students in teacher's class only
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['teacher-class-students', teacherClass, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, class, email')
        .eq('role', 'student')
        .eq('class', teacherClass)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!teacherClass && !!schoolSettings?.school_id,
  });

  // 2. Fetch fees for current year
  const { data: feesData, isLoading: feesLoading } = useQuery({
    queryKey: ['fees-teacher-view', currentYear, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fees')
        .select('id, sid:student_id, tot:total, lyp:last_year_pending')
        .eq('year', currentYear);
      if (error) throw error;
      return (data || []).map(f => ({
        id: f.id,
        student_id: f.sid,
        total: Number(f.tot || 0),
        last_year_pending: Number(f.lyp || 0),
        year: currentYear
      }));
    },
    enabled: !!schoolSettings?.school_id,
  });

  // 3. Fetch payments
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments-teacher-view', currentYear, schoolSettings?.school_id],
    queryFn: async () => {
      if (!feesData || feesData.length === 0) return [];
      const feeIds = feesData.map(f => f.id);
      const { data, error } = await supabase
        .from('fees_payments')
        .select('id, fid:fee_id, amt:amount')
        .in('fee_id', feeIds);
      if (error) throw error;
      return (data || []).map(p => ({
        id: p.id,
        fee_id: p.fid,
        amount: Number(p.amt || 0)
      }));
    },
    enabled: !!feesData && feesData.length > 0,
  });

  // Show spinner while fetching profile if class not yet known
  const profileLoading = !teacherClass && !teacherProfile;
  const isLoading = profileLoading || studentsLoading || feesLoading || paymentsLoading;

  // Compute dues for ALL students in class
  const studentsWithDues = useMemo(() => {
    if (!students || !feesData || paymentsData === undefined) return [];
    return students.map(student => {
      const feeRecord = feesData.find(f => f.student_id === student.id);
      let dueAmount = 0;
      if (feeRecord) {
        const studentPayments = (paymentsData || []).filter(p => p.fee_id === feeRecord.id);
        const totalPaid = studentPayments.reduce((s, p) => s + Number(p.amount), 0);
        dueAmount = (Number(feeRecord.last_year_pending || 0) + Number(feeRecord.total || 0)) - totalPaid;
      }
      return { ...student, dueAmount };
    });
  }, [students, feesData, paymentsData]);

  // Defaulters list for display cards (filter where dueAmount > 0)
  const defaultersList = useMemo(() => {
    return studentsWithDues.filter(s => s.dueAmount > 0);
  }, [studentsWithDues]);

  const handleSent = (count) => {
    setShowConfigurator(false);
    setSuccessCount(count);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setTimeout(() => setSuccessCount(null), 5000);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '12px' }}>
        <Loader2 style={{ width: '40px', height: '40px', animation: 'spin 0.8s linear infinite', color: 'var(--accent)' }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Loading…</span>
      </div>
    );
  }

  // Only shown after profile is loaded — if truly no class is assigned
  if (!teacherClass) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '18px', marginBottom: '8px' }}>No Class Assigned</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.7, maxWidth: '320px', margin: '0 auto' }}>
          Please ask the Admin to assign a class to your profile. Once assigned, log out and log back in to see your class data here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IndianRupee size={20} color="var(--accent)" /> Fees — Class {teacherClass}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Send in-app fee reminders to defaulters in your assigned class.
          </p>
        </div>
        <button
          onClick={() => setShowConfigurator(true)}
          disabled={students?.length === 0}
          className="btn accent"
          style={{ flexShrink: 0, whiteSpace: 'nowrap', opacity: students?.length === 0 ? 0.5 : 1 }}
        >
          <Send size={14} /> Send Reminder
        </button>
      </div>

      {/* ── Success Toast ── */}
      {successCount !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: 'white', borderRadius: '16px', padding: '14px 20px',
        }}>
          <CheckCircle size={20} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px' }}>Reminders Sent Successfully!</div>
            <div style={{ fontSize: '12px', opacity: 0.85 }}>
              In-app notifications delivered to {successCount} student{successCount !== 1 ? 's' : ''}.
              They will see a banner on their dashboard.
            </div>
          </div>
        </div>
      )}

      {/* ── Summary Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', borderRadius: '20px', padding: '18px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 900 }}>{defaultersList.length}</div>
          <div style={{ fontSize: '10px', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
            Defaulters in Class {teacherClass}
          </div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: '20px', padding: '18px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>
            ₹{defaultersList.reduce((a, s) => a + s.dueAmount, 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
            Total Outstanding
          </div>
        </div>
      </div>

      {/* ── Defaulters List ── */}
      {defaultersList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '24px' }}>
          <CheckCircle size={40} color="#10b981" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-main)', marginBottom: '6px' }}>All Clear! 🎉</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No outstanding dues in Class {teacherClass}.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', background: 'var(--bg-main)' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px', color: '#ef4444' }} />
              Defaulters — {defaultersList.length} student{defaultersList.length !== 1 ? 's' : ''} • Sorted by highest due
            </span>
          </div>
          {[...defaultersList].sort((a, b) => b.dueAmount - a.dueAmount).map((student, idx) => (
            <div
              key={student.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px',
                borderBottom: idx < defaultersList.length - 1 ? '1px solid var(--card-border)' : 'none',
              }}
            >
              <div style={{
                width: '38px', height: '38px', borderRadius: '12px', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 900, color: 'white',
              }}>
                {student.name?.charAt(0)?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {student.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {student.email || 'No email on file'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 900, fontSize: '15px', color: '#ef4444' }}>₹{student.dueAmount.toLocaleString()}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Due</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── How it works ── */}
      <div style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <Bell size={15} color="#6366f1" style={{ flexShrink: 0, marginTop: '2px' }} />
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-main)' }}>How it works:</strong> "Send Reminder" opens a configurator where you set the amount, due date, and language. The message is delivered as an <strong>in-app notification</strong> to the student's account — they also see a <strong>dismissible banner</strong> on their dashboard.
        </p>
      </div>

      {showConfigurator && (
        <ReminderConfiguratorModal
          students={studentsWithDues}
          schoolSettings={schoolSettings}
          onClose={() => setShowConfigurator(false)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
