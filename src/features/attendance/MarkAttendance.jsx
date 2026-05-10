import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Save, Calendar as CalendarIcon, Users, UserCheck, CheckCircle2, XCircle, AlertCircle, Filter, Download } from 'lucide-react';

export default function MarkAttendance() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [targetRole, setTargetRole] = useState('student'); // 'student' or 'teacher'
  
  const [attendanceEdits, setAttendanceEdits] = useState({});
  const [toast, setToast] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // 1. Fetch Teacher's Assigned Class if applicable
  useEffect(() => {
    async function fetchTeacherClass() {
      if (role === 'teacher') {
        const { data } = await supabase.from('users').select('class').eq('id', user.id).single();
        if (data?.class) {
          setSelectedClass(data.class);
        }
      }
    }
    fetchTeacherClass();
  }, [role, user.id]);

  const classes = schoolSettings?.classes || [];

  // 2. Fetch Targets (Students in class)
  const { data: targets, isLoading: targetsLoading } = useQuery({
    queryKey: ['attendance-targets', targetRole, selectedClass, schoolSettings?.school_id],
    queryFn: async () => {
      let query = supabase
        .from('users')
        .select('id, name, username')
        .eq('role', targetRole)
        .order('name');
        
      if (targetRole === 'student' && selectedClass) {
        query = query.eq('class', selectedClass);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!schoolSettings?.school_id && (targetRole === 'teacher' || targetRole === 'staff' || !!selectedClass)
  });

  // 3. Fetch Existing Attendance
  const { data: existingAttendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', targetRole, selectedClass, selectedDate, schoolSettings?.school_id],
    queryFn: async () => {
      const monthYear = selectedDate.substring(0, 7);
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('month_year', monthYear)
        .in('user_id', targets?.map(s => s.id) || []);
      if (error) throw error;
      return data || [];
    },
    enabled: !!targets && targets.length > 0
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (!payload || payload.length === 0) return;
      const monthYear = payload[0].month_year;
      const date = payload[0].date;

      const upsertRows = payload.map(item => {
        // Find existing record to preserve other days in the month
        const existingRow = existingAttendance?.find(a => a.user_id === item.user_id);
        const currentData = existingRow?.attendance_data || {};
        
        return {
          school_id: item.school_id,
          user_id: item.user_id,
          month_year: item.month_year,
          attendance_data: {
            ...currentData,
            [date]: item.status
          }
        };
      });

      const { error } = await supabase
        .from('attendance')
        .upsert(upsertRows, { onConflict: 'school_id,user_id,month_year' });
      if (error) throw error;

      // Generate ephemeral notifications ONLY for changed statuses to prevent spam
      const notifications = [];
      payload.forEach(item => {
        const existingRow = existingAttendance?.find(a => a.user_id === item.user_id);
        const currentStatus = existingRow?.attendance_data?.[date];
        
        // If the status has changed (or is newly marked) and it's for a student
        if (currentStatus !== item.status && item.role === 'student') {
           notifications.push({
              school_id: item.school_id,
              user_id: item.user_id,
              title: 'Attendance Alert',
              body: `Attendance marked as ${item.status.toUpperCase()} for ${item.date}.`,
              route: '/attendance',
              is_ephemeral: true,
              status: 'pending'
           });
        }
      });

      if (notifications.length > 0) {
        const { error: notifErr } = await supabase
          .from('app_notifications_queue')
          .insert(notifications);
        if (notifErr) console.error('Notification queuing failed:', notifErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setAttendanceEdits({});
      showToast('Attendance recorded successfully!');
    },
    onError: (err) => {
      showToast('Error saving: ' + err.message);
    }
  });

  const handleStatusChange = (targetId, status) => {
    setAttendanceEdits(prev => ({
      ...prev,
      [targetId]: status
    }));
  };

  const currentStatusFor = (targetId) => {
    if (attendanceEdits[targetId]) return attendanceEdits[targetId];
    const record = existingAttendance?.find(a => a.user_id === targetId);
    return record?.attendance_data?.[selectedDate] || 'Present';
  };

  // True if attendance has already been submitted for this date/class
  const isAlreadyMarked = existingAttendance && existingAttendance.some(
    a => a.attendance_data && typeof a.attendance_data === 'object' && Object.keys(a.attendance_data).includes(selectedDate)
  );
  const hasEdits = Object.keys(attendanceEdits).length > 0;

  const handleSave = () => {
    if (!targets || targets.length === 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    if (selectedDate > todayStr) {
      alert("You cannot mark attendance for future dates.");
      return;
    }

    // If already marked and no edits were made, warn before re-saving
    if (isAlreadyMarked && !hasEdits) {
      const ok = window.confirm('Attendance for this date is already recorded. Do you want to re-save with the same statuses?');
      if (!ok) return;
    }
    const payload = targets.map(s => ({
      school_id: schoolSettings.school_id,
      user_id: s.id,
      month_year: selectedDate.substring(0, 7),
      date: selectedDate,
      role: targetRole,
      status: currentStatusFor(s.id),
    }));
    saveMutation.mutate(payload);
  };

  const handleExportCSV = () => {
    if (!targets || targets.length === 0) return;
    const headers = ['Name', 'Username', 'Role', 'Status', 'Date'];
    const rows = targets.map(t => {
      const status = currentStatusFor(t.id);
      return `"${t.name}","${t.username}","${targetRole}","${status}","${selectedDate}"`;
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_${selectedClass || 'Self'}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statuses = ['Present', 'Absent', 'Late', 'Half_day'];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 bg-slate-900 border border-white/10 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          {toast.includes('Error') ? <AlertCircle size={14} className="text-red-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
          {toast}
        </div>
      )}

      <div className="card">
        <div className="section-title"><h3>{role === 'teacher' ? 'Mark Class Attendance' : 'Attendance Manager'}</h3></div>
      </div>
      
      {role === 'admin' ? (
      <div className="card">
        <div className="tabs">
            <div className={`tab ${targetRole === 'student' ? 'active' : ''}`} onClick={() => { setTargetRole('student'); setSelectedClass(''); }}>Student Attendance</div>
            <div className={`tab ${targetRole === 'teacher' ? 'active' : ''}`} onClick={() => { setTargetRole('teacher'); setSelectedClass(''); }}>Teacher Attendance</div>
            <div className={`tab ${targetRole === 'staff' ? 'active' : ''}`} onClick={() => { setTargetRole('staff'); setSelectedClass(''); }}>Staff Attendance</div>
        </div>
        <div className="flex" style={{ gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {targetRole === 'student' && (
            <select className="sp-input w-auto min-w-[150px]" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                <option value="">-- Choose Class --</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            )}
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="sp-input w-[140px]" />
            <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saveMutation.isPending || !targets || (!selectedClass && targetRole === 'student')}>
              {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Attendance'}
            </button>
            <button className="btn outline ml-auto" onClick={handleExportCSV} disabled={!targets || targets.length===0}>Export CSV</button>
        </div>
      </div>
      ) : (
      <div className="card">
         <div className="flex" style={{ gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {targetRole === 'student' && (
               <div className="sp-input w-auto min-w-[150px] opacity-70 cursor-not-allowed uppercase text-xs font-bold flex items-center justify-center">CLASS {selectedClass || 'UNASSIGNED'}</div>
            )}
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="sp-input w-[140px]" />
            <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saveMutation.isPending || !targets || (!selectedClass && targetRole === 'student')}>
              {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Attendance'}
            </button>
         </div>
      </div>
      )}

      {isAlreadyMarked && (
         <div className="card" style={{ borderColor: 'var(--accent)', background: 'rgba(96, 165, 250, 0.1)' }}>
            <div className="flex items-center gap-3">
               <span className="badge">Recorded</span>
               <span className="text-sm font-semibold">Attendance for this date is already recorded. Making changes will update the records.</span>
            </div>
         </div>
      )}

      <div className="card" id="attMarkerPanel">
         <h4 className="mb-4">Marking for: <span className="muted">{targetRole === 'student' ? (selectedClass ? `Class ${selectedClass} on ${selectedDate}` : 'Please select class') : `${targetRole}s on ${selectedDate}`}</span></h4>
         <div id="attList" className="mt-[10px]">
           {targetsLoading || attendanceLoading ? (
               <div className="muted p-4 text-center">Loading roster...</div>
           ) : (!targets || targets.length === 0) ? (
               <div className="muted p-4 text-center">No subjects found for this selection.</div>
           ) : (
               targets.map(target => {
                 const status = currentStatusFor(target.id);
                 return (
                    <div key={target.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <strong>{target.name}</strong><br/>
                            <span className="muted small">{target.username}</span>
                        </div>
                        {['Present', 'Absent', 'Leave'].map(st => (
                            <label key={st} className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '10px' }}>
                                <input 
                                  type="radio" 
                                  name={`status_${target.id}`} 
                                  value={st} 
                                  checked={status === st} 
                                  onChange={() => handleStatusChange(target.id, st)}
                                /> {st}
                            </label>
                        ))}
                    </div>
                 );
               })
           )}
         </div>
      </div>
    </div>
  );
}
