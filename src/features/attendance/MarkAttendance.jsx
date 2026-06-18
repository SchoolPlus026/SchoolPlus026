import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Loader2, Save, Calendar as CalendarIcon, Users, UserCheck, CheckCircle2, XCircle, AlertCircle, Filter, Download } from 'lucide-react';
import { triggerStreakCheck } from '../../hooks/useAchievements';
import UserAvatar from '../../components/UserAvatar';

// ─── Attendance JSONB Compression Codec (v82_attendance_jsonb_compression) ───
// Database stores: { "1": "P", "31": "A" } — day-of-month key, single-char value
// UI displays:     { "2026-05-01": "Present", "2026-05-31": "Absent" }
//
// Encode: called on WRITE — converts UI value+date to compressed DB format
// Decode: called on READ  — converts DB compressed key+value to UI format

const STATUS_ENCODE = { Present: 'P', Absent: 'A', Late: 'L', Half_day: 'H', Leave: 'V' };
const STATUS_DECODE = { P: 'Present', A: 'Absent', L: 'Late', H: 'Half_day', V: 'Leave' };

/**
 * Extracts the day-of-month key from a full ISO date string.
 * "2026-05-01" → "1"  (leading zero stripped)
 * "2026-05-31" → "31"
 */
function dateToDayKey(dateStr) {
  return String(parseInt(dateStr.split('-')[2], 10));
}

/**
 * Reconstructs a full ISO date string from a month_year and a compressed day key.
 * monthYear="2026-05", dayKey="1" → "2026-05-01"
 */
function dayKeyToDate(monthYear, dayKey) {
  const day = String(dayKey).padStart(2, '0');
  return `${monthYear}-${day}`;
}

/**
 * Reads the status for a given full ISO date from a compressed attendance_data object.
 * Returns the full UI label (e.g. "Present") or undefined if not found.
 */
function readCompressedStatus(attendanceData, isoDate) {
  if (!attendanceData) return undefined;
  // First try the compressed day key (new format after v82)
  const dayKey = dateToDayKey(isoDate);
  if (attendanceData[dayKey]) return STATUS_DECODE[attendanceData[dayKey]] || attendanceData[dayKey];
  // Fallback: try the full date key (legacy rows not yet migrated)
  if (attendanceData[isoDate]) return attendanceData[isoDate];
  return undefined;
}

