import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AlertTriangle, Send, Loader2, Info } from 'lucide-react';

export default function EmergencyManager() {
  const { schoolSettings, user, role } = useAppStore();
  const [type, setType] = useState('general');
  const [audience, setAudience] = useState(role === 'teacher' ? 'admin' : 'all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Specific student targeting
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');

  // Default class to the first assigned class if teacher
  useEffect(() => {
    if (role === 'teacher' && user?.assigned_classes?.length > 0 && !selectedClass) {
      setSelectedClass(user.assigned_classes[0]);
    }
  }, [role, user, selectedClass]);

  // Fetch students for the selected class (works for both teachers and admins)
  useEffect(() => {
    if (selectedClass) {
      const fetchStudents = async () => {
        const { data } = await supabase
          .from('users')
          .select('id, name, class')
          .eq('role', 'student')
          .eq('school_id', schoolSettings.school_id)
          .eq('class', selectedClass);
        if (data) setStudents(data);
      };
      fetchStudents();
    }
  }, [role, selectedClass, schoolSettings?.school_id]);

  const handleTrigger = async (e) => {
    e.preventDefault();
    if (!message.trim()) { setError('Message is required.'); return; }
    if (audience === 'specific_students' && !selectedStudent) {
      setError('Please select a specific student.'); return;
    }
    
    setLoading(true); setError(''); setSuccess('');
    
    let target_users = null;
    if (audience === 'specific_students') {
      target_users = [selectedStudent];
    }

    const { error: insertErr } = await supabase.from('emergency_alerts').insert({
      school_id: schoolSettings.school_id,
      sender_id: user.id,
      alert_type: type,
      message: message.trim(),
      target_audience: audience,
      target_users: target_users,
      status: 'active'
    });

    if (insertErr) {
      setError(insertErr.message);
    } else {
      setSuccess('Alert broadcasted successfully. Targeted clients will see it immediately.');
      setMessage('');
      setSelectedStudent('');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 fade-in max-w-3xl mx-auto pb-10">
      <div className="bg-red-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="flex items-center gap-4 mb-2 relative z-10">
          <AlertTriangle size={32} />
          <h2 className="text-2xl font-black uppercase tracking-widest">Emergency Action</h2>
        </div>
        <p className="opacity-90 font-medium relative z-10">
          {role === 'teacher' ? 'Send a high-priority emergency alert to the Admin or specific students.' : 'Trigger a \'Big Red Button\' overlay on all active user devices instantly.'}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-red-400 mt-0.5" />
          <p className="text-sm text-red-300 font-semibold">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
          <div className="w-5 h-5 text-emerald-400 mt-0.5">✓</div>
          <p className="text-sm text-emerald-300 font-semibold">{success}</p>
        </div>
      )}

      <form onSubmit={handleTrigger} className="sp-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Alert Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="sp-input w-full">
              <option value="general">General Emergency</option>
              <option value="medical">Medical Emergency</option>
              <option value="weather">Severe Weather</option>
              <option value="lockdown">Active Lockdown</option>
              <option value="evacuation">Evacuation Required</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Audience</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="sp-input w-full">
              {role === 'teacher' && <option value="admin">Admin (Headmaster)</option>}
              {role !== 'teacher' && (
                <>
                  <option value="all">Entire School (Staff + Students)</option>
                  <option value="staff">All Staff & Teachers</option>
                  <option value="students">All Students</option>
                </>
              )}
              <option value="specific_students">Specific Student</option>
            </select>
          </div>
        </div>

        {audience === 'specific_students' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Select Class</label>
              <select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedStudent(''); }} className="sp-input w-full">
                <option value="">-- Choose Class --</option>
                {schoolSettings?.classes?.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Select Student</label>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="sp-input w-full" disabled={!selectedClass}>
                <option value="">-- Choose a Student --</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Alert Message</label>
          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type the exact message to display..."
            className="sp-input w-full resize-none font-semibold text-lg text-slate-200"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          {role === 'teacher' ? 'Send Targeted Alert' : 'Trigger Big Red Button'}
        </button>
      </form>
    </div>
  );
}
