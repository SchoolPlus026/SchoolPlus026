import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import {
  AlertTriangle, Loader2, UserX, UserCheck, Clock, Bell,
  CheckCircle2, RefreshCw, Zap, ShieldAlert, X, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import { isNightTime } from '../../hooks/useTieredCache';

// ─── Attendance JSONB Decode Codec (v82_attendance_jsonb_compression) ───
const STATUS_DECODE = { P: 'Present', A: 'Absent', L: 'Late', H: 'Half_day', V: 'Leave' };
function getStatusForDate(attendanceData, isoDate) {
  if (!attendanceData) return null;
  const dayKey = String(parseInt(isoDate.split('-')[2], 10));
  if (attendanceData[dayKey]) return STATUS_DECODE[attendanceData[dayKey]] || attendanceData[dayKey];
  if (attendanceData[isoDate]) return attendanceData[isoDate];
  return null;
}

// ─── IST Time Helper ─────────────────────────────────────────────────────
// India Standard Time is UTC+5:30. All school operations use IST.
function getISTNow() {
  const utc = new Date();
  // Create an IST-equivalent local Date by adding the IST offset
  const istOffset = 5.5 * 60 * 60 * 1000; // +5:30 in ms
  const utcMs = utc.getTime() + utc.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + istOffset);
}

