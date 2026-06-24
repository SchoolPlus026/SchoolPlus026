import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Lock, Loader2, Eye, EyeOff, WifiOff } from 'lucide-react';
import { ToastProvider } from './components/ToastProvider';
import { useAppStore } from './store/useAppStore';
import { supabase } from './config/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

// Core Flow Components
import Login from './features/auth/Login';
import RegisterSchool from './features/auth/RegisterSchool';
import ResetPassword from './features/auth/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
import NotificationProvider from './components/NotificationProvider';
import VersionChecker from './components/VersionChecker';
import PwaInstallBanner from './components/PwaInstallBanner';
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
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [swUpdateReg, setSwUpdateReg] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleSWUpdate = (e) => {
      console.log('[PWA] SW Update event received:', e.detail);
      setSwUpdateReg(e.detail);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sw-update-available', handleSWUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-update-available', handleSWUpdate);
    };
  }, []);

  useEffect(() => {
    // Check if URL hash or search params indicate a password recovery redirect
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=') && hash.includes('type=recovery')) {
      localStorage.setItem('show_sync_password_reset', 'true');
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('type') === 'recovery') {
      localStorage.setItem('show_sync_password_reset', 'true');
    }

    async function initializeApp() {
      try {


        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Clean URL from auth tokens to prevent duplicate processing on refresh
          const url = new URL(window.location.href);
          let URLChanged = false;
          if (url.searchParams.has('code')) {
            url.searchParams.delete('code');
            URLChanged = true;
          }
          if (url.hash && (url.hash.includes('access_token=') || url.hash.includes('type='))) {
            url.hash = '';
            URLChanged = true;
          }
          if (URLChanged) {
            window.history.replaceState(null, '', url.pathname + url.search + url.hash);
          }
        } else {
          useAppStore.getState().clearSession();
          setIsInitializing(false);
          return;
        }

        // Cache bypass check: if we already have a persistent user session and profile,
        // and it is within the dynamic cache window hours, skip remote database queries to save egress.
        const store = useAppStore.getState();

        // Fetch/refresh platform settings if they are older than 1 hour or missing
        const isPlatformSettingsFresh = store.platformSettings && store.platformSettingsLastFetched && (Date.now() - store.platformSettingsLastFetched < 60 * 60 * 1000);
        let platSettings = store.platformSettings;

        if (!isPlatformSettingsFresh) {
          try {
            const { data } = await supabase
              .from('platform_settings')
              .select('free_tier_refresh_cooldown, premium_tier_refresh_cooldown, night_mode_enabled, night_start_time, night_end_time, free_tier_cache_hours, premium_tier_cache_hours')
              .single();
            if (data) {
              platSettings = data;
              store.setPlatformSettings(data);
              store.setPlatformSettingsLastFetched(Date.now());
            }
          } catch (platErr) {
            console.warn('Failed to fetch platform optimization settings:', platErr.message);
          }
        }

        const isFree = store.schoolSettings?.subscription_tier === 'Free' || store.schoolSettings?.plan_type === 'free' || !store.schoolSettings?.subscription_tier;
        const cacheHours = isFree 
          ? (platSettings?.free_tier_cache_hours ?? 6)
          : (platSettings?.premium_tier_cache_hours ?? 1);
        const cacheFresh = store.user && store.role && store.profileLastFetched && (Date.now() - store.profileLastFetched < cacheHours * 60 * 60 * 1000);

        if (cacheFresh && store.user.id === session.user.id && store.schoolSettings?.school_id) {
          try {
            const { data: verData } = await supabase
              .from('school_settings')
              .select('data_version')
              .eq('school_id', store.schoolSettings.school_id)
              .maybeSingle();

            if (verData && verData.data_version === store.schoolSettings.data_version) {
              setIsInitializing(false);
              return;
            }
          } catch (err) {
            console.warn('Failed to verify data version stamp:', err.message);
          }
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
              const isFreeSchool = settings.plan_type === 'free';
              const isStudent = profile.role === 'student';
              if (isFreeSchool && isStudent) {
                await supabase.auth.signOut();
                store.clearSession();
                alert("🚫 Google Login / Email Password Reset is not supported for students in Free schools. Please use your local credentials.");
                setIsInitializing(false);
                return;
              }
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


    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        useAppStore.getState().clearSession();
      } else if (event === 'PASSWORD_RECOVERY') {
        localStorage.setItem('show_sync_password_reset', 'true');
        window.dispatchEvent(new Event('sync_login_success'));
      } else if (event === 'USER_UPDATED' && session?.user) {
        // Email/identity change confirmed — refresh the cached user object so
        // the new email is reflected in the UI without requiring a full re-login.
        const store = useAppStore.getState();
        const currentRole = store.role;
        const currentUser = store.user;
        store.setUserAndRole({
          ...session.user,
          class: currentUser?.class || null,
          avatar_url: currentUser?.avatar_url || null,
          avatar_file_id: currentUser?.avatar_file_id || null,
          hide_avatar_from_class: !!currentUser?.hide_avatar_from_class
        }, currentRole);
        store.setProfileLastFetched(null); // force fresh re-fetch next init
      }
    });

    let appUrlListener = null;
    if (Capacitor.isNativePlatform()) {
      appUrlListener = CapacitorApp.addListener('appUrlOpen', async (data) => {
        try {
          console.log('[Deep Link] Received URL:', data.url);
          const url = new URL(data.url);
          if (url.protocol === 'schoolosplus:' || data.url.startsWith('schoolosplus://')) {
            let sessionEstablished = false;

            // ── Path A: PKCE flow — Supabase sends ?code=... as a query param ──
            const code = url.searchParams.get('code');
            if (code) {
              console.log('[Deep Link] PKCE code detected, exchanging for session...');
              const { error: codeErr } = await supabase.auth.exchangeCodeForSession(data.url);
              if (codeErr) {
                console.error('[Deep Link] exchangeCodeForSession failed:', codeErr.message);
              } else {
                sessionEstablished = true;
              }
            }

            // ── Path B: Implicit flow — Supabase sends #access_token=... in hash ──
            if (!sessionEstablished) {
              const hashStr = url.hash || (data.url.includes('#') ? '#' + data.url.split('#')[1] : '');
              const params = new URLSearchParams(hashStr.startsWith('#') ? hashStr.substring(1) : hashStr);
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');

              if (accessToken) {
                const type = params.get('type');
                if (type === 'recovery') {
                  localStorage.setItem('show_sync_password_reset', 'true');
                  window.dispatchEvent(new Event('sync_login_success'));
                }
                const { error: sessionErr } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || ''
                });
                if (sessionErr) {
                  console.error('[Deep Link] setSession failed:', sessionErr.message);
                } else {
                  sessionEstablished = true;
                }
              }
            }

            if (sessionEstablished) {
              // Clear the profile cache so next initializeApp always fetches fresh data
              useAppStore.getState().setProfileLastFetched(null);
              try {
                await Browser.close();
              } catch (bErr) {
                console.warn('[Deep Link] Failed to close browser tab:', bErr.message);
              }
              window.location.reload();
            } else {
              console.warn('[Deep Link] No auth tokens found in URL:', data.url);
              try {
                await Browser.close();
              } catch (bErr) {}
            }
          }
        } catch (err) {
          console.error('[Deep Link] Error handling URL:', err);
        }
      });
    }

    initializeApp();
    return () => {
      authListener.subscription.unsubscribe();
      if (appUrlListener) {
        appUrlListener.then(l => l.remove());
      }
    };
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
      <PwaInstallBanner />

      {/* Premium PWA Upgrade: SW Update Banner */}
      <AnimatePresence>
        {swUpdateReg && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            style={{
              position: 'fixed',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10002,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'between',
              gap: '24px',
              padding: '12px 20px',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(12px)',
              width: '90%',
              maxWidth: '400px',
              color: '#e2e8f0',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>Update Available 🚀</span>
              <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>A new version of SchoolOS+ is ready. Refresh now to apply.</span>
            </div>
            <button
              onClick={() => {
                if (swUpdateReg.waiting) {
                  swUpdateReg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                window.location.reload();
              }}
              style={{
                padding: '8px 14px',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(99,102,241,0.2)'
              }}
            >
              Refresh
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium PWA Upgrade: Offline Status Indicator */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              zIndex: 10001,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: 'rgba(127, 29, 29, 0.95)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(12px)',
              color: '#fee2e2',
              maxWidth: '320px',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            <WifiOff size={18} style={{ color: '#f87171', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fef2f2' }}>Offline Mode</span>
              <span style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px', lineHeight: 1.3 }}>Connection lost. Operating on cached local data.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* VersionChecker: runs once on launch for all native authenticated sessions.
          Renders null on web. Must be outside <Routes> so it isn't unmounted
          on route transitions. */}
      {user && <VersionChecker />}
      {user && <GlobalUploadToasts />}
      {user && <EmergencyOverlay />}
      {user && <HelpButton />}
      {user && <SyncPasswordResetModal />}
      {user && <GlobalAvatarPreviewModal />}
      {user && <GoogleRecoveryNudgeModal />}

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
          <Route path="calendar"         element={<CalendarEvents />} />
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
          <Route path="calendar"    element={<CalendarEvents />} />
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
          <Route path="calendar"     element={<CalendarEvents />} />
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
  const [show, setShow] = useState(() => localStorage.getItem('show_sync_password_reset') === 'true');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const location = useLocation();

  React.useEffect(() => {
    const handleSyncSuccess = () => {
      if (localStorage.getItem('show_sync_password_reset') === 'true') {
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

  if (location.pathname === '/reset-password') return null;
  if (!show) return null;

  const handleClose = () => {
    localStorage.removeItem('show_sync_password_reset');
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
      localStorage.removeItem('show_sync_password_reset');
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
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPwd ? "text" : "password"}
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="sp-input block w-full"
                style={{ paddingRight: '40px' }}
                placeholder="Min 6 characters"
              />
              <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                 {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPwd ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="sp-input block w-full"
                style={{ paddingRight: '40px' }}
                placeholder="Repeat new password"
              />
              <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                 {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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

function GoogleRecoveryNudgeModal() {
  const { user, schoolSettings } = useAppStore();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // Check if school is free or not loaded yet
    const isFree = schoolSettings?.subscription_tier === 'Free' || schoolSettings?.plan_type === 'free';
    if (isFree) return; // Only for paid/trial plans, not free schools

    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('google_link_nudge_dismissed_' + user.id) === 'true';
    if (isDismissed) return;

    // Fetch fresh user data to verify Google identity status
    supabase.auth.getUser().then(({ data: { user: freshUser } }) => {
      if (freshUser) {
        const isGoogleConnected = freshUser.identities?.some(id => id.provider === 'google');
        if (!isGoogleConnected) {
          setShow(true);
        }
      }
    });
  }, [user, schoolSettings]);

  if (!show) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('google_link_nudge_dismissed_' + user.id, 'true');
    setShow(false);
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const redirectUrl = Capacitor.isNativePlatform() 
        ? 'schoolosplus://dashboard' 
        : `${window.location.origin}/dashboard`;

      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) throw error;
    } catch (err) {
      if (err.message && err.message.includes('Manual linking is disabled')) {
        alert('Manual identity linking is disabled in your Supabase project configuration.');
      } else {
        alert(`Linking Google failed: ${err.message}`);
      }
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
      <div className="card w-full max-w-md relative border border-white/10" style={{ background: 'var(--bg-card)', padding: '24px' }}>
        <button onClick={handleDismiss} style={{
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
          <div className="icon-box" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.59 5.59 0 0 1-2.42 3.7v3.08h3.92c2.28-2.1 3.55-5.19 3.55-8.63z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.92-3.08c-1.08.73-2.48 1.17-4.04 1.17-3.11 0-5.74-2.11-6.68-4.96H1.21v3.18C3.18 21.88 7.31 24 12 24z" />
              <path fill="#FBBC05" d="M5.32 14.22A7.16 7.16 0 0 1 4.9 12c0-.79.13-1.57.41-2.22V6.6H1.21A11.94 11.94 0 0 0 0 12c0 2.22.6 4.3 1.66 6.1l3.66-2.88z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.18 2.12 1.21 6.6l4.11 3.18c.94-2.85 3.57-4.96 6.68-4.96z" />
            </svg>
          </div>
          <div className="text-content" style={{ marginTop: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Link Your Google Account</h4>
            <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Connect your Google account now for lightning-fast 1-click logins and secure password recovery.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button type="button" onClick={handleDismiss} className="btn ghost flex-1 text-slate-400" style={{ fontWeight: 600 }}>
            Maybe Later
          </button>
          <button type="button" onClick={handleConnect} disabled={loading} className="btn accent flex-1" style={{ fontWeight: 700 }}>
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Connect Google'}
          </button>
        </div>
      </div>
    </div>
  );
}
