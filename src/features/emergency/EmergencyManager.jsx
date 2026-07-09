import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { AlertTriangle, Send, Loader2, Info } from 'lucide-react';
import { ref, set } from 'firebase/database';
import { rtdb } from '../../config/firebaseClient';
import { usePlan } from '../../hooks/usePlan';
import { useQuery } from '@tanstack/react-query';

export default function EmergencyManager() {
  const { schoolSettings, user, role } = useAppStore();
  const { isFree } = usePlan();
  const [type, setType] = useState('general');
  const [audience, setAudience] = useState(role === 'teacher' ? 'admin' : 'all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Specific student targeting
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);

  useEffect(() => {
    if (audience === 'specific_students' && schoolSettings?.school_id) {
      fetchStudents();
    }
  }, [audience, selectedClass, schoolSettings?.school_id]);

  const fetchStudents = async () => {
    setLoadingStudents(true);
    let q = supabase.from('users').select('id, name').eq('role', 'student').eq('school_id', schoolSettings.school_id);
    if (selectedClass) {
      q = q.eq('class', selectedClass);
    }
    const { data } = await q;
    if (data) setStudents(data);
    setLoadingStudents(false);
  };

  const { data: activeAlerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ['active-emergency-alerts', schoolSettings?.school_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('school_id', schoolSettings.school_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!schoolSettings?.school_id
  });

  const handleStopAlert = async (alertId) => {
    setLoading(true); setError(''); setSuccess('');
    const { error: updateErr } = await supabase
      .from('emergency_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alertId);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      // Broadcast real-time signal via Firebase RTDB
      if (rtdb && schoolSettings?.school_id) {
        set(ref(rtdb, `schools/${schoolSettings.school_id}/emergency_alert_update`), Date.now()).catch(console.error);
      }
      setSuccess('Alert stopped and resolved successfully.');
      refetchAlerts();
    }
    setLoading(false);
  };

  const handleTrigger = async (e) => {
    e.preventDefault();
    if (!message.trim()) { setError('Message is required.'); return; }
    if (audience === 'specific_students' && !selectedStudent) {
      setError('Please select a specific student.'); return;
    }
    
    setLoading(true); setError(''); setSuccess('');

    if (isFree) {
      // Check emergency alerts count for current month
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count, error: countErr } = await supabase
        .from('emergency_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolSettings.school_id)
        .gte('created_at', startOfMonth);

      if (countErr) {
        console.error('Error checking emergency alert count:', countErr);
      } else if (count >= 5) {
        setError('Free Plan limit reached: You can trigger a maximum of 5 emergency alerts per month on the Free Plan. Please upgrade to the Premium Plan.');
        setLoading(false);
        return;
      }
    }
    
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
      // Broadcast real-time signal via Firebase RTDB
      if (rtdb && schoolSettings?.school_id) {
        set(ref(rtdb, `schools/${schoolSettings.school_id}/emergency_alert_update`), Date.now()).catch(console.error);
      }
      setSuccess('Alert broadcasted successfully. Targeted clients will see it immediately.');
      setMessage('');
      setSelectedStudent('');
      refetchAlerts();
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

      {/* Active Alerts List */}
      <div className="sp-card space-y-4 mt-6">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500 animate-pulse" /> Active Emergency Alerts
        </h3>
        {activeAlerts.length === 0 ? (
          <p className="text-xs text-slate-500 font-semibold py-4 text-center">No active emergency alerts at this school.</p>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black bg-red-500/20 text-red-400 px-2 py-0.5 rounded uppercase tracking-wider">
                      {alert.alert_type}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      Target: {alert.target_audience.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-200 mt-2">{alert.message}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Triggered: {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleStopAlert(alert.id)}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 bg-red-650 hover:bg-red-550 disabled:bg-red-800/50 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer border-0 flex items-center justify-center gap-1.5"
                >
                  Stop & Over Alert
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
