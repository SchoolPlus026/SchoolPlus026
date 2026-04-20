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
import AppManagerLayout from './layouts/AppManagerLayout';

// App Manager
import AppManagerDashboard from './features/super_admin/AppManagerDashboard';

// Dashboards
import AdminDashboard from './features/dashboard/AdminDashboard';
import TeacherDashboard from './features/dashboard/TeacherDashboard';
import StudentDashboard from './features/dashboard/StudentDashboard';

// Settings
import AdminSettings from './features/settings/AdminSettings';
import SharedSettings from './features/settings/SharedSettings';

// Attendance
import MarkAttendance from './features/attendance/MarkAttendance';
import TeacherSelfAttendance from './features/attendance/TeacherSelfAttendance';
import StudentAttendanceChart from './features/attendance/StudentAttendanceChart';

// Users / Profile
import UserManagement from './features/users/UserManagement';
import UserProfile from './features/profile/UserProfile';

// Fees
import AdminFeeManager from './features/fees/AdminFeeManager';
import StudentFeeLedger from './features/fees/StudentFeeLedger';

// Notices
import NoticeManager from './features/notices/NoticeManager';
import NoticeBoard from './features/notices/NoticeBoard';

// Timetable
import TimetableManager from './features/timetable/TimetableManager';
import TimetableViewer from './features/timetable/TimetableViewer';

// Other modules
import LeavesManager from './features/leaves/LeavesManager';
import GalleryManager from './features/gallery/GalleryManager';
import Reports from './features/reports/Reports';
import OffClasses from './features/off-classes/OffClasses';
import Contact from './features/contact/Contact';

// Calendar Events
import CalendarEvents from './features/calendar/CalendarEvents';

export default function App() {
  const { user, role, setSchoolSettings, setUserAndRole } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    async function initializeApp() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role, school_id')
            .eq('id', session.user.id)
            .single();

          if (profileError || !profile) {
            // Can't read profile — sign out cleanly
            await supabase.auth.signOut();
            setIsInitializing(false);
            return;
          }

          // App Manager has no school — skip school settings lookup
          if (profile.role === 'app_manager') {
            setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'MANAGER' });
            setUserAndRole(session.user, profile.role);
          } else {
            const { data: settings } = await supabase
              .from('school_settings')
              .select('*')
              .eq('school_id', profile.school_id)
              .single();

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
      <div className="flex items-center justify-center h-screen text-slate-300"
        style={{ background: 'linear-gradient(180deg, #0b1020 0%, #061233 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl border-2 border-indigo-500/50 border-t-indigo-400 animate-spin" />
          <p className="text-xs text-slate-500 tracking-[0.3em] uppercase font-bold">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Helper function for root redirects
  const getRoleRoute = (role) => {
    if (!role) return '/login';
    if (role === 'app_manager') return '/app-manager';
    return `/${role}`;
  };

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Login />} />

      {/* ──────────────── ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<AdminDashboard />} />
          <Route path="users"       element={<UserManagement />} />
          <Route path="attendance"  element={<MarkAttendance />} />
          <Route path="fees"        element={<AdminFeeManager />} />
          <Route path="calendar"    element={<CalendarEvents />} />
          <Route path="notices"     element={<NoticeManager />} />
          <Route path="gallery"     element={<GalleryManager />} />
          <Route path="timetable"   element={<TimetableManager />} />
          <Route path="off-classes" element={<OffClasses />} />
          <Route path="leaves"      element={<LeavesManager />} />
          <Route path="reports"     element={<Reports />} />
          <Route path="contact"     element={<Contact />} />
          <Route path="settings"    element={<AdminSettings />} />
        </Route>
      </Route>

      {/* ──────────────── TEACHER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"        element={<TeacherDashboard />} />
          <Route path="profile"          element={<UserProfile />} />
          <Route path="self-attendance"  element={<TeacherSelfAttendance />} />
          <Route path="attendance"       element={<MarkAttendance />} />
          <Route path="timetable"        element={<TimetableViewer />} />
          <Route path="off-classes"      element={<OffClasses />} />
          <Route path="notices"          element={<NoticeManager />} />
          <Route path="leaves"           element={<LeavesManager />} />
          <Route path="gallery"          element={<GalleryManager />} />
          <Route path="reports"          element={<Reports />} />
          <Route path="contact"          element={<Contact />} />
          <Route path="settings"         element={<SharedSettings />} />
        </Route>
      </Route>

      {/* ──────────────── STUDENT ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"  element={<StudentDashboard />} />
          <Route path="profile"    element={<UserProfile />} />
          <Route path="attendance" element={<StudentAttendanceChart />} />
          <Route path="fees"       element={<StudentFeeLedger />} />
          <Route path="timetable"  element={<TimetableViewer />} />
          <Route path="notices"    element={<NoticeBoard />} />
          <Route path="leaves"     element={<LeavesManager />} />
          <Route path="gallery"    element={<GalleryManager />} />
          <Route path="contact"    element={<Contact />} />
          <Route path="settings"   element={<SharedSettings />} />
        </Route>
      </Route>

      {/* ──────────────── APP MANAGER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['app_manager']} />}>
        <Route path="/app-manager" element={<AppManagerLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AppManagerDashboard />} />
        </Route>
      </Route>

      <Route path="*" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
