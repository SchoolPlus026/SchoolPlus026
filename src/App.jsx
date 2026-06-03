import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { X, Lock, Loader2 } from 'lucide-react';
import { ToastProvider } from './components/ToastProvider';
import { useAppStore } from './store/useAppStore';
import { supabase } from './config/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

// Core Flow Components
import Login from './features/auth/Login';
import RegisterSchool from './features/auth/RegisterSchool';
import ResetPassword from './features/auth/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
import NotificationProvider from './components/NotificationProvider';
import VersionChecker from './components/VersionChecker';
import GlobalUploadToasts from './components/GlobalUploadToasts';
import EmergencyOverlay from './components/EmergencyOverlay';
import HelpButton from './components/HelpButton';

// Layout Wrappers
import AdminLayout from './layouts/AdminLayout';
import TeacherLayout from './layouts/TeacherLayout';
import StudentLayout from './layouts/StudentLayout';
import PlatformAdminLayout from './layouts/PlatformAdminLayout';
import DriverLayout from './layouts/DriverLayout';
import StaffLayout from './layouts/StaffLayout';

import PlatformAdminDashboard from './features/super_admin/PlatformAdminDashboard';

// Dashboards
import AdminDashboard from './features/dashboard/AdminDashboard';
import TeacherDashboard from './features/dashboard/TeacherDashboard';
import StudentDashboard from './features/dashboard/StudentDashboard';
import StaffDashboard from './features/dashboard/StaffDashboard';

// Settings
import AdminSettings from './features/settings/AdminSettings';
import SharedSettings from './features/settings/SharedSettings';

// Attendance
import MarkAttendance from './features/attendance/MarkAttendance';
import TeacherAttendanceView from './features/attendance/TeacherAttendanceView';
import StudentAttendanceChart from './features/attendance/StudentAttendanceChart';

// Users / Profile
import UserManagement from './features/users/UserManagement';
import UserProfile from './features/profile/UserProfile';

// Fees
import AdminFeeManager from './features/fees/AdminFeeManager';
import StudentFeeLedger from './features/fees/StudentFeeLedger';
import TeacherFeeReminder from './features/fees/TeacherFeeReminder';

// Notices
import NoticeManager from './features/notices/NoticeManager';
import NoticeBoard from './features/notices/NoticeBoard';

// Timetable
import TimetableManager from './features/timetable/TimetableManager';
import TimetableViewer from './features/timetable/TimetableViewer';

// Other modules
import LeavesManager from './features/leaves/LeavesManager';
import EmergencyManager from './features/emergency/EmergencyManager';
import GalleryManager from './features/gallery/GalleryManager';
import Reports from './features/reports/Reports';
import OffClasses from './features/off-classes/OffClasses';
import ExecutiveBriefingPage from './pages/ExecutiveBriefingPage';
import StaffPendingDutyPage from './pages/StaffPendingDutyPage';
import DriverDashboard from './features/dashboard/DriverDashboard';
import Contact from './features/contact/Contact';
import ComplaintBox from './features/principals_desk/PrincipalsDesk';
import ManageModules from './features/manage_modules/ManageModules';
import SyllabusTracker from './features/syllabus/SyllabusTracker';
import LostAndFound from './features/lost_found/LostAndFound';
import BusAlerts from './features/bus_alerts/BusAlerts';
import AdminBusMonitor from './features/bus_alerts/AdminBusMonitor';
import LiveBusTracker from './features/bus_alerts/LiveBusTracker';
import MoodNote from './features/mood_note/MoodNote';

// Calendar Events
import CalendarEvents from './features/calendar/CalendarEvents';

// Help
import KnowledgeBase from './features/knowledge-base/KnowledgeBase';

// Achievers Board
import AchieversBoard from './features/achievers/AchieversBoard';

// Subscription / Billing
import ManageSubscription from './features/billing/ManageSubscription';
import FeatureGuard from './components/FeatureGuard';