export default function MarkAttendance() {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const selectedDate = new Date().toISOString().split('T')[0];
  const [selectedClass, setSelectedClass] = useState('');
  const [targetRole, setTargetRole] = useState('student'); // 'student' or 'teacher'
  
  const [attendanceEdits, setAttendanceEdits] = useState({});
  const [toast, setToast] = useState('');
  const [isEditing, setIsEditing] = useState(false);

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
        .select('id, name, username, role, avatar_url, avatar_file_id, hide_avatar_from_class')
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
        .select('user_id, ad:attendance_data, my:month_year')
        .eq('month_year', monthYear)
        .in('user_id', targets?.map(s => s.id) || []);
      if (error) throw error;
      return (data || []).map(a => ({
        user_id: a.user_id,
        attendance_data: a.ad,
        month_year: a.my
      }));
    },
    enabled: !!targets && targets.length > 0
  });

  const { data: leavesList } = useQuery({
    queryKey: ['leaves_for_attendance', selectedDate, schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaves')
        .select('user_id')
        .eq('status', 'Approved')
        .lte('from_date', selectedDate)
        .gte('to_date', selectedDate)
        .eq('school_id', schoolSettings?.school_id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolSettings?.school_id
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

        // Encode to compressed format: day key + single-char status code
        const dayKey   = dateToDayKey(date);             // "2026-05-31" → "31"
        const encoded  = STATUS_ENCODE[item.status] || item.status; // "Present" → "P"

        return {
          school_id: item.school_id,
          user_id: item.user_id,
          month_year: item.month_year,
          attendance_data: {
            ...currentData,
            [dayKey]: encoded   // e.g. { ...existing, "31": "P" }
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
        // Read previous status using the codec-aware helper (handles both old + new format)
        const currentStatus = readCompressedStatus(existingRow?.attendance_data, date);

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
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      // Immediately clear the Staff Pending Duty banner — do not wait for 60s poll
      queryClient.invalidateQueries({ queryKey: ['attendance', 'duty_radar'] });
      setAttendanceEdits({});
      setIsEditing(false);
      showToast('Attendance recorded successfully!');
      
      // Trigger automated streak checks for students
      if (payload && payload.length > 0 && payload[0].role === 'student' && selectedClass) {
        triggerStreakCheck(payload[0].school_id, selectedClass, payload[0].month_year)
          .then(() => queryClient.invalidateQueries({ queryKey: ['student-achievements'] }))
          .catch(err => console.error("Streak check failed:", err));
      }
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
    // Use codec-aware helper — handles both compressed ("31":"P") and legacy ("2026-05-31":"Present") formats
    const existingStatus = readCompressedStatus(record?.attendance_data, selectedDate);
    if (existingStatus) return existingStatus;
    if (leavesList && leavesList.some(l => l.user_id === targetId)) {
       return 'Leave';
    }
    return 'Present';
  };

  // True if attendance has already been submitted for this date/class
  // Checks both compressed day key ("31") and legacy full-date key ("2026-05-31")
  const isAlreadyMarked = existingAttendance && existingAttendance.some(a => {
    if (!a.attendance_data || typeof a.attendance_data !== 'object') return false;
    const dayKey = dateToDayKey(selectedDate);
    return (dayKey in a.attendance_data) || (selectedDate in a.attendance_data);
  });
  const hasEdits = Object.keys(attendanceEdits).length > 0;

  const handleSave = () => {
    if (!targets || targets.length === 0) return;

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
            <div className="sp-input w-[140px] opacity-70 bg-slate-100 cursor-not-allowed flex items-center justify-center font-bold text-slate-600">{selectedDate}</div>
            <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saveMutation.isPending || !targets || (!selectedClass && targetRole === 'student') || (isAlreadyMarked && !isEditing)}>
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
            <div className="sp-input w-[140px] opacity-70 bg-slate-100 cursor-not-allowed flex items-center justify-center font-bold text-slate-600">{selectedDate}</div>
            <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saveMutation.isPending || !targets || (!selectedClass && targetRole === 'student') || (isAlreadyMarked && !isEditing)}>
              {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Attendance'}
            </button>
         </div>
      </div>
      )}

      {isAlreadyMarked && (
         <div className="card" style={{ borderColor: 'var(--accent)', background: 'rgba(96, 165, 250, 0.1)' }}>
            <div className="flex items-center justify-between gap-3">
               <div className="flex items-center gap-3">
                  <span className="badge">Recorded</span>
                  <span className="text-sm font-semibold">Attendance for this date is already recorded. Making changes will update the records.</span>
               </div>
               {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="btn-primary flex items-center gap-2 text-xs py-1.5 px-3">
                    Edit Attendance
                  </button>
               )}
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
                 const isOnLeave = leavesList && leavesList.some(l => l.user_id === target.id);
                 const disabled = isAlreadyMarked && !isEditing;
                 return (
                     <div key={target.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', opacity: disabled ? 0.7 : 1 }}>
                         <UserAvatar user={target} size="xs" />
                         <div style={{ flex: 1, minWidth: '150px' }}>
                             <strong>{target.name}</strong>
                            {isOnLeave && <span className="badge ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid #ef4444' }}>Approved Leave</span>}
                            <br/>
                            <span className="muted small">{target.username}</span>
                        </div>
                        {['Present', 'Absent', 'Leave', 'Half_day'].map(st => (
                            <label key={st} className={`cursor-pointer ${disabled ? 'pointer-events-none' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '10px' }}>
                                <input 
                                  type="radio" 
                                  name={`status_${target.id}`} 
                                  value={st} 
                                  checked={status === st} 
                                  disabled={disabled}
                                  onChange={() => handleStatusChange(target.id, st)}
                                /> {st.replace('_', ' ')}
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
