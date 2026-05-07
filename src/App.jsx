import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { supabase } from './config/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

// Core Flow Components
import Login from './features/auth/Login';
import RegisterSchool from './features/auth/RegisterSchool';
import ProtectedRoute from './components/ProtectedRoute';
import NotificationProvider from './components/NotificationProvider';
import VersionChecker from './components/VersionChecker';
import GlobalUploadToasts from './components/GlobalUploadToasts';

// Layout Wrappers
import AdminLayout from './layouts/AdminLayout';
import TeacherLayout from './layouts/TeacherLayout';
import StudentLayout from './layouts/StudentLayout';
import PlatformAdminLayout from './layouts/PlatformAdminLayout';

import PlatformAdminDashboard from './features/super_admin/PlatformAdminDashboard';

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

// Knowledge Base
import KnowledgeBase from './features/knowledge-base/KnowledgeBase';

// Subscription / Billing
import ManageSubscription from './features/billing/ManageSubscription';
import FeatureGuard from './components/FeatureGuard';

export default function App() {
  const { user, role, setSchoolSettings, setUserAndRole } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(!user);

  useEffect(() => {
    async function initializeApp() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          useAppStore.getState().clearSession();
          setIsInitializing(false);
          return;
        }

        // If we already have the user in Zustand cache, we unblock the UI instantly 
        // and let the rest of the verification happen silently in the background.
        if (user) {
          setIsInitializing(false);
        }

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

          // Platform Admin has no school — skip school settings lookup
          if (profile.role === 'platform_admin') {
            setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
            setUserAndRole(session.user, profile.role);
          } else {
            const { data: settings } = await supabase
              .from('school_settings')
              .select('*')
              .eq('school_id', profile.school_id)
              .single();

            if (settings) {
              setSchoolSettings(settings);
              setUserAndRole(session.user, profile.role);
            } else {
              // Sign out asynchronously without awaiting to prevent Capacitor freeze
              supabase.auth.signOut().catch(console.error);
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
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: 'var(--bg-main)', color: 'var(--text-muted)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '16px',
            border: '3px solid rgba(79,70,229,0.3)',
            borderTopColor: '#4f46e5',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{
            fontSize: '11px', color: 'var(--text-faint)',
            letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 800,
          }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Helper function for root redirects
  const getRoleRoute = (role) => {
    if (!role) return '/login';
    if (role === 'platform_admin') return '/platform-admin';
    return `/${role}`;
  };

  return (
    <>
      {/* VersionChecker: runs once on launch for all native authenticated sessions.
          Renders null on web. Must be outside <Routes> so it isn't unmounted
          on route transitions. */}
      {user && <VersionChecker />}
      {user && <GlobalUploadToasts />}

      <Routes>
      <Route path="/" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Login />} />
      <Route path="/register" element={<RegisterSchool />} />

      {/* ──────────────── ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<NotificationProvider><AdminLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<AdminDashboard />} />
          <Route path="users"       element={<UserManagement />} />
          <Route path="attendance"  element={<MarkAttendance />} />
          <Route path="fees"        element={<FeatureGuard feature="fees"><AdminFeeManager /></FeatureGuard>} />
          <Route path="calendar"    element={<CalendarEvents />} />
          <Route path="notices"     element={<NoticeManager />} />
          <Route path="gallery"     element={<GalleryManager />} />
          <Route path="timetable"   element={<FeatureGuard feature="timetable"><TimetableManager /></FeatureGuard>} />
          <Route path="off-classes" element={<OffClasses />} />
          <Route path="leaves"      element={<FeatureGuard feature="leaves"><LeavesManager /></FeatureGuard>} />
          <Route path="reports"     element={<FeatureGuard feature="reports"><Reports /></FeatureGuard>} />
          <Route path="contact"     element={<Contact />} />
          <Route path="billing"     element={<ManageSubscription />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="settings"    element={<AdminSettings />} />
        </Route>
      </Route>

      {/* ──────────────── TEACHER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<NotificationProvider><TeacherLayout /></NotificationProvider>}>
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
          <Route path="knowledge-base"   element={<KnowledgeBase />} />
          <Route path="contact"          element={<Contact />} />
          <Route path="settings"         element={<SharedSettings />} />
        </Route>
      </Route>

      {/* ──────────────── STUDENT ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student" element={<NotificationProvider><StudentLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"  element={<StudentDashboard />} />
          <Route path="profile"    element={<UserProfile />} />
          <Route path="attendance" element={<StudentAttendanceChart />} />
          <Route path="fees"       element={<StudentFeeLedger />} />
          <Route path="timetable"  element={<TimetableViewer />} />
          <Route path="notices"    element={<NoticeBoard />} />
          <Route path="leaves"     element={<LeavesManager />} />
          <Route path="gallery"    element={<GalleryManager />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="contact"    element={<Contact />} />
          <Route path="settings"   element={<SharedSettings />} />
        </Route>
      </Route>

      {/* ──────────────── PLATFORM ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['platform_admin']} />}>
        <Route path="/platform-admin" element={<NotificationProvider><PlatformAdminLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<PlatformAdminDashboard />} />
        </Route>
      </Route>

      <Route path="*" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />} />
    </Routes>
    </>
  );
}