export default function App() {
  const { user, role, setSchoolSettings, setUserAndRole } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(!user);
  const location = useLocation();

  useEffect(() => {
    async function initializeApp() {
      try {
        // Early cleanup of old insecure credentials in localStorage to prevent state mismatch
        let migrated = false;
        try {
          const keys = Object.keys(localStorage);
          for (let key of keys) {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
              localStorage.removeItem(key);
              migrated = true;
            }
          }
        } catch (e) {
          console.warn('Migration cleanup error:', e);
        }

        if (migrated) {
          useAppStore.getState().clearSession();
        }

        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          useAppStore.getState().clearSession();
          setIsInitializing(false);
          return;
        }

        // Cache bypass check: if we already have a persistent user session and profile,
        // and it was fetched within the last 30 minutes, skip remote database queries to save egress.
        const store = useAppStore.getState();
        const cacheFresh = store.user && store.role && store.profileLastFetched && (Date.now() - store.profileLastFetched < 30 * 60 * 1000);

        if (cacheFresh && store.user.id === session.user.id) {
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
            .select('role, school_id, class, avatar_url, avatar_file_id, hide_avatar_from_class')
            .eq('id', session.user.id)
            .single();

          if (profileError || !profile) {
            // Can't read profile — sign out cleanly
            await supabase.auth.signOut();
            setIsInitializing(false);
            return;
          }

          // Merge profile fields (class, avatar, etc.) into the auth user object
          const enrichedUser = { 
            ...session.user, 
            class: profile.class || null,
            avatar_url: profile.avatar_url || null,
            avatar_file_id: profile.avatar_file_id || null,
            hide_avatar_from_class: !!profile.hide_avatar_from_class
          };

          // Platform Admin has no school — skip school settings lookup
          if (profile.role === 'platform_admin') {
            setSchoolSettings({ name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' });
            setUserAndRole(enrichedUser, profile.role);
            store.setProfileLastFetched(Date.now());
          } else {
            const { data: settings } = await supabase
              .from('school_settings')
              .select('*')
              .eq('school_id', profile.school_id)
              .single();

            if (settings) {
              setSchoolSettings(settings);
              setUserAndRole(enrichedUser, profile.role);
              store.setProfileLastFetched(Date.now());
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
    if (role === 'driver') return '/driver';
    if (role === 'staff') return '/staff';
    return `/${role}`;
  };

  return (
    <ToastProvider>
      {/* VersionChecker: runs once on launch for all native authenticated sessions.
          Renders null on web. Must be outside <Routes> so it isn't unmounted
          on route transitions. */}
      {user && <VersionChecker />}
      {user && <GlobalUploadToasts />}
      {user && <EmergencyOverlay />}
      {user && <HelpButton />}
      {user && <SyncPasswordResetModal />}
      {user && <GlobalAvatarPreviewModal />}

      <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
      <Route path="/" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Login />} />
      <Route path="/register" element={<RegisterSchool />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* ──────────────── ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<NotificationProvider><AdminLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"     element={<AdminDashboard />} />
          <Route path="manage-modules" element={<ManageModules />} />
          <Route path="users"         element={<UserManagement />} />
          <Route path="attendance"    element={<MarkAttendance />} />
          <Route path="fees"          element={<FeatureGuard feature="fees"><AdminFeeManager /></FeatureGuard>} />
          <Route path="calendar"      element={<CalendarEvents />} />
          <Route path="notices"       element={<NoticeManager />} />
          <Route path="gallery"       element={<GalleryManager />} />
          <Route path="timetable"     element={<FeatureGuard feature="timetable"><TimetableManager /></FeatureGuard>} />
          <Route path="off-classes"   element={<OffClasses />} />
          <Route path="leaves"        element={<FeatureGuard feature="leaves"><LeavesManager /></FeatureGuard>} />
          <Route path="reports"       element={<FeatureGuard feature="reports"><Reports /></FeatureGuard>} />
          <Route path="contact"       element={<Contact />} />
          <Route path="complaint-box" element={<ComplaintBox />} />
          <Route path="billing"       element={<ManageSubscription />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="settings"      element={<AdminSettings />} />
          <Route path="bus-alerts"    element={<AdminBusMonitor />} />
          <Route path="syllabus"      element={<SyllabusTracker />} />
          <Route path="lost-and-found" element={<FeatureGuard feature="lost_found"><LostAndFound /></FeatureGuard>} />
          <Route path="emergency"     element={<FeatureGuard feature="emergency"><EmergencyManager /></FeatureGuard>} />
          <Route path="achievers"     element={<AchieversBoard />} />
          <Route path="executive-briefing" element={<FeatureGuard feature="executive_briefing"><ExecutiveBriefingPage /></FeatureGuard>} />
          <Route path="staff-pending-duty" element={<FeatureGuard feature="duty_radar"><StaffPendingDutyPage /></FeatureGuard>} />
        </Route>
      </Route>

      {/* ──────────────── TEACHER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<NotificationProvider><TeacherLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"        element={<TeacherDashboard />} />
          <Route path="profile"          element={<UserProfile />} />
          <Route path="my-attendance"    element={<TeacherAttendanceView />} />
          <Route path="attendance"       element={<MarkAttendance />} />
          <Route path="users"            element={<UserManagement />} />
          <Route path="timetable"        element={<TimetableViewer />} />
          <Route path="off-classes"      element={<OffClasses />} />
          <Route path="notices"          element={<NoticeManager />} />
          <Route path="leaves"           element={<LeavesManager />} />
          <Route path="gallery"          element={<GalleryManager />} />
          <Route path="reports"          element={<Reports />} />
          <Route path="knowledge-base"   element={<KnowledgeBase />} />
          <Route path="contact"          element={<Contact />} />
          <Route path="complaint-box"    element={<ComplaintBox />} />
          <Route path="settings"         element={<SharedSettings />} />
          <Route path="syllabus"         element={<FeatureGuard feature="syllabus"><SyllabusTracker /></FeatureGuard>} />
          <Route path="lost-and-found"   element={<FeatureGuard feature="lost_found"><LostAndFound /></FeatureGuard>} />
          <Route path="mood-note"        element={<FeatureGuard feature="mood_note"><MoodNote /></FeatureGuard>} />
          <Route path="emergency"        element={<FeatureGuard feature="emergency"><EmergencyManager /></FeatureGuard>} />
          <Route path="bus-alerts"        element={<FeatureGuard feature="bus_alerts"><LiveBusTracker /></FeatureGuard>} />
          <Route path="achievers"        element={<AchieversBoard />} />
          <Route path="fees"             element={<TeacherFeeReminder />} />
        </Route>
      </Route>

      {/* ──────────────── STUDENT ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route path="/student" element={<NotificationProvider><StudentLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"   element={<StudentDashboard />} />
          <Route path="profile"     element={<UserProfile />} />
          <Route path="attendance"  element={<StudentAttendanceChart />} />
          <Route path="fees"        element={<StudentFeeLedger />} />
          <Route path="timetable"   element={<TimetableViewer />} />
          <Route path="notices"     element={<NoticeBoard />} />
          <Route path="leaves"      element={<LeavesManager />} />
          <Route path="gallery"     element={<GalleryManager />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="contact"     element={<Contact />} />
          <Route path="complaint-box" element={<ComplaintBox />} />
          <Route path="settings"    element={<SharedSettings />} />
          <Route path="syllabus"    element={<FeatureGuard feature="syllabus"><SyllabusTracker /></FeatureGuard>} />
          <Route path="lost-and-found" element={<FeatureGuard feature="lost_found"><LostAndFound /></FeatureGuard>} />
          <Route path="mood-note"   element={<FeatureGuard feature="mood_note"><MoodNote /></FeatureGuard>} />
          <Route path="bus-alerts"  element={<FeatureGuard feature="bus_alerts"><LiveBusTracker /></FeatureGuard>} />
          <Route path="achievers"   element={<AchieversBoard />} />
        </Route>
      </Route>

      {/* ──────────────── STAFF ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['staff']} />}>
        <Route path="/staff" element={<NotificationProvider><StaffLayout /></NotificationProvider>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"    element={<StaffDashboard />} />
          <Route path="profile"      element={<UserProfile />} />
          <Route path="notices"      element={<NoticeBoard />} />
          <Route path="leaves"       element={<LeavesManager />} />
          <Route path="gallery"      element={<GalleryManager />} />
          <Route path="contact"      element={<Contact />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="complaint-box" element={<ComplaintBox />} />
          <Route path="settings"     element={<SharedSettings />} />
        </Route>
      </Route>

      {/* ──────────────── DRIVER ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['driver']} />}>
        <Route path="/driver" element={<NotificationProvider><DriverLayout /></NotificationProvider>}>
          <Route index element={<DriverDashboard />} />
          <Route path="dashboard" element={<DriverDashboard />} />
          <Route path="bus-alerts" element={<BusAlerts />} />
          <Route path="lost-and-found" element={<LostAndFound />} />
          <Route path="emergency" element={<EmergencyManager />} />
          <Route path="gallery" element={<GalleryManager />} />
          <Route path="leaves" element={<LeavesManager />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="settings" element={<SharedSettings />} />
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
    </AnimatePresence>
    </ToastProvider>
  );
}

function SyncPasswordResetModal() {
  const [show, setShow] = useState(() => sessionStorage.getItem('show_sync_password_reset') === 'true');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  React.useEffect(() => {
    const handleSyncSuccess = () => {
      if (sessionStorage.getItem('show_sync_password_reset') === 'true') {
        setShow(true);
      }
    };
    window.addEventListener('sync_login_success', handleSyncSuccess);
    return () => window.removeEventListener('sync_login_success', handleSyncSuccess);
  }, []);

  React.useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  if (!show) return null;

  const handleClose = () => {
    sessionStorage.removeItem('show_sync_password_reset');
    setShow(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;

      setSuccess('Password updated successfully!');
      sessionStorage.removeItem('show_sync_password_reset');
      setTimeout(() => {
        setShow(false);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div className="card w-full max-w-md relative border border-white/10" style={{ background: 'var(--bg-card)' }}>
        <button onClick={handleClose} style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer'
        }}>
          <X size={20} />
        </button>

        <div className="settings-header" style={{ marginBottom: '20px' }}>
          <div className="icon-box" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <Lock size={20} />
          </div>
          <div className="text-content">
            <h4>Update Your Password (Optional)</h4>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              You have logged in using a sync code. Would you like to update your account password now?
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-semibold">
            {success}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="sp-input"
              placeholder="Min 6 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="sp-input"
              placeholder="Repeat new password"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleClose} className="btn ghost flex-1 text-slate-400">
              Skip
            </button>
            <button type="submit" disabled={loading} className="btn accent flex-1">
              {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GlobalAvatarPreviewModal() {
  const { previewAvatarUrl, setPreviewAvatarUrl } = useAppStore();

  useEffect(() => {
    if (previewAvatarUrl) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [previewAvatarUrl]);

  if (!previewAvatarUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200 cursor-pointer"
      onClick={() => setPreviewAvatarUrl(null)}
    >
      <button 
        onClick={() => setPreviewAvatarUrl(null)}
        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-md"
      >
        <X size={24} />
      </button>

      <div 
        className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <img 
          src={previewAvatarUrl} 
          alt="Avatar Preview" 
          className="max-w-full max-h-[85vh] object-contain block rounded-2xl"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
