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
import SuperAdminLayout from './layouts/SuperAdminLayout';

// Features Integration
import SuperAdminDashboard from './features/super_admin/SuperAdminDashboard';

// Features Integration
import AdminDashboard from './features/dashboard/AdminDashboard';
import TeacherDashboard from './features/dashboard/TeacherDashboard';
import StudentDashboard from './features/dashboard/StudentDashboard';
import DigitalIdCard from './features/dashboard/DigitalIdCard';
import AdminSettings from './features/settings/AdminSettings';

import MarkAttendance from './features/attendance/MarkAttendance';
import UserManagement from './features/users/UserManagement';
import StudentAttendanceChart from './features/attendance/StudentAttendanceChart';

import AdminFeeManager from './features/fees/AdminFeeManager';
import StudentFeeLedger from './features/fees/StudentFeeLedger';

import NoticeManager from './features/notices/NoticeManager';
import NoticeBoard from './features/notices/NoticeBoard';

import TimetableManager from './features/timetable/TimetableManager';
import TimetableViewer from './features/timetable/TimetableViewer';
import LeavesManager from './features/leaves/LeavesManager';
import GalleryManager from './features/gallery/GalleryManager';
import DashboardHero from './components/DashboardHero';

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
      <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-800">
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
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="attendance" element={<MarkAttendance />} />
          <Route path="fees" element={<AdminFeeManager />} />
          <Route path="timetable" element={<TimetableManager />} />
          <Route path="notices" element={<NoticeManager />} />
          <Route path="events" element={<div className="p-6 bg-white border border-border rounded-xl">Calendar Events Coming Soon...</div>} />
          <Route path="leaves" element={<LeavesManager />} />
          <Route path="gallery" element={<GalleryManager />} />
          <Route path="reports" element={<div className="p-6 bg-white border border-border rounded-xl">Reports Coming Soon...</div>} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>

      {/* ──────────────── TEACHER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<TeacherDashboard />} />
          <Route path="attendance" element={<MarkAttendance />} />
          <Route path="timetable" element={<TimetableViewer />} />
          <Route path="notices" element={<NoticeManager />} />
          <Route path="events" element={<div className="p-6 bg-white border border-border rounded-xl">Events View</div>} />
          <Route path="leaves" element={<LeavesManager />} />
          <Route path="profile" element={<div className="p-6 bg-white border border-border rounded-xl">My Profile Config</div>} />
        </Route>
      </Route>

      {/* ──────────────── STUDENT ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="attendance" element={<div className="p-6 bg-white border border-border rounded-xl">My Attendance Record</div>} />
          <Route path="fees" element={<StudentFeeLedger />} />
          <Route path="timetable" element={<TimetableViewer />} />
          <Route path="notices" element={<NoticeBoard />} />
          <Route path="events" element={<div className="p-6 bg-white border border-border rounded-xl">Events View</div>} />
          <Route path="gallery" element={<GalleryManager />} />
          <Route path="profile" element={<div className="p-6 bg-white border border-border rounded-xl">My Profile Config</div>} />
        </Route>
      </Route>

      {/* ──────────────── SUPER ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
        <Route path="/super-admin" element={<SuperAdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdminDashboard />} />
        </Route>
      </Route>

      <Route path="*" element={user ? <Navigate to={`/${role}`} replace /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
