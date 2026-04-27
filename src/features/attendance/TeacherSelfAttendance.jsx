import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { CheckCircle, Loader2, Lock } from 'lucide-react';

// Teacher Self-Attendance: exact replica of legacy renderTeacherSelfAttendanceView
export default function TeacherSelfAttendance() {
  const { user } = useAppStore();
  const [status, setStatus] = useState('Present');
  const [existing, setExisting] = useState(null);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [username, setUsername] = useState(null);
  const { schoolSettings } = useAppStore();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!user) return;
    // Fetch this teacher's username from users table
    supabase
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setUsername(data.username);
        // Check existing record
        supabase
          .from('attendance')
          .select('status, marked_by')
          .eq('user_id', user.id)
          .eq('date', today)
          .single()
          .then(({ data: rec }) => {
            if (rec) { 
              setExisting(rec.status); 
              setStatus(rec.status); 
              // Lock if marked by someone else (e.g., an Admin)
              if (rec.marked_by && rec.marked_by !== user.id) {
                setLocked(true);
              }
            }
          });
      });
  }, [user]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const saveAttendance = async () => {
    if (!username || locked) return;
    setSaving(true);
    const payload = { 
      user_id: user.id, 
      school_id: schoolSettings.school_id, 
      role: 'Teacher', 
      date: today, 
      status,
      marked_by: user.id 
    };
    // Delete then insert (upsert pattern from legacy)
    await supabase.from('attendance').delete().eq('user_id', user.id).eq('date', today);
    const { error } = await supabase.from('attendance').insert(payload);
    setSaving(false);
    if (error) return showToast('Save failed: ' + error.message);
    setExisting(status);
    showToast('Your attendance has been marked!');
  };

  return (
    <div className="space-y-4 fade-in pb-10">
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 bg-slate-900 border border-white/10 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-400" />
          {toast}
        </div>
      )}

      <div className="sp-card">
        <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Mark My Attendance for {today}</h3>
      </div>

      <div className="sp-card space-y-5">
        {locked ? (
          <div className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
            <Lock size={16} />
            Your attendance has been locked by the School Admin. You cannot override it.
          </div>
        ) : existing ? (
          <div className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            Your attendance for today is already marked as: <strong>{existing}</strong>. You can update it below.
          </div>
        ) : null}

        <p className="text-sm text-slate-400">Select your status for today and click Save.</p>

        <div className="flex gap-6">
          {['Present', 'Absent'].map(opt => (
            <label key={opt} className={`flex items-center gap-2 ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name="self_status"
                value={opt}
                checked={status === opt}
                onChange={() => !locked && setStatus(opt)}
                disabled={locked}
                className="accent-indigo-500 w-4 h-4 disabled:opacity-50"
              />
              <span className={`text-sm font-bold ${status === opt ? 'text-slate-100' : 'text-slate-400'}`}>{opt}</span>
            </label>
          ))}
        </div>

        <button
          onClick={saveAttendance}
          disabled={saving || !username || locked}
          className={`btn-primary flex items-center gap-2 text-sm ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : locked ? <Lock size={14} /> : <CheckCircle size={14} />}
          {locked ? 'Locked' : 'Save My Attendance'}
        </button>
      </div>
    </div>
  );
}