// ─── Helper: parse a period_label like "9:00-9:40 AM" or "09:00 AM to 09:40 AM"
//     into an IST-aware Date for the start time ────────────────────────────
function parsePeriodStartTimeIST(periodLabel, dateStr) {
  if (!periodLabel) return null;
  // Match various formats: "9:00-9:40 AM", "09:00 AM - 09:40 AM", "9:00 to 9:40"
  const match = periodLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  // Build an IST date for comparison against getISTNow()
  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ─── UUID detection helper ───────────────────────────────────────────────
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OffClasses() {
  const { role, user, schoolSettings } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [absentPeriods, setAbsentPeriods] = useState([]);
  const [freePeriods, setFreePeriods] = useState([]);
  const [substitutions, setSubstitutions] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('success');

  const userRole = (role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';
  const isTeacher = userRole === 'teacher';

  // ── IST-aware today helpers ────────────────────────────────────────────
  const istNow = getISTNow();
  const year = istNow.getFullYear();
  const month = String(istNow.getMonth() + 1).padStart(2, '0');
  const day = String(istNow.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  const monthYear = `${year}-${month}`;
  const todayDay = istNow.toLocaleString('en-us', { weekday: 'long' });

  function showToast(msg, type = 'success') {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 4000);
  }

  // ── Core data loader ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!schoolSettings?.school_id) return;
    setLoading(true);

    try {
      // 1. Fetch ALL teachers for this school (needed for UUID↔name mapping)
      const { data: teachersList } = await supabase
        .from('users')
        .select('id, name')
        .eq('school_id', schoolSettings.school_id)
        .eq('role', 'teacher')
        .order('name');

      const teachers = teachersList || [];
      const teacherNameToId = {};
      const teacherIdToName = {};
      teachers.forEach(t => {
        teacherIdToName[t.id] = t.name;
        teacherNameToId[t.name.toLowerCase().trim()] = t.id;
      });

      // 2. Find absent teachers from attendance + approved leaves
      const { data: monthAtt } = await supabase
        .from('attendance')
        .select('user_id, attendance_data')
        .eq('school_id', schoolSettings.school_id)
        .eq('month_year', monthYear);

      const absentFromAttendance = (monthAtt || [])
        .filter(a => {
          const s = getStatusForDate(a.attendance_data, today);
          return s === 'Absent' || s === 'Leave';
        })
        .map(a => a.user_id);

      const { data: approvedLeaves } = await supabase
        .from('leaves')
        .select('user_id')
        .eq('school_id', schoolSettings.school_id)
        .in('status', ['Approved', 'approved'])
        .lte('from_date', today)
        .gte('to_date', today);

      const leaveIds = (approvedLeaves || []).map(l => l.user_id);
      const combinedAbsentIds = Array.from(new Set([...absentFromAttendance, ...leaveIds]));

      // Filter to only actual teachers
      const absentTeacherIds = combinedAbsentIds.filter(id => teacherIdToName[id]);
      // Also build the name list for legacy timetable matching
      const absentTeacherNames = absentTeacherIds.map(id => teacherIdToName[id]).filter(Boolean);

      // 3. Fetch today's timetable periods for absent teachers
      //    FOUNDATIONAL FIX: timetable.teacher may store UUID or name string.
      //    Query with BOTH formats to handle legacy data.
      let enrichedPeriods = [];
      if (absentTeacherIds.length > 0) {
        // Build OR filter: teacher matches any absent UUID OR any absent name
        const conditions = [
          ...absentTeacherIds.map(id => `teacher.eq."${id}"`),
          ...absentTeacherNames.map(name => `teacher.eq."${name.replace(/"/g, '\\"')}"`)
        ];
        const { data: periods } = await supabase
          .from('timetable')
          .select('*')
          .eq('school_id', schoolSettings.school_id)
          .eq('day', todayDay)
          .or(conditions.join(','))
          .order('period_order');

        enrichedPeriods = (periods || []).map(p => {
          // Resolve teacher to a UUID (needed for substitution FK)
          let resolvedTeacherId = UUID_PATTERN.test(p.teacher || '') ? p.teacher : null;
          let resolvedTeacherName = p.teacher || 'Unknown';
          if (!resolvedTeacherId) {
            // Legacy name → look up UUID
            resolvedTeacherId = teacherNameToId[(p.teacher || '').toLowerCase().trim()] || null;
          }
          if (resolvedTeacherId && teacherIdToName[resolvedTeacherId]) {
            resolvedTeacherName = teacherIdToName[resolvedTeacherId];
          }
          return {
            ...p,
            teacher_id_resolved: resolvedTeacherId,
            teacher_name: resolvedTeacherName,
          };
        });
      }

      // 4. Fetch today's free period declarations
      const { data: freePeriodsData } = await supabase
        .from('timetable_free_periods')
        .select('*, teacher:users(name)')
        .eq('school_id', schoolSettings.school_id)
        .eq('date', today)
        .eq('day', todayDay);

      // 5. Fetch today's existing substitution assignments
      const { data: subsData } = await supabase
        .from('substitutions')
        .select('*, substitute:users!substitutions_substitute_teacher_id_fkey(name), original:users!substitutions_original_teacher_id_fkey(name)')
        .eq('school_id', schoolSettings.school_id)
        .eq('date', today);

      setAbsentPeriods(enrichedPeriods);
      setFreePeriods(freePeriodsData || []);
      setSubstitutions(subsData || []);
      setAllTeachers(teachers);
    } catch (err) {
      console.error('[OffClasses] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolSettings?.school_id, today, monthYear, todayDay]);

  useEffect(() => {
    if (!isAdmin && !isTeacher) { setLoading(false); return; }
    loadData();
  }, [loadData, isAdmin, isTeacher]);

  const { isFree } = usePlan();

  // ── Polling: substitutions table → adaptive REST polling instead of realtime ──
  useEffect(() => {
    if (!schoolSettings?.school_id) return;

    // Premium plan during daytime: Poll every 60 seconds
    const nightTime = isNightTime();
    let intervalId = null;

    if (!isFree && !nightTime) {
      intervalId = setInterval(() => {
        loadData();
      }, 60000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [schoolSettings?.school_id, loadData, isFree]);

  // ── Admin: assign a substitute ────────────────────────────────────────
  const assignSubstitute = async (absentPeriod, substituteTeacherId, assignedBy = 'admin') => {
    if (!substituteTeacherId) { showToast('Please select a substitute teacher.', 'error'); return; }

    const originalTeacherId = absentPeriod.teacher_id_resolved;
    if (!originalTeacherId) {
      showToast('Error: Could not resolve the absent teacher ID.', 'error');
      return;
    }

    // Prevent self-assignment
    if (substituteTeacherId === originalTeacherId) {
      showToast('Cannot assign the absent teacher as their own substitute.', 'error');
      return;
    }

    // Check if already assigned
    const alreadyAssigned = substitutions.find(
      s => s.original_teacher_id === originalTeacherId && s.period_order === absentPeriod.period_order
    );
    if (alreadyAssigned) { showToast('This period already has a substitute assigned.', 'error'); return; }

    const { error } = await supabase.from('substitutions').insert({
      school_id: schoolSettings.school_id,
      original_teacher_id: originalTeacherId,
      substitute_teacher_id: substituteTeacherId,
      class: absentPeriod.class,
      subject: absentPeriod.subject,
      day: absentPeriod.day,
      period_order: absentPeriod.period_order,
      period_label: absentPeriod.period_label,
      date: today,
      assigned_by: assignedBy,
      status: 'pending',
    });

    if (error) { showToast('Assignment failed: ' + error.message, 'error'); return; }

    // Notify the substitute teacher
    await supabase.from('app_notifications_queue').insert({
      school_id: schoolSettings.school_id,
      user_id: substituteTeacherId,
      title: '📋 Substitute Class Assigned',
      body: `You have been assigned to cover ${absentPeriod.class} — ${absentPeriod.subject} (Period #${absentPeriod.period_order}${absentPeriod.period_label ? ', ' + absentPeriod.period_label : ''}) today.`,
      route: '/off-classes',
      is_ephemeral: false,
      status: 'pending',
    });

    showToast(`Substitute assigned${assignedBy === 'auto' ? ' (auto)' : ''}!`);
    loadData();
  };

  // ── Teacher: accept substitution ────────────────────────────────────
  const acceptSubstitution = async (subId) => {
    const { error } = await supabase
      .from('substitutions')
      .update({ status: 'accepted' })
      .eq('id', subId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Substitution accepted!');
    loadData();
  };

  // ── Teacher: reject substitution ────────────────────────────────────
  const rejectSubstitution = async (subId) => {
    const { error } = await supabase
      .from('substitutions')
      .update({ status: 'cancelled' })
      .eq('id', subId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Substitution declined. Admin will be notified.');
    loadData();
  };

  // ── Teacher: mark substitution as taken ──────────────────────────────
  const markAsTaken = async (subId) => {
    const { error } = await supabase
      .from('substitutions')
      .update({ status: 'completed', taken_at: new Date().toISOString() })
      .eq('id', subId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Marked as completed!');
    loadData();
  };

  // ── 5-Minute Auto-Assign Rule (IST-aware) ─────────────────────────────
  // For each unassigned absent period whose IST start time has passed by >5 minutes,
  // automatically pick the first available teacher. Falls back to ALL non-absent
  // teachers if no explicit free-period declarations exist.
  useEffect(() => {
    if (!isAdmin || absentPeriods.length === 0) return;

    const absentIds = new Set(absentPeriods.map(p => p.teacher_id_resolved).filter(Boolean));

    const checkAutoAssign = () => {
      const currentIST = getISTNow();

      absentPeriods.forEach(p => {
        const originalTeacherId = p.teacher_id_resolved;
        if (!originalTeacherId) return; // Cannot auto-assign without a valid UUID

        // Already assigned?
        const assigned = substitutions.find(
          s => s.original_teacher_id === originalTeacherId && s.period_order === p.period_order
        );
        if (assigned) return;

        // Parse the period start time (IST)
        const startTime = parsePeriodStartTimeIST(p.period_label, today);
        if (!startTime) return;

        const minutesPassed = (currentIST.getTime() - startTime.getTime()) / 60000;
        if (minutesPassed < 5) return;

        // 1. Try free-period declarers first
        let candidate = freePeriods.find(fp =>
          fp.day === p.day &&
          fp.period_order === p.period_order &&
          fp.teacher_id !== originalTeacherId &&
          !absentIds.has(fp.teacher_id)
        );

        if (candidate) {
          console.info('[OffClasses] Auto-assigning period', p.period_order, 'to free teacher', candidate.teacher?.name);
          assignSubstitute(p, candidate.teacher_id, 'auto');
          return;
        }

        // 2. Fallback: pick the first non-absent teacher from the school roster
        const available = allTeachers.find(t =>
          t.id !== originalTeacherId && !absentIds.has(t.id)
        );
        if (available) {
          console.info('[OffClasses] Auto-assigning period', p.period_order, 'to fallback teacher', available.name);
          assignSubstitute(p, available.id, 'auto');
        }
        // If no teacher available at all, do nothing — UI shows "No substitute available"
      });
    };

    // Run immediately, then every 60 seconds
    checkAutoAssign();
    const timer = setInterval(checkAutoAssign, 60000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, absentPeriods, substitutions, freePeriods, allTeachers]);

  if (!isAdmin && !isTeacher) {
    return <div className="sp-card text-slate-400 text-sm">Access Denied. Only for Admins &amp; Teachers.</div>;
  }

  // ── Teacher's own assigned substitutions today ────────────────────────
  const mySubstitutions = substitutions.filter(s => s.substitute_teacher_id === user?.id);

  return (
    <div className="space-y-5 fade-in pb-10">

      {/* Toast */}
      {toast && (
        <div className={`fixed left-1/2 -translate-x-1/2 bottom-6 z-50 border text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${
          toastType === 'error'
            ? 'bg-red-950 border-red-500/30 text-red-300'
            : 'bg-slate-900 border-white/10 text-white'
        }`}>
          {toastType === 'error' ? <X size={14} className="text-red-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
          {toast}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="sp-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400" />
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Off Classes — Substitute Management</h3>
          </div>
          <button
            onClick={loadData}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Today: {today} ({todayDay}) • IST {getISTNow().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
        </p>
      </div>

      {loading ? (
        <div className="sp-card flex items-center justify-center py-12 gap-3">
          <Loader2 size={20} className="animate-spin text-indigo-400" />
          <span className="text-slate-400 text-sm">Loading substitution data...</span>
        </div>
      ) : (
        <>
          {/* ── Section A: Teacher's Own Substitute Duty (Teacher view) ── */}
          {isTeacher && mySubstitutions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert size={14} /> Your Substitute Duties Today
              </h4>
              {mySubstitutions.map(s => (
                <div key={s.id} className="sp-card border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded uppercase tracking-wider">
                          Period #{s.period_order} {s.period_label ? `• ${s.period_label}` : ''}
                        </span>
                        {s.assigned_by === 'auto' && (
                          <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                            <Zap size={10} /> Auto-Assigned
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-200">{s.class} — {s.subject}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Covering for: <span className="text-slate-300 font-semibold">{s.original?.name || 'Absent Teacher'}</span>
                      </p>
                    </div>

                    {/* ── Accept / Reject / Mark as Taken workflow ── */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {s.status === 'pending' && (
                        <>
                          <button
                            onClick={() => acceptSubstitution(s.id)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors"
                          >
                            <ThumbsUp size={13} /> Accept
                          </button>
                          <button
                            onClick={() => rejectSubstitution(s.id)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-600/80 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors"
                          >
                            <ThumbsDown size={13} /> Decline
                          </button>
                        </>
                      )}
                      {s.status === 'accepted' && (
                        <button
                          onClick={() => markAsTaken(s.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors"
                        >
                          <CheckCircle2 size={14} /> Mark as Taken
                        </button>
                      )}
                      {s.status === 'completed' && (
                        <span className="flex items-center gap-2 text-xs font-black text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
                          <CheckCircle2 size={14} /> Completed
                        </span>
                      )}
                      {s.status === 'cancelled' && (
                        <span className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
                          <X size={14} /> Declined
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Section B: Free Period Declaration (Teacher only) ──────── */}
          {isTeacher && (
            <FreePeriodDeclaration
              schoolId={schoolSettings.school_id}
              teacherId={user?.id}
              todayDay={todayDay}
              today={today}
              freePeriods={freePeriods.filter(fp => fp.teacher_id === user?.id)}
              onRefresh={loadData}
              showToast={showToast}
            />
          )}

          {/* ── Section C: Absent Teacher Periods + Substitute Allocation ─ */}
          <div className="sp-card">
            <div className="flex items-center gap-2 mb-4">
              <UserX size={16} className="text-red-400" />
              <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">Absent Teachers' Classes</h4>
            </div>

            {absentPeriods.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <UserCheck size={32} className="text-emerald-600" />
                <p className="text-sm text-slate-500 italic">
                  All teachers are present today. No off classes.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {absentPeriods.map(p => {
                  const originalTeacherId = p.teacher_id_resolved || p.teacher;
                  const existing = substitutions.find(
                    s => s.original_teacher_id === originalTeacherId && s.period_order === p.period_order
                  );
                  // Find free teachers available for this period
                  const absentIds = new Set(absentPeriods.map(ap => ap.teacher_id_resolved).filter(Boolean));
                  const availableFreeTeachers = freePeriods.filter(
                    fp => fp.day === p.day && fp.period_order === p.period_order &&
                          fp.teacher_id !== originalTeacherId && !absentIds.has(fp.teacher_id)
                  );
                  // Non-absent teachers available as fallback
                  const availableAllTeachers = allTeachers.filter(
                    t => t.id !== originalTeacherId && !absentIds.has(t.id)
                  );

                  return (
                    <AbsentPeriodRow
                      key={p.id}
                      period={p}
                      existing={existing}
                      availableFreeTeachers={availableFreeTeachers}
                      availableAllTeachers={availableAllTeachers}
                      isAdmin={isAdmin}
                      today={today}
                      onAssign={(subTeacherId) => assignSubstitute(p, subTeacherId, 'admin')}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Section D: Today's Substitution Summary (Admin view) ────── */}
          {isAdmin && substitutions.length > 0 && (
            <div className="sp-card">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">Assigned Substitutions Today</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Period', 'Class', 'Subject', 'Absent Teacher', 'Substitute', 'Status', 'Assigned By'].map(h => (
                        <th key={h} className="text-left text-xs font-black text-slate-500 uppercase tracking-widest py-3 px-4 border-b border-white/5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {substitutions.map(s => (
                      <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="py-3 px-4">
                          <span className="inline-block bg-slate-700 text-slate-200 text-xs font-black px-2 py-0.5 rounded-md mr-2">#{s.period_order}</span>
                          <span className="text-slate-500 text-xs">{s.period_label || ''}</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-200">{s.class}</td>
                        <td className="py-3 px-4 text-slate-300">{s.subject}</td>
                        <td className="py-3 px-4 text-red-400 font-semibold">{s.original?.name || '—'}</td>
                        <td className="py-3 px-4 text-emerald-400 font-semibold">{s.substitute?.name || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                            s.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                            s.status === 'accepted' ? 'bg-blue-500/20 text-blue-400' :
                            s.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            {s.assigned_by === 'auto' ? <Zap size={11} className="text-indigo-400" /> : null}
                            {s.assigned_by}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: AbsentPeriodRow
// ─────────────────────────────────────────────────────────────────────────────
function AbsentPeriodRow({ period, existing, availableFreeTeachers, availableAllTeachers, isAdmin, today, onAssign }) {
  const [selectedSub, setSelectedSub] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Track IST-aware countdown for visual display
  const startTime = parsePeriodStartTimeIST(period.period_label, today);
  const [minutesPassed, setMinutesPassed] = useState(() =>
    startTime ? Math.max(0, (getISTNow().getTime() - startTime.getTime()) / 60000) : 0
  );

  useEffect(() => {
    if (!startTime || existing) return;
    const interval = setInterval(() => {
      setMinutesPassed(Math.max(0, (getISTNow().getTime() - startTime.getTime()) / 60000));
    }, 15000);
    return () => clearInterval(interval);
  }, [startTime, existing]);

  const isOverdue = startTime && minutesPassed >= 5 && !existing;
  const hasAnyCandidates = availableFreeTeachers.length > 0 || availableAllTeachers.length > 0;

  const handleAssign = async () => {
    if (!selectedSub) return;
    setAssigning(true);
    await onAssign(selectedSub);
    setAssigning(false);
    setSelectedSub('');
  };

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      existing
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : isOverdue
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-white/8 bg-white/3'
    }`}>
      <div className="flex items-start gap-3 flex-wrap">
        {/* Period badge */}
        <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider flex-shrink-0 ${
          existing ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-200'
        }`}>
          #{period.period_order} {period.period_label ? `• ${period.period_label}` : ''}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-200 text-sm">{period.class}</span>
            <span className="text-slate-400 text-xs">—</span>
            <span className="text-slate-300 text-sm">{period.subject}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <UserX size={11} className="text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400 font-semibold">{period.teacher_name}</span>
          </div>
        </div>

        {/* Status / Assignment section */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {existing ? (
            <div className="flex items-center gap-2">
              <UserCheck size={14} className="text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">{existing.substitute?.name || 'Assigned'}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 ${
                existing.status === 'accepted' ? 'bg-blue-500/20 text-blue-400' :
                existing.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                existing.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                'bg-amber-500/20 text-amber-400'
              }`}>
                {existing.assigned_by === 'auto' && <Zap size={9} />}
                {existing.status}
              </span>
            </div>
          ) : (
            <>
              {/* Overdue / no candidates messaging */}
              {isOverdue && !hasAnyCandidates && (
                <span className="text-[10px] font-black text-red-400 flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded">
                  <AlertTriangle size={10} /> No substitute available — assign manually
                </span>
              )}
              {isOverdue && hasAnyCandidates && (
                <span className="text-[10px] font-black text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded">
                  <Clock size={10} /> Overdue by {Math.floor(minutesPassed)} min
                </span>
              )}

              {/* Free teacher suggestions */}
              {availableFreeTeachers.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {availableFreeTeachers.slice(0, 3).map(fp => (
                    <button
                      key={fp.id}
                      onClick={() => setSelectedSub(fp.teacher_id)}
                      className={`text-[10px] font-black px-2 py-0.5 rounded border transition-colors ${
                        selectedSub === fp.teacher_id
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                      }`}
                    >
                      ✓ {fp.teacher?.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Admin assignment controls */}
      {isAdmin && !existing && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 flex-wrap">
          <select
            value={selectedSub}
            onChange={e => setSelectedSub(e.target.value)}
            className="sp-input text-xs py-1.5 flex-1 min-w-[160px] mb-0"
          >
            <option value="">— Pick a substitute teacher —</option>
            {availableFreeTeachers.length > 0 && (
              <optgroup label="✓ Free This Period">
                {availableFreeTeachers.map(fp => (
                  <option key={fp.id} value={fp.teacher_id}>{fp.teacher?.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="All Available Teachers">
              {availableAllTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          </select>
          <button
            onClick={handleAssign}
            disabled={!selectedSub || assigning}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50"
          >
            {assigning ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
            Assign & Notify
          </button>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: FreePeriodDeclaration (Teacher only)
// ─────────────────────────────────────────────────────────────────────────────
function FreePeriodDeclaration({ schoolId, teacherId, todayDay, today, freePeriods, onRefresh, showToast }) {
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    async function fetchMySlots() {
      setLoading(true);
      // FOUNDATIONAL FIX: fetch teacher name for legacy timetable matching
      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', teacherId)
        .single();
      const teacherName = profile?.name || '';
      // Query with both UUID and name to handle legacy data
      const { data } = await supabase
        .from('timetable')
        .select('*')
        .or(`teacher.eq."${teacherId}",teacher.eq."${teacherName.replace(/"/g, '\\"')}"`)
        .eq('day', todayDay)
        .order('period_order');
      setTimetableSlots(data || []);
      setLoading(false);
    }
    if (teacherId && todayDay) fetchMySlots();
  }, [teacherId, todayDay]);

  const isFree = (periodOrder) => freePeriods.some(fp => fp.period_order === periodOrder && fp.day === todayDay);

  const toggleFree = async (slot) => {
    setToggling(slot.period_order);
    if (isFree(slot.period_order)) {
      const { error } = await supabase
        .from('timetable_free_periods')
        .delete()
        .eq('school_id', schoolId)
        .eq('teacher_id', teacherId)
        .eq('day', todayDay)
        .eq('period_order', slot.period_order)
        .eq('date', today);
      if (error) showToast('Error: ' + error.message, 'error');
      else showToast('Free period removed.');
    } else {
      const { error } = await supabase.from('timetable_free_periods').upsert({
        school_id: schoolId,
        teacher_id: teacherId,
        day: todayDay,
        period_order: slot.period_order,
        date: today,
      }, { onConflict: 'school_id,teacher_id,day,period_order,date' });
      if (error) showToast('Error: ' + error.message, 'error');
      else showToast('Marked as free! Admin can now assign you as a substitute.');
    }
    await onRefresh();
    setToggling(null);
  };

  if (loading) return null;
  if (timetableSlots.length === 0) return null;

  return (
    <div className="sp-card">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={15} className="text-indigo-400" />
        <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">Declare Free Periods (Today)</h4>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Toggle any of your scheduled periods as "free" to signal that you can cover absent teachers' classes.
      </p>
      <div className="flex flex-wrap gap-2">
        {timetableSlots.map(slot => {
          const free = isFree(slot.period_order);
          return (
            <button
              key={slot.id}
              onClick={() => toggleFree(slot)}
              disabled={toggling === slot.period_order}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                free
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-slate-700/50 border-white/8 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {toggling === slot.period_order
                ? <Loader2 size={11} className="animate-spin" />
                : free ? <CheckCircle2 size={11} /> : null}
              P{slot.period_order} — {slot.class} ({slot.subject})
              {free && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">FREE</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
