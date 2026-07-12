import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import {
  AlertTriangle, Loader2, UserX, UserCheck, Clock, Bell,
  CheckCircle2, RefreshCw, Zap, ShieldAlert, X, ThumbsUp, ThumbsDown, Plus, Check, HelpCircle
} from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import { useTieredCache, isNightTime } from '../../hooks/useTieredCache';
import UserAvatar from '../../components/UserAvatar';
import { moduleWalkthroughs } from '../../config/moduleWalkthroughs';

function StatusHelpIcon({ status }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show) return;
    const handleClose = () => setShow(false);
    document.addEventListener('click', handleClose);
    document.addEventListener('touchstart', handleClose);
    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('touchstart', handleClose);
    };
  }, [show]);

  const explanations = {
    pending: "Substitution is assigned but the teacher has not accepted or rejected it yet.",
    accepted: "Substitute teacher has accepted the substitution duty.",
    completed: "Substitute teacher has successfully taken and completed this class.",
    cancelled: "This substitution request was cancelled by the Admin.",
    expired: "No teacher accepted this pending request before the class time started, so it expired.",
    no_teacher_available: "No teacher was free or accepted the broadcast request, so it was marked uncovered.",
    class_over: "The class timing for this period has completed.",
    overdue: "The class start time has passed but no teacher has marked it as started yet.",
    no_substitute_available: "No substitute teacher was found or assigned to this off period."
  };

  const text = explanations[status] || "Status explanation not available.";

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow(!show); }}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          margin: 0,
          color: 'currentColor',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          opacity: 0.8,
        }}
        title="Click for explanation"
      >
        <HelpCircle size={12} />
      </button>
      {show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%) translateY(-8px)',
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--card-border, #e2e8f0)',
          borderRadius: '10px',
          padding: '8px 12px',
          width: '180px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          zIndex: 9999,
          pointerEvents: 'none',
          textAlign: 'left',
        }}>
          <p style={{
            margin: 0,
            fontSize: '11px',
            lineHeight: '1.4',
            color: 'var(--text-main, #1e293b)',
            fontWeight: 500,
            textTransform: 'none',
            letterSpacing: 'normal'
          }}>
            {text}
          </p>
          {/* Tooltip arrow */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--card-border, #e2e8f0)',
          }} />
          <div style={{
            position: 'absolute',
            top: '99%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid var(--card-bg, #ffffff)',
          }} />
        </div>
      )}
    </div>
  );
}

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
  const istOffset = 5.5 * 60 * 60 * 1000; // +5:30 in ms
  const utcMs = utc.getTime() + utc.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + istOffset);
}

