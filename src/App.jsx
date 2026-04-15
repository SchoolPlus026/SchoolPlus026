import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { supabase } from './config/supabaseClient';

// Core Flow Components
import Login from './features/auth/Login';
import ProtectedRoute from './components/ProtectedRoute';

// Layout Wrappers
import AdminLayout from './layouts/AdminLayout';
import TeacherLayout from './layouts/TeacherLayout';
import StudentLayout from './layouts/StudentLayout';

// Features (Phase 7 - Attendance)
import MarkAttendance from './features/attendance/MarkAttendance';
import StudentAttendanceChart from './features/attendance/StudentAttendanceChart';

// Features (Phase 8 - Fees)
import AdminFeeManager from './features/fees/AdminFeeManager';
import StudentFeeLedger from './features/fees/StudentFeeLedger';

// Features (Phase 9 - Broadcast Notices)
import NoticeManager from './features/notices/NoticeManager';
import NoticeBoard from './features/notices/NoticeBoard';

// Features (Phase 10 - Timetable Engine)
import TimetableManager from './features/timetable/TimetableManager';
import TimetableViewer from './features/timetable/TimetableViewer';

export default function App() {
  const { user, role, setSchoolSettings, setUserAndRole } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    async function initializeApp() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase.from('users').select('role, school_id').eq('id', session.user.id).single();
          if (profile) {
            const { data: settings } = await supabase.from('school_settings').select('*').eq('school_id', profile.school_id).single();
            if (settings && settings.subscription_status !== 'Expired') {
              setSchoolSettings(settings);
              setUserAndRole(session.user, profile.role);
            } else {
              await supabase.auth.signOut();
            }
          }
        }
      } catch (error) {
        console.error("Initialization sync error:", error);
      } finally {
        setIsInitializing(false);
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') useAppStore.getState().clearSession();
    });

    initializeApp();
    return () => authListener.subscription.unsubscribe();
  }, [setSchoolSettings, setUserAndRole]);

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-white">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-t-[3px] border-primary animate-spin mb-4"></div>
          <p className="text-muted tracking-wide text-sm font-medium">Authenticating Workspace Session...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={`/${role}`} replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={user ? <Navigate to={`/${role}`} replace /> : <Login />} />
      
      {/* ──────────────── ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Admin Dashboard Widget</div>} />
          <Route path="users" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Users Management</div>} />
          <Route path="attendance" element={<MarkAttendance />} />
          <Route path="fees" element={<AdminFeeManager />} />
          <Route path="timetable" element={<TimetableManager />} />
          <Route path="notices" element={<NoticeManager />} />
          <Route path="events" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Calendar Events</div>} />
          <Route path="settings" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Admin SaaS Settings</div>} />
        </Route>
      </Route>

      {/* ──────────────── TEACHER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Teacher Dashboard Widget</div>} />
          <Route path="attendance" element={<MarkAttendance />} />
          <Route path="timetable" element={<TimetableViewer />} />
          <Route path="notices" element={<NoticeManager />} />
          <Route path="events" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Events View</div>} />
          <Route path="profile" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">My Profile Config</div>} />
        </Route>
      </Route>

      {/* ──────────────── STUDENT ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<StudentAttendanceChart />} />
          <Route path="attendance" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">My Attendance Record</div>} />
          <Route path="fees" element={<StudentFeeLedger />} />
          <Route path="timetable" element={<TimetableViewer />} />
          <Route path="notices" element={<NoticeBoard />} />
          <Route path="events" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">Events View</div>} />
          <Route path="profile" element={<div className="font-bold text-xl uppercase tracking-wider text-slate-300">My Profile Config</div>} />
        </Route>
      </Route>

      <Route path="*" element={user ? <Navigate to={`/${role}`} replace /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