function parsePeriodStartTimeIST(periodLabel, dateStr) {
  if (!periodLabel) return null;
  const match = periodLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function parsePeriodEndTimeIST(periodLabel, dateStr) {
  if (!periodLabel) return null;
  const parts = periodLabel.split(/-|to/i);
  if (parts.length < 2) return null;
  const endPart = parts[1].trim();
  const match = endPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  let ampm = match[3];
  if (!ampm) {
    const overallAmPmMatch = periodLabel.match(/(AM|PM)/i);
    if (overallAmPmMatch) ampm = overallAmPmMatch[1];
  }
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to compute status at render time
const getEffectiveSubStatus = (sub) => {
  if (sub.status !== 'pending') return sub.status;
  const currentNow = getISTNow();
  const endTime = parsePeriodEndTimeIST(sub.period_label, sub.date);
  if (endTime && currentNow >= endTime) {
    return 'expired';
  }
  return 'pending';
};

export default function OffClasses() {
  const { role, user, schoolSettings } = useAppStore();
  const cacheConfig = useTieredCache({
    freeStaleTime: 10 * 60 * 1000,
    premiumStaleTime: 30 * 1000,
    premiumRefetchInterval: 60000
  });
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const userRole = (role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'platform_admin';

  useEffect(() => {
    if (isAdmin) {
      const hasCompleted = localStorage.getItem('onboarding_completed_off_classes');
      if (!hasCompleted) {
        setShowOnboarding(true);
      }
    }
  }, [isAdmin]);

  const handleCompleteOnboarding = () => {
    localStorage.setItem('onboarding_completed_off_classes', 'true');
    setShowOnboarding(false);
  };
  const [absentPeriods, setAbsentPeriods] = useState([]);
  const [freePeriods, setFreePeriods] = useState([]);
  const [substitutions, setSubstitutions] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]);
  const [todayTimetable, setTodayTimetable] = useState([]);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('success');
  const [classFilter, setClassFilter] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    const r = (role || '').toLowerCase();
    if (r === 'teacher') return 'duties';
    return 'absent';
  });

  const isTeacher = userRole === 'teacher';

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

  const loadData = useCallback(async () => {
    if (!schoolSettings?.school_id) return;
    setLoading(true);

    try {
      const { data: teachersList } = await supabase
        .from('users')
        .select('id, name, avatar_url, avatar_file_id, hide_avatar_from_class')
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
      const absentTeacherIds = combinedAbsentIds.filter(id => teacherIdToName[id]);
      const absentTeacherNames = absentTeacherIds.map(id => teacherIdToName[id]).filter(Boolean);

      let enrichedPeriods = [];
      if (absentTeacherIds.length > 0) {
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
          let resolvedTeacherId = UUID_PATTERN.test(p.teacher || '') ? p.teacher : null;
          let resolvedTeacherName = p.teacher || 'Unknown';
          if (!resolvedTeacherId) {
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

      const { data: freePeriodsData } = await supabase
        .from('timetable_free_periods')
        .select('*, teacher:users(name)')
        .eq('school_id', schoolSettings.school_id)
        .eq('date', today)
        .eq('day', todayDay);

      const { data: subsData } = await supabase
        .from('substitutions')
        .select('*, substitute:users!substitutions_substitute_teacher_id_fkey(name, avatar_url, avatar_file_id, hide_avatar_from_class), original:users!substitutions_original_teacher_id_fkey(name, avatar_url, avatar_file_id, hide_avatar_from_class)')
        .eq('school_id', schoolSettings.school_id)
        .eq('date', today);

      const { data: todayTTData } = await supabase
        .from('timetable')
        .select('teacher_id, period_order')
        .eq('school_id', schoolSettings.school_id)
        .eq('day', todayDay);

      setAbsentPeriods(enrichedPeriods);
      setFreePeriods(freePeriodsData || []);
      setSubstitutions(subsData || []);
      setTodayTimetable(todayTTData || []);
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

  useEffect(() => {
    if (!schoolSettings?.school_id) return;
    let intervalId = null;
    if (cacheConfig.refetchInterval) {
      intervalId = setInterval(() => {
        loadData();
      }, cacheConfig.refetchInterval);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [schoolSettings?.school_id, loadData, cacheConfig.refetchInterval]);

  // ── Admin: assign a substitute manually ────────────────────────────────
  const assignSubstitute = async (absentPeriod, substituteTeacherId, assignedBy = 'admin') => {
    if (!substituteTeacherId) { showToast('Please select a substitute teacher.', 'error'); return; }

    const originalTeacherId = absentPeriod.teacher_id_resolved;
    if (!originalTeacherId) {
      showToast('Error: Could not resolve the absent teacher ID.', 'error');
      return;
    }

    if (substituteTeacherId === originalTeacherId) {
      showToast('Cannot assign the absent teacher as their own substitute.', 'error');
      return;
    }

    const alreadyAssigned = substitutions.find(
      s => s.original_teacher_id === originalTeacherId && s.period_order === absentPeriod.period_order
    );

    if (alreadyAssigned && alreadyAssigned.status !== 'cancelled' && getEffectiveSubStatus(alreadyAssigned) !== 'expired') {
      showToast('This period already has an active substitute assigned.', 'error');
      return;
    }

    let error;
    if (alreadyAssigned) {
      const { error: err } = await supabase
        .from('substitutions')
        .update({
          substitute_teacher_id: substituteTeacherId,
          status: 'pending',
          assigned_by: assignedBy,
          assigned_at: new Date().toISOString(),
          volunteers: []
        })
        .eq('id', alreadyAssigned.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('substitutions').insert({
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
        volunteers: []
      });
      error = err;
    }

    if (error) { showToast('Assignment failed: ' + error.message, 'error'); return; }

    await supabase.from('app_notifications_queue').insert({
      school_id: schoolSettings.school_id,
      user_id: substituteTeacherId,
      title: '📋 Substitute Class Assigned',
      body: `You have been assigned to cover ${absentPeriod.class} — ${absentPeriod.subject} (Period #${absentPeriod.period_order}) today.`,
      route: '/off-classes',
      is_ephemeral: false,
      status: 'pending',
    });

    showToast(`Substitute assigned${assignedBy === 'auto' ? ' (auto)' : ''}!`);
    loadData();
  };

  // ── Admin: Broadcast open duty for volunteering ──────────────────────
  const broadcastForVolunteer = async (absentPeriod) => {
    const originalTeacherId = absentPeriod.teacher_id_resolved;
    if (!originalTeacherId) {
      showToast('Error: Could not resolve the absent teacher ID.', 'error');
      return;
    }

    const alreadyAssigned = substitutions.find(
      s => s.original_teacher_id === originalTeacherId && s.period_order === absentPeriod.period_order
    );

    if (alreadyAssigned && alreadyAssigned.status !== 'cancelled' && getEffectiveSubStatus(alreadyAssigned) !== 'expired') {
      showToast('This period already has an active substitution record.', 'error');
      return;
    }

    let error;
    if (alreadyAssigned) {
      const { error: err } = await supabase
        .from('substitutions')
        .update({
          substitute_teacher_id: null,
          status: 'pending',
          assigned_by: 'broadcast',
          assigned_at: new Date().toISOString(),
          volunteers: []
        })
        .eq('id', alreadyAssigned.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('substitutions').insert({
        school_id: schoolSettings.school_id,
        original_teacher_id: originalTeacherId,
        substitute_teacher_id: null,
        class: absentPeriod.class,
        subject: absentPeriod.subject,
        day: absentPeriod.day,
        period_order: absentPeriod.period_order,
        period_label: absentPeriod.period_label,
        date: today,
        assigned_by: 'broadcast',
        status: 'pending',
        volunteers: []
      });
      error = err;
    }

    if (error) { showToast('Broadcast failed: ' + error.message, 'error'); return; }
    showToast('Broadcasted open duty to all free teachers!');
    loadData();
  };

  // ── Teacher: Volunteer to cover open class ───────────────────────────
  const volunteerToCover = async (subId) => {
    const sub = substitutions.find(s => s.id === subId);
    if (!sub) return;

    const currentVolunteers = sub.volunteers || [];
    if (currentVolunteers.some(v => v.teacher_id === user.id)) {
      showToast('You have already volunteered for this period.', 'error');
      return;
    }

    const newVolunteers = [...currentVolunteers, {
      teacher_id: user.id,
      teacher_name: user.name || user.email,
      submitted_at: new Date().toISOString()
    }];

    const { error } = await supabase
      .from('substitutions')
      .update({ volunteers: newVolunteers })
      .eq('id', subId);

    if (error) { showToast('Failed to volunteer: ' + error.message, 'error'); return; }
    showToast('Successfully volunteered! Awaiting admin approval.');
    loadData();
  };

  // ── Admin: Approve / Reject volunteer ────────────────────────────────
  const approveVolunteer = async (subId, volunteerId, volunteerName) => {
    const { error } = await supabase
      .from('substitutions')
      .update({
        substitute_teacher_id: volunteerId,
        status: 'accepted', // Automatically accepted since they volunteered!
        volunteers: [],
        assigned_by: 'volunteer_approval'
      })
      .eq('id', subId);

    if (error) { showToast('Approval failed: ' + error.message, 'error'); return; }
    
    // Notify
    await supabase.from('app_notifications_queue').insert({
      school_id: schoolSettings.school_id,
      user_id: volunteerId,
      title: '✓ Volunteer Request Approved',
      body: `Your request to cover class has been approved. You are scheduled for this substitution duty.`,
      route: '/off-classes',
      is_ephemeral: false,
      status: 'pending',
    });

    showToast(`Approved volunteer ${volunteerName}!`);
    loadData();
  };

  const rejectVolunteer = async (subId, volunteerId) => {
    const sub = substitutions.find(s => s.id === subId);
    if (!sub) return;

    const newVolunteers = (sub.volunteers || []).filter(v => v.teacher_id !== volunteerId);
    const { error } = await supabase
      .from('substitutions')
      .update({ volunteers: newVolunteers })
      .eq('id', subId);

    if (error) { showToast('Rejection failed: ' + error.message, 'error'); return; }
    showToast('Rejected volunteer request.');
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

  // ── Teacher: reject substitution (routes to next teacher) ───────────
  const rejectSubstitution = async (subId) => {
    const sub = substitutions.find(s => s.id === subId);
    if (!sub) return;

    const currentDeclined = sub.declined_teacher_ids || [];
    const newDeclined = Array.from(new Set([...currentDeclined, user.id]));

    // Reset sub record to pending & unassigned, appending current teacher to declined list
    const { error } = await supabase
      .from('substitutions')
      .update({
        substitute_teacher_id: null,
        status: 'pending',
        declined_teacher_ids: newDeclined,
        volunteers: []
      })
      .eq('id', subId);

    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Declined. The request will be routed to other available teachers.');
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

  // ── 5-Minute Auto-Assign Fallback Routing Loop (IST-aware) ──────────
  useEffect(() => {
    if (!isAdmin || absentPeriods.length === 0) return;

    const absentIds = new Set(absentPeriods.map(p => p.teacher_id_resolved).filter(Boolean));

    const checkAutoAssign = () => {
      const currentIST = getISTNow();

      absentPeriods.forEach(async (p) => {
        const originalTeacherId = p.teacher_id_resolved;
        if (!originalTeacherId) return;

        const startTime = parsePeriodStartTimeIST(p.period_label, today);
        const endTime = parsePeriodEndTimeIST(p.period_label, today);
        if (!startTime || !endTime) return;

        // Do not auto-assign if period already ended
        if (currentIST >= endTime) return;

        // Auto-assign triggers 5 minutes before period start
        const minutesToStart = (startTime.getTime() - currentIST.getTime()) / 60000;
        if (minutesToStart > 5) return;

        // Find active non-declined substitution
        const activeSub = substitutions.find(
          s => s.original_teacher_id === originalTeacherId &&
               s.period_order === p.period_order &&
               s.status !== 'cancelled' &&
               s.status !== 'expired' &&
               s.status !== 'no_teacher_available'
        );

        // If someone is already assigned (pending or accepted), skip auto-assign
        if (activeSub && activeSub.substitute_teacher_id) return;

        const declinedIds = activeSub?.declined_teacher_ids || [];

        // 1. Check free period declarers first
        let candidate = freePeriods.find(fp =>
          fp.day === p.day &&
          fp.period_order === p.period_order &&
          fp.teacher_id !== originalTeacherId &&
          !absentIds.has(fp.teacher_id) &&
          !declinedIds.includes(fp.teacher_id)
        );

        let candidateId = candidate?.teacher_id;

        // 2. Fallback: check who does not have scheduled class this period
        if (!candidateId) {
          const busyTeacherIds = new Set(
            substitutions
              .filter(s => s.status !== 'cancelled' && s.status !== 'expired' && s.period_order === p.period_order && s.substitute_teacher_id)
              .map(s => s.substitute_teacher_id)
          );

          const availableTeacher = allTeachers.find(t => {
            if (t.id === originalTeacherId || absentIds.has(t.id) || declinedIds.includes(t.id) || busyTeacherIds.has(t.id)) {
              return false;
            }
            // Check if teacher is scheduled in today's timetable at this slot
            const isScheduledBusy = todayTimetable.some(tt => tt.teacher_id === t.id && tt.period_order === p.period_order);
            return !isScheduledBusy;
          });

          if (availableTeacher) {
            candidateId = availableTeacher.id;
          }
        }

        // Apply auto-assignment
        if (candidateId) {
          console.info('[OffClasses] Auto-assigning period', p.period_order, 'to candidate', candidateId);
          if (activeSub) {
            await supabase
              .from('substitutions')
              .update({
                substitute_teacher_id: candidateId,
                status: 'pending',
                assigned_by: 'auto',
                assigned_at: new Date().toISOString()
              })
              .eq('id', activeSub.id);
          } else {
            await supabase.from('substitutions').insert({
              school_id: schoolSettings.school_id,
              original_teacher_id: originalTeacherId,
              substitute_teacher_id: candidateId,
              class: p.class,
              subject: p.subject,
              day: p.day,
              period_order: p.period_order,
              period_label: p.period_label,
              date: today,
              assigned_by: 'auto',
              status: 'pending',
              declined_teacher_ids: declinedIds
            });
          }

          // Send App notification
          await supabase.from('app_notifications_queue').insert({
            school_id: schoolSettings.school_id,
            user_id: candidateId,
            title: '⚡ Auto-Assigned Substitution',
            body: `You have been automatically assigned to cover Class ${p.class} — ${p.subject} (Period #${p.period_order}) today.`,
            route: '/off-classes',
            is_ephemeral: false,
            status: 'pending',
          });

          loadData();
        } else {
          // No teacher available!
          console.warn('[OffClasses] No available teacher for period', p.period_order);
          if (activeSub) {
            await supabase
              .from('substitutions')
              .update({ status: 'no_teacher_available' })
              .eq('id', activeSub.id);
            loadData();
          } else {
            await supabase.from('substitutions').insert({
              school_id: schoolSettings.school_id,
              original_teacher_id: originalTeacherId,
              substitute_teacher_id: null,
              class: p.class,
              subject: p.subject,
              day: p.day,
              period_order: p.period_order,
              period_label: p.period_label,
              date: today,
              assigned_by: 'auto',
              status: 'no_teacher_available',
              declined_teacher_ids: declinedIds
            });
            loadData();
          }
        }
      });
    };

    checkAutoAssign();
    const timer = setInterval(checkAutoAssign, 60000);
    return () => clearInterval(timer);
  }, [isAdmin, absentPeriods, substitutions, freePeriods, allTeachers, todayTimetable, today]);

  if (!isAdmin && !isTeacher) {
    return <div className="sp-card text-slate-400 text-sm">Access Denied. Only for Admins &amp; Teachers.</div>;
  }

  // Teacher's own assigned substitutions
  const mySubstitutions = substitutions.filter(s => s.substitute_teacher_id === user?.id);

  // Volunteer opportunities: Open duties that this teacher is free to cover
  const openDutiesForVolunteering = substitutions.filter(s => {
    if (s.substitute_teacher_id !== null) return false;
    
    const effStatus = getEffectiveSubStatus(s);
    if (effStatus !== 'pending') return false;

    // Cannot cover own class
    if (s.original_teacher_id === user?.id) return false;

    // Check if scheduled busy
    const hasClassThisPeriod = todayTimetable.some(tt => tt.teacher_id === user?.id && tt.period_order === s.period_order);
    if (hasClassThisPeriod) return false;

    // Check if already covering something else this period
    const hasSubThisPeriod = substitutions.some(sub => sub.substitute_teacher_id === user?.id && sub.period_order === s.period_order && sub.status !== 'cancelled' && getEffectiveSubStatus(sub) !== 'expired');
    if (hasSubThisPeriod) return false;

    // Already volunteered?
    const volunteeredList = s.volunteers || [];
    if (volunteeredList.some(v => v.teacher_id === user?.id)) return false;

    // Has declined?
    const declinedList = s.declined_teacher_ids || [];
    if (declinedList.includes(user?.id)) return false;

    return true;
  });

  const tabs = [];
  if (isTeacher) {
    tabs.push({ id: 'duties', label: 'My Duties & Opportunities' });
    tabs.push({ id: 'declare', label: 'Declare Free Periods' });
  }
  if (isAdmin) {
    tabs.push({ id: 'absent', label: 'Absent Periods & Coverage' });
    tabs.push({ id: 'assigned', label: 'Assigned Substitutions' });
  }

  return (
    <div className="space-y-6 fade-in pb-10">

      {/* Onboarding Guide Card */}
      {showOnboarding && moduleWalkthroughs?.off_classes && (
        <div 
          className="fixed bottom-6 right-6 z-[150] w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500 text-left flex flex-col"
          style={{ 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)', 
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/5 mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-widest">{moduleWalkthroughs.off_classes.title}</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">{moduleWalkthroughs.off_classes.subtitle}</p>
              </div>
            </div>
            <button 
              onClick={handleCompleteOnboarding}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            {moduleWalkthroughs.off_classes.description}
          </p>

          {/* Steps */}
          <div className="space-y-3 mb-4">
            <h5 className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Setup Guidelines:</h5>
            {moduleWalkthroughs.off_classes.steps.map((step, idx) => (
              <div key={idx} className="bg-slate-950/40 border border-white/5 rounded-xl p-3">
                <div className="text-[11px] font-bold text-white mb-1">{step.title}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-3 mb-4 space-y-2">
            <h5 className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Pro Tips:</h5>
            {moduleWalkthroughs.off_classes.tips.map((tip, idx) => (
              <div key={idx} className="flex gap-2 text-[11px] text-slate-400 leading-relaxed">
                <span>•</span>
                <p>{tip}</p>
              </div>
            ))}
          </div>

          {/* Action Footer */}
          <div className="flex justify-end pt-2 border-t border-white/5">
            <button 
              onClick={handleCompleteOnboarding}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              Got it, Close
            </button>
          </div>
        </div>
      )}

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

      {/* Header */}
      <div className="sp-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Off Classes — Substitute Management</h3>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowOnboarding(true)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                title="View Guide"
              >
                <HelpCircle size={16} />
              </button>
            )}
            <button
              onClick={loadData}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Today: {today} ({todayDay}) • IST {getISTNow().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
        </p>
      </div>

      {/* Tabs Selector */}
      {tabs.length > 1 && (
        <div className="flex bg-slate-100 dark:bg-slate-950/40 p-1.5 rounded-xl border border-slate-200 dark:border-white/5 gap-1.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 px-4 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === t.id
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-205 dark:hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="sp-card flex items-center justify-center py-12 gap-3">
          <Loader2 size={20} className="animate-spin text-indigo-400" />
          <span className="text-slate-400 text-sm">Loading substitution data...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* My Duties Tab */}
          {activeTab === 'duties' && isTeacher && (
            <div className="space-y-6">
              {/* Section A: Teacher's Own Substitute Duty (Teacher view) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert size={14} /> Your Substitute Duties Today
                </h4>
                {mySubstitutions.length === 0 ? (
                  <div className="sp-card text-center text-slate-500 text-xs py-8 font-semibold">
                    No substitute duties assigned to you today.
                  </div>
                ) : (
                  mySubstitutions.map(s => {
                    const effStatus = getEffectiveSubStatus(s);
                    return (
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
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{s.class} — {s.subject}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Covering for: <span className="text-slate-700 dark:text-slate-300 font-semibold">{s.original?.name || 'Absent Teacher'}</span>
                            </p>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            {effStatus === 'pending' && (
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
                            {effStatus === 'accepted' && (
                              <button
                                onClick={() => markAsTaken(s.id)}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors"
                              >
                                <CheckCircle2 size={14} /> Mark as Taken
                              </button>
                            )}
                            {effStatus === 'completed' && (
                              <span className="flex items-center gap-2 text-xs font-black text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
                                <CheckCircle2 size={14} /> Completed
                              </span>
                            )}
                            {effStatus === 'cancelled' && (
                              <span className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
                                <X size={14} /> Declined
                              </span>
                            )}
                            {effStatus === 'expired' && (
                              <span className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
                                <X size={14} /> Not Accepted
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Section A-2: Volunteer Opportunities */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <Bell size={14} /> Open Substitution Cover Opportunities
                </h4>
                {openDutiesForVolunteering.length === 0 ? (
                  <div className="sp-card text-center text-slate-500 text-xs py-8 font-semibold">
                    No open substitution opportunities available for volunteering.
                  </div>
                ) : (
                  openDutiesForVolunteering.map(s => (
                    <div key={s.id} className="sp-card border-indigo-500/30 bg-indigo-500/5">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <span className="text-xs font-black bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded uppercase tracking-wider mb-1 inline-block">
                            Period #{s.period_order} {s.period_label ? `• ${s.period_label}` : ''}
                          </span>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{s.class} — {s.subject}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Absent Teacher: <span className="text-slate-700 dark:text-slate-300 font-semibold">{s.original?.name || 'Absent Teacher'}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => volunteerToCover(s.id)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shadow-md shadow-indigo-500/10"
                        >
                          <Plus size={14} /> Volunteer to Cover
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Declare Free Periods Tab */}
          {activeTab === 'declare' && isTeacher && (
            <FreePeriodDeclaration
              schoolId={schoolSettings.school_id}
              teacherId={user.id}
              todayDay={todayDay}
              today={today}
              freePeriods={freePeriods}
              onRefresh={loadData}
              showToast={showToast}
            />
          )}

          {/* Absent Periods & Coverage Tab */}
          {activeTab === 'absent' && isAdmin && (() => {
            const uniqueAbsentClasses = Array.from(new Set(absentPeriods.map(ap => ap.class).filter(Boolean))).sort();
            const filteredPeriods = classFilter 
              ? absentPeriods.filter(ap => ap.class?.toString().trim().toLowerCase() === classFilter.trim().toLowerCase())
              : absentPeriods;

            const groupedPeriods = filteredPeriods.reduce((acc, p) => {
              const key = p.period_order;
              if (!acc[key]) {
                acc[key] = {
                  period_order: p.period_order,
                  period_label: p.period_label,
                  items: []
                };
              }
              acc[key].items.push(p);
              return acc;
            }, {});

            const sortedGroupKeys = Object.keys(groupedPeriods).sort((a, b) => Number(a) - Number(b));

            return (
              <div className="space-y-4">
                {/* Header with filter */}
                <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-slate-100 dark:border-white/5">
                  <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <UserX size={14} /> Today's Absent Periods &amp; Coverage
                  </h4>
                  
                  {absentPeriods.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Filter Class:</span>
                      <select
                        value={classFilter}
                        onChange={e => setClassFilter(e.target.value)}
                        className="bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-white/10 px-3 py-1 rounded-xl text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer outline-none"
                      >
                        <option value="">All Classes</option>
                        {uniqueAbsentClasses.map(c => (
                          <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {absentPeriods.length === 0 ? (
                  <div className="sp-card text-center text-slate-500 text-xs py-8 font-semibold">
                    ✓ All teachers are present today! No substitutions required.
                  </div>
                ) : filteredPeriods.length === 0 ? (
                  <div className="sp-card text-center text-slate-500 text-xs py-8 font-semibold">
                    No absent periods found matching "{classFilter}".
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sortedGroupKeys.map(key => {
                      const group = groupedPeriods[key];
                      return (
                        <div key={key} className="space-y-3 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-850 shadow-sm">
                          {/* Period Group Header */}
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3 mb-2">
                            <div className="flex items-center gap-3">
                              <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 font-bold text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                Period #{group.period_order}
                              </span>
                              <span className="text-slate-805 dark:text-slate-200 text-sm font-extrabold tracking-wide">{group.period_label || 'Daily Schedule'}</span>
                            </div>
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">
                              {group.items.length} {group.items.length === 1 ? 'Class Off' : 'Classes Off'}
                            </span>
                          </div>

                          {/* Row Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {group.items.map(p => {
                              const originalTeacherId = p.teacher_id_resolved;
                              const existing = substitutions.find(
                                s => s.original_teacher_id === originalTeacherId && s.period_order === p.period_order
                              );

                              const absentIds = new Set(absentPeriods.map(ap => ap.teacher_id_resolved).filter(Boolean));

                              const busyTeacherIds = new Set(
                                todayTimetable
                                  .filter(tt => tt.period_order === p.period_order)
                                  .map(tt => tt.teacher_id)
                              );

                              const busySubstitutedTeacherIds = new Set(
                                substitutions
                                  .filter(s => s.period_order === p.period_order && s.status !== 'cancelled' && getEffectiveSubStatus(s) !== 'expired')
                                  .map(s => s.substitute_teacher_id)
                                  .filter(Boolean)
                              );

                              const availableFreeTeachers = freePeriods.filter(
                                fp => fp.day === p.day && fp.period_order === p.period_order &&
                                       fp.teacher_id !== originalTeacherId && !absentIds.has(fp.teacher_id) &&
                                       !busySubstitutedTeacherIds.has(fp.teacher_id)
                              );

                              const availableAllTeachers = allTeachers.filter(
                                t => t.id !== originalTeacherId &&
                                     !absentIds.has(t.id) &&
                                     !busyTeacherIds.has(t.id) &&
                                     !busySubstitutedTeacherIds.has(t.id)
                              );

                              return (
                                <AbsentPeriodRow
                                  key={p.id}
                                  period={p}
                                  existing={existing}
                                  availableFreeTeachers={availableFreeTeachers}
                                  availableAllTeachers={availableAllTeachers}
                                  allTeachers={allTeachers}
                                  isAdmin={isAdmin}
                                  today={today}
                                  onAssign={(subTeacherId) => assignSubstitute(p, subTeacherId, 'admin')}
                                  onBroadcast={() => broadcastForVolunteer(p)}
                                  onApproveVolunteer={(subId, volId, name) => approveVolunteer(subId, volId, name)}
                                  onRejectVolunteer={(subId, volId) => rejectVolunteer(subId, volId)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Assigned Substitutions Tab */}
          {activeTab === 'assigned' && isAdmin && (
            <div className="sp-card">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Assigned Substitutions Today</h4>
              </div>
              {substitutions.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-8 font-semibold">
                  No substitutions have been assigned yet today.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Period', 'Class', 'Subject', 'Absent Teacher', 'Substitute', 'Status', 'Assigned By'].map(h => (
                          <th key={h} className="text-left text-xs font-black text-slate-500 uppercase tracking-widest py-3 px-4 border-b border-slate-200 dark:border-slate-805">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {substitutions.map(s => {
                        const effStatus = getEffectiveSubStatus(s);
                        return (
                          <tr key={s.id} className="border-b border-slate-150 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                            <td className="py-3 px-4">
                              <span className="inline-block bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black px-2 py-0.5 rounded-md mr-2">#{s.period_order}</span>
                              <span className="text-slate-500 text-xs">{s.period_label || ''}</span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{s.class}</td>
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{s.subject}</td>
                            <td className="py-3 px-4 text-red-600 dark:text-red-400 font-semibold">{s.original?.name || '—'}</td>
                            <td className="py-3 px-4 text-emerald-700 dark:text-emerald-400 font-semibold">{s.substitute?.name || 'Open Cover / Volunteer'}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${
                                  effStatus === 'completed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-150 dark:border-emerald-500/20' :
                                  effStatus === 'accepted' ? 'bg-blue-50 text-blue-750 dark:bg-blue-500/20 dark:text-blue-400 border-blue-150 dark:border-blue-500/20' :
                                  effStatus === 'cancelled' ? 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-150 dark:border-red-500/20' :
                                  effStatus === 'expired' ? 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-150 dark:border-red-500/20' :
                                  effStatus === 'no_teacher_available' ? 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-150 dark:border-red-500/20' :
                                  'bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border-amber-150 dark:border-amber-500/20'
                                }`}>
                                  {effStatus === 'no_teacher_available' ? 'No Teacher Available' : effStatus === 'expired' ? 'Not Accepted' : effStatus}
                                </span>
                                <StatusHelpIcon status={effStatus} />
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                {s.assigned_by === 'auto' ? <Zap size={11} className="text-indigo-400" /> : null}
                                {s.assigned_by}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: AbsentPeriodRow (Renders coverage picker and volunteers)
// ─────────────────────────────────────────────────────────────────────────────
function AbsentPeriodRow({
  period, existing, availableFreeTeachers, availableAllTeachers,
  isAdmin, today, onAssign, onBroadcast, onApproveVolunteer, onRejectVolunteer,
  allTeachers
}) {
  const [selectedSub, setSelectedSub] = useState('');
  const [assigning, setAssigning] = useState(false);

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

  const endTime = parsePeriodEndTimeIST(period.period_label, today);
  const isExpired = endTime && getISTNow().getTime() > endTime.getTime();
  const isOverdue = startTime && minutesPassed >= 5 && !existing && !isExpired;
  const hasAnyCandidates = availableFreeTeachers.length > 0 || availableAllTeachers.length > 0;
  
  const effStatus = existing ? getEffectiveSubStatus(existing) : null;

  const handleAssign = async () => {
    if (!selectedSub) return;
    setAssigning(true);
    await onAssign(selectedSub);
    setAssigning(false);
    setSelectedSub('');
  };

  // Find main and substitute teacher objects from allTeachers array
  const mainTeacherProfile = allTeachers?.find(t => t.id === period.teacher_id_resolved);
  const subTeacherProfile = existing?.substitute_teacher_id
    ? allTeachers?.find(t => t.id === existing.substitute_teacher_id)
    : null;

  const renderStatusBadge = (statusValue) => {
    let badgeClass = "";
    let labelText = statusValue;

    if (statusValue === 'accepted') {
      badgeClass = "bg-blue-50 dark:bg-blue-950/40 text-blue-750 dark:text-blue-400 border border-blue-150 dark:border-blue-900/30";
      labelText = "✓ Accepted";
    } else if (statusValue === 'completed') {
      badgeClass = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-900/30";
      labelText = "✓ Completed";
    } else if (statusValue === 'expired') {
      badgeClass = "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-150 dark:border-red-900/30";
      labelText = "🛑 Not Accepted";
    } else if (statusValue === 'no_teacher_available') {
      badgeClass = "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-150 dark:border-red-900/30";
      labelText = "🛑 No Teacher Available";
    } else if (statusValue === 'class_over') {
      badgeClass = "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-450 border border-slate-200 dark:border-slate-700/50";
      labelText = "⌛ Class Over";
    } else if (statusValue === 'overdue') {
      badgeClass = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-150 dark:border-amber-900/30";
      labelText = `⌛ Overdue by ${Math.floor(minutesPassed)}m`;
    } else if (statusValue === 'no_substitute_available') {
      badgeClass = "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-150 dark:border-red-900/30";
      labelText = "🛑 No Substitute";
    } else {
      badgeClass = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-150 dark:border-amber-900/30";
      labelText = "⌛ Pending";
    }

    return (
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider flex items-center gap-1.5 ${badgeClass}`}>
        {labelText}
        <StatusHelpIcon status={statusValue} />
      </span>
    );
  };

  return (
    <div className="rounded-[2rem] border p-5 transition-all bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {existing ? (
          <>
            {/* Column 1: Main Teacher */}
            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Main Teacher:</span>
              <div className="flex items-center gap-3">
                <UserAvatar user={mainTeacherProfile || { name: period.teacher_name }} size="md" />
                <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">{period.teacher_name}</span>
              </div>
            </div>

            {/* Column 2: Substituting */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Substituting:</span>
                {renderStatusBadge(effStatus)}
              </div>
              <div className="flex items-center gap-3">
                <UserAvatar user={subTeacherProfile || { name: existing.substitute?.name || 'Broadcast Cover' }} size="md" />
                <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">
                  {existing.substitute_teacher_id ? (existing.substitute?.name || 'Assigned Teacher') : 'Broadcast Cover'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Column 1: Teacher */}
            <div className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Teacher:</span>
              <div className="flex items-center gap-3">
                <UserAvatar user={mainTeacherProfile || { name: period.teacher_name }} size="md" />
                <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight">{period.teacher_name}</span>
              </div>
            </div>

            {/* Column 2: Details / Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Details:</span>
                {isExpired ? renderStatusBadge('class_over') :
                 (isOverdue && !hasAnyCandidates) ? renderStatusBadge('no_substitute_available') :
                 (isOverdue && hasAnyCandidates) ? renderStatusBadge('overdue') :
                 renderStatusBadge('pending')}
              </div>
              <div className="font-extrabold text-slate-700 dark:text-slate-200 text-sm tracking-tight pt-1">
                Class {period.class}, {period.subject}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Details bottom bar (only if existing is true) */}
      {existing && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Details:</span>
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-250">Class {period.class}, {period.subject}</span>
          </div>
          {/* Quick candidates indicator for admin */}
          {isAdmin && !existing.substitute_teacher_id && availableFreeTeachers.length > 0 && (
            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/20 px-2 py-0.5 rounded">
              {availableFreeTeachers.length} free volunteers
            </span>
          )}
        </div>
      )}

      {/* Render volunteers if it is an open cover/broadcast substitution */}
      {existing && existing.substitute_teacher_id === null && effStatus === 'pending' && (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-white/5 space-y-2">
          <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Cover Volunteers:</div>
          {existing.volunteers && existing.volunteers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {existing.volunteers.map(v => (
                <div key={v.teacher_id} className="flex items-center justify-between bg-white dark:bg-white/5 p-2 rounded-lg border border-slate-200 dark:border-white/5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{v.teacher_name}</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onApproveVolunteer(existing.id, v.teacher_id, v.teacher_name)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-50 text-white font-black text-[10px] uppercase rounded-md transition-colors border-0 cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onRejectVolunteer(existing.id, v.teacher_id)}
                      className="px-2.5 py-1 bg-red-600/80 hover:bg-red-500 text-white font-black text-[10px] uppercase rounded-md transition-colors border-0 cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">No volunteers yet. Open for cover.</div>
          )}
        </div>
      )}

      {/* Admin assignment controls */}
      {isAdmin && !existing && !isExpired && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-150 dark:border-slate-800/80 flex-wrap">
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
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 border-0 cursor-pointer"
          >
            {assigning ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
            Assign
          </button>
          <button
            onClick={onBroadcast}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-250 text-xs font-black uppercase tracking-widest rounded-xl transition-colors border border-slate-200 dark:border-slate-750 cursor-pointer"
          >
            <Clock size={12} />
            Broadcast
          </button>
        </div>
      )}
    </div>
  );
}// Sub-component: FreePeriodDeclaration (Teacher only)
// ─────────────────────────────────────────────────────────────────────────────
function FreePeriodDeclaration({ schoolId, teacherId, todayDay, today, freePeriods, onRefresh, showToast }) {
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    async function fetchMySlots() {
      setLoading(true);
      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', teacherId)
        .single();
      const teacherName = profile?.name || '';
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
        <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Declare Free Periods (Today)</h4>
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
                  ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
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
