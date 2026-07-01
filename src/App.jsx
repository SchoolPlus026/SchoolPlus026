import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Lock, Loader2, Eye, EyeOff, WifiOff } from 'lucide-react';
import { ToastProvider } from './components/ToastProvider';
import { useAppStore } from './store/useAppStore';
import { supabase } from './config/supabaseClient';
import { saveAccount, updateAccountTokens } from './utils/multiAccount';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

// Core Flow Components
import Login from './features/auth/Login';
import RegisterSchool from './features/auth/RegisterSchool';
import ResetPassword from './features/auth/ResetPassword';
import RegisterVerify from './features/auth/RegisterVerify';
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
  const navigate = useNavigate();

  useEffect(() => {

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleSWUpdate = (e) => {
      console.log('[PWA] SW Update event received:', e.detail);
      setSwUpdateReg(e.detail);
    };
    const handleOAuthMessage = (e) => {
      if (e.origin === window.location.origin) {
        if (e.data?.type === 'oauth-success') {
          console.log('[App] Received oauth-success message from popup. Reloading...');
          window.location.reload();
        } else if (e.data?.type === 'oauth-error') {
          console.warn('[App] Received oauth-error message from popup:', e.data.message);
          window.dispatchEvent(new CustomEvent('oauth-login-error', { detail: e.data.message }));
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sw-update-available', handleSWUpdate);
    window.addEventListener('message', handleOAuthMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-update-available', handleSWUpdate);
      window.removeEventListener('message', handleOAuthMessage);
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

    async function syncUserSession(session) {
      if (!session?.user) return;
      console.log('[SyncSession] syncUserSession started for user:', session.user.email);
      try {
        const store = useAppStore.getState();
        console.log('[SyncSession] querying users table for profile...');
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role, school_id, class, avatar_url, avatar_file_id, hide_avatar_from_class')
          .eq('id', session.user.id)
          .single();
        console.log('[SyncSession] users query complete. profile:', profile, 'error:', profileError);

        if (profileError || !profile) {
          // Check if it is a network error rather than a missing user row
          const isNetworkError = profileError && (
            profileError.message?.includes('Failed to fetch') ||
            profileError.message?.includes('Network Error') ||
            profileError.status === 0 ||
            !navigator.onLine
          );
          if (!isNetworkError) {
            console.warn('syncUserSession: User profile not found, signing out cleanly.', profileError);
            await supabase.auth.signOut();
            store.clearSession();
            if (!(window.opener && window.opener !== window)) {
              alert(`No account found for email '${session.user.email}'. Please register your school first or contact your admin.`);
            }
          } else {
            console.warn('syncUserSession: Network/connectivity error, keeping cached session.', profileError);
          }
          return;
        }

        // Get the freshest user data from Supabase Auth API — this includes up-to-date
        // identities[] and app_metadata.providers[] which reflect any recently linked/unlinked
        // Google accounts. The session.user object can sometimes be stale (from cached JWT).
        let freshIdentities = session.user.identities;
        let freshAppMetadata = session.user.app_metadata;
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            freshIdentities = authUser.identities;
            freshAppMetadata = authUser.app_metadata;
          }
        } catch (_) {
          // Non-critical — use identities from session if getUser() fails
        }

        // Merge profile fields (class, avatar, etc.) into the auth user object
        // Including fresh identities so Google connect/disconnect is immediately visible in UI
        const enrichedUser = { 
          ...session.user,
          identities: freshIdentities,
          app_metadata: freshAppMetadata,
          class: profile.class || null,
          avatar_url: profile.avatar_url || null,
          avatar_file_id: profile.avatar_file_id || null,
          hide_avatar_from_class: !!profile.hide_avatar_from_class
        };

        // Platform Admin has no school — skip school settings lookup
        if (profile.role === 'platform_admin') {
          const platformSettings = { name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' };
          store.setSchoolSettings(platformSettings);
          store.setUserAndRole(enrichedUser, profile.role);
          store.setProfileLastFetched(Date.now());
          saveAccount(session, { ...profile, email: session.user.email, id: session.user.id }, platformSettings);
        } else {
          const { data: settings, error: settingsError } = await supabase
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
              return;
            }

            // --- School Code Mismatch Check ---
            // IMPORTANT: Skip this check if the user is already logged in (identity linking scenario)
            // Only enforce it during fresh Google Sign-In (when store has no current user session)
            const isAlreadyLoggedIn = !!store.user;
            if (!isAlreadyLoggedIn) {
              const params = new URLSearchParams(window.location.search);
              const urlSchoolCode = params.get('school') || localStorage.getItem('oauth_school_code') || store.schoolSettings?.school_code;

              if (urlSchoolCode && urlSchoolCode.toUpperCase() !== 'PLATFORM') {
                const userSchoolCode = settings.school_code?.trim().toUpperCase();
                const enteredSchoolCode = urlSchoolCode.trim().toUpperCase();
                if (userSchoolCode !== enteredSchoolCode) {
                  await supabase.auth.signOut();
                  store.clearSession();
                  localStorage.removeItem('oauth_school_code');
                  alert(`🚫 Access Denied: Your account belongs to school '${userSchoolCode}', but you are attempting to log in to school '${enteredSchoolCode}'.`);
                  return;
                }
              }
            }

            // Success, save everything to state and local switcher
            store.setSchoolSettings(settings);
            store.setUserAndRole(enrichedUser, profile.role);
            store.setProfileLastFetched(Date.now());
            saveAccount(session, { ...profile, email: session.user.email, id: session.user.id }, settings);
            localStorage.removeItem('oauth_school_code');
          } else {
            // Check if settings lookup failed due to network
            const isNetworkError = settingsError && (
              settingsError.message?.includes('Failed to fetch') ||
              settingsError.message?.includes('Network Error') ||
              settingsError.status === 0 ||
              !navigator.onLine
            );
            if (!isNetworkError) {
              console.warn('syncUserSession: School settings not found, signing out cleanly.', settingsError);
              await supabase.auth.signOut();
              store.clearSession();
            } else {
              console.warn('syncUserSession: Network/connectivity error on settings lookup, keeping cached session.', settingsError);
            }
          }
        }
      } catch (err) {
        console.error("syncUserSession error:", err);
      }
    }

    async function initializeApp() {
      console.log('[InitApp] initializeApp started');
      try {
        const store = useAppStore.getState();
        console.log('[InitApp] store fetched');

        // Check for error parameters in the URL from Supabase OAuth failures
        const checkUrl = new URL(window.location.href);
        console.log('[InitApp] checkUrl:', checkUrl.toString());
        const checkHashParams = new URLSearchParams(checkUrl.hash.startsWith('#') ? checkUrl.hash.substring(1) : checkUrl.hash);
        const errorMsg = checkUrl.searchParams.get('error_description') || checkUrl.searchParams.get('error') ||
                         checkHashParams.get('error_description') || checkHashParams.get('error');
        
        // isRealPopup = a JS popup window opened by our code (window.open()). 
        // Has window.opener, can postMessage, can window.close().
        const isRealPopup = !!(window.opener && window.opener !== window);
        console.log('[InitApp] isRealPopup:', isRealPopup);
        
        // isOAuthCallback = this page load is a result of OAuth redirect (either popup or same-tab mobile fallback)
        const isOAuthCallback = isRealPopup || checkUrl.searchParams.has('oauth_callback');
        console.log('[InitApp] isOAuthCallback:', isOAuthCallback);

        if (errorMsg) {
          const decodedError = decodeURIComponent(errorMsg).replace(/\+/g, ' ');
          console.error('[OAuth Init] Auth error detected:', decodedError);
          if (isOAuthCallback) {
            localStorage.setItem('oauth_status', `error:${decodedError}`);
            if (isRealPopup) {
              try { window.opener.postMessage({ type: 'oauth-error', message: decodedError }, window.location.origin); } catch (_) {}
              window.open('', '_self');
              window.close();
              document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px; background: #0f172a; color: #fff;">
                  <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
                  <h2 style="margin-bottom: 10px; color: #ef4444;">Authentication Error</h2>
                  <p style="color: #94a3b8; font-size: 16px; max-width: 400px; line-height: 1.5;">${decodedError}</p>
                  <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Please close this tab and return to the app.</p>
                </div>
              `;
            } else {
              // Mobile same-tab: redirect back to login with error
              alert(`Login Failed: ${decodedError}`);
              const school = checkUrl.searchParams.get('school') || '';
              window.location.replace(`/?school=${school}`);
            }
            return;
          } else {
            alert(`Authentication Error: ${decodedError}`);
          }
        }

        // Fetch session. This allows Supabase to see the code or hash parameters in the URL
        // and perform the PKCE or implicit auth flow exchange before we strip the parameters!
        console.log('[InitApp] calling supabase.auth.getSession()...');
        let session = null;
        const { data, error: sessionError } = await supabase.auth.getSession();
        console.log('[InitApp] getSession completed. data:', data, 'error:', sessionError);
        session = data?.session || null;
        console.log('[InitApp] session is:', session);

        if (isOAuthCallback) {
          console.log('[OAuth] Callback detected. isRealPopup:', isRealPopup, 'Session exists:', !!session);
          if (session) {
            console.log('[OAuth] Verifying user profile exists...');
            const { data: oauthProfile } = await supabase
              .from('users')
              .select('id')
              .eq('id', session.user.id)
              .maybeSingle();

            if (oauthProfile) {
              console.log('[OAuth] Profile verified. isRealPopup:', isRealPopup);
              localStorage.setItem('oauth_status', 'success');
              if (isRealPopup) {
                // True JS popup: notify parent and self-close
                try { window.opener.postMessage({ type: 'oauth-success' }, window.location.origin); } catch (_) {}
                window.open('', '_self');
                window.close();
                document.body.innerHTML = `
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px; background: #0f172a; color: #fff;">
                    <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
                    <h2 style="margin-bottom: 10px;">Login Successful!</h2>
                    <p style="color: #94a3b8; font-size: 16px;">You can now close this tab and return to the main app window.</p>
                  </div>
                `;
                return;
              } else {
                // Mobile same-tab fallback redirect: clean URL and reload to boot up logged in
                console.log('[OAuth] Mobile same-tab redirect success. Cleaning URL and reloading...');
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('oauth_callback');
                cleanUrl.searchParams.delete('code');
                cleanUrl.hash = '';
                window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search);
                window.location.reload();
                return;
              }
            } else {
              // No user profile — sign out and show error
              console.warn('[OAuth] No profile found for this Google account.');
              await supabase.auth.signOut().catch(console.error);
              const errorMsgText = `No account registered under email '${session.user.email}'. Please check your school code or contact your admin.`;
              localStorage.setItem('oauth_status', `error:${errorMsgText}`);
              if (isRealPopup) {
                try { window.opener.postMessage({ type: 'oauth-error', message: errorMsgText }, window.location.origin); } catch (_) {}
                window.open('', '_self');
                window.close();
                document.body.innerHTML = `
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px; background: #0f172a; color: #fff;">
                    <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                    <h2 style="margin-bottom: 10px; color: #ef4444;">Account Not Found</h2>
                    <p style="color: #94a3b8; font-size: 16px; max-width: 400px; line-height: 1.5;">${errorMsgText}</p>
                    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Please close this tab and try again.</p>
                  </div>
                `;
              } else {
                // Mobile same-tab: redirect back to login with error in localStorage
                const school = checkUrl.searchParams.get('school') || '';
                window.location.replace(`/?school=${school}`);
              }
              return;
            }
          } else {
            // No session after callback
            console.warn('[OAuth] No session found after OAuth callback.');
            localStorage.setItem('oauth_status', 'error:Authentication failed. Please try again.');
            if (isRealPopup) {
              try { window.opener.postMessage({ type: 'oauth-error', message: 'Authentication failed.' }, window.location.origin); } catch (_) {}
              window.open('', '_self');
              window.close();
              document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px; background: #0f172a; color: #fff;">
                  <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
                  <h2 style="margin-bottom: 10px; color: #ef4444;">Login Failed</h2>
                  <p style="color: #94a3b8; font-size: 16px;">Authentication could not be completed.</p>
                  <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Please close this tab and try again.</p>
                </div>
              `;
            } else {
              const school = checkUrl.searchParams.get('school') || '';
              window.location.replace(`/?school=${school}`);
            }
            return;
          }
        }

        // 4. Now that session is established, clean the URL from auth tokens
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

        // If returned from redirect or having school param, force cache clear
        if (URLChanged || url.searchParams.has('school')) {
          store.setProfileLastFetched(null);
          const { data: refData } = await supabase.auth.refreshSession().catch(console.error) || {};
          if (refData?.session) {
            session = refData.session;
          }
        }

        if (!session?.user) {
          // If Zustand already has a user (from persisted storage), do NOT immediately sign out.
          // The device may be offline or the token may have expired transiently.
          // Try one explicit refreshSession before deciding to log out.
          if (store.user) {
            console.warn('[initializeApp] No session from getSession() but Zustand has user. Trying refreshSession...');
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshData?.session) {
                console.log('[initializeApp] refreshSession succeeded — restoring session.');
                session = refreshData.session;
              } else {
                // refreshSession definitively failed — check if it's a network issue
                const isNetworkError = !navigator.onLine ||
                  refreshError?.message?.includes('Failed to fetch') ||
                  refreshError?.message?.includes('Network Error') ||
                  refreshError?.status === 0;
                if (isNetworkError) {
                  // Offline — keep Zustand cache, show app with cached data
                  console.warn('[initializeApp] Offline/network error during refresh. Keeping cached session.');
                  setIsInitializing(false);
                  return;
                } else {
                  // Supabase rejected the token (e.g. revoked) — sign out
                  console.warn('[initializeApp] Token definitively invalid. Signing out.', refreshError);
                  store.clearSession();
                  setIsInitializing(false);
                  return;
                }
              }
            } catch (refreshErr) {
              // Network error during refresh — keep cached session
              console.warn('[initializeApp] Exception during refreshSession. Keeping cached session.', refreshErr);
              setIsInitializing(false);
              return;
            }
          } else {
            store.clearSession();
            setIsInitializing(false);
            return;
          }
        }

        // Cache bypass check: if we already have a persistent user session and profile,
        // and it is within the dynamic cache window hours, skip remote database queries to save egress.
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
            // Network error during version check — still show cached UI
            setIsInitializing(false);
            return;
          }
        }

        // If we already have the user in Zustand cache, we unblock the UI instantly 
        // and let the rest of the verification happen silently in the background.
        if (store.user) {
          setIsInitializing(false);
        }

        await syncUserSession(session);
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
        // Email/identity change confirmed — get the FRESHEST user data from Auth API
        // to ensure identities[] is up-to-date (reflects newly linked/unlinked Google accounts)
        const store = useAppStore.getState();
        const currentRole = store.role;
        const currentUser = store.user;
        
        // Try to get the freshest user from Auth API for up-to-date identities
        let freshUser = session.user;
        try {
          const { data: { user: apiUser } } = await supabase.auth.getUser();
          if (apiUser) freshUser = apiUser;
        } catch (_) {}

        store.setUserAndRole({
          ...freshUser,
          class: currentUser?.class || null,
          avatar_url: currentUser?.avatar_url || null,
          avatar_file_id: currentUser?.avatar_file_id || null,
          hide_avatar_from_class: !!currentUser?.hide_avatar_from_class
        }, currentRole);
        store.setProfileLastFetched(null); // force fresh re-fetch next init
      }

      // On SIGNED_IN: ALWAYS sync session (covers Google Login returning to app)
      if (event === 'SIGNED_IN' && session?.user) {
        await syncUserSession(session);
      }

      // Synchronize multi-account stored credentials on token refresh or login updates
      if (session?.user && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        (async () => {
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('role, school_id, name, class, avatar_url, avatar_file_id, hide_avatar_from_class')
              .eq('id', session.user.id)
              .single();
            if (profile) {
              let settings = null;
              if (profile.role !== 'platform_admin') {
                const { data: sData } = await supabase
                  .from('school_settings')
                  .select('*')
                  .eq('school_id', profile.school_id)
                  .single();
                settings = sData;
              } else {
                settings = { name: 'Platform Admin', school_id: null, school_code: 'PLATFORM' };
              }
              saveAccount(session, { ...profile, email: session.user.email, id: session.user.id }, settings);
            }
          } catch (e) {
            console.warn('Failed to fully sync saved account:', e.message);
            updateAccountTokens(session.user.id, session.access_token, session.refresh_token);
          }
        })();
      }
    });

    let appUrlListener = null;
    if (Capacitor.isNativePlatform()) {
      appUrlListener = CapacitorApp.addListener('appUrlOpen', async (data) => {
        try {
          console.log('[Deep Link] Received URL:', data.url);
          const url = new URL(data.url);
          
          if (url.pathname === '/register-verify' || data.url.includes('/register-verify')) {
            const search = url.search || '';
            console.log('[Deep Link] Routing to register-verify:', `/register-verify${search}`);
            navigate(`/register-verify${search}`);
            return;
          }

          const isAppScheme = url.protocol === 'schoolosplus:' || data.url.startsWith('schoolosplus://');
          const isWebCallback = (url.hostname === 'www.schoolosplus.in' || url.hostname === 'schoolosplus.in') && 
                                (url.searchParams.has('oauth_callback') || data.url.includes('oauth_callback') || data.url.includes('code=') || data.url.includes('access_token='));

          if (isAppScheme || isWebCallback) {
            // Extract hash parameters
            const hashStr = url.hash || (data.url.includes('#') ? '#' + data.url.split('#')[1] : '');
            const hashParams = new URLSearchParams(hashStr.startsWith('#') ? hashStr.substring(1) : hashStr);

            // 1. Handle error redirect from Supabase/Google
            const errorMsg = url.searchParams.get('error_description') || url.searchParams.get('error') || 
                             hashParams.get('error_description') || hashParams.get('error');
            if (errorMsg) {
              const decodedError = decodeURIComponent(errorMsg).replace(/\+/g, ' ');
              console.error('[Deep Link] Auth error detected:', decodedError);
              alert(`Authentication Error: ${decodedError}`);
              try { await Browser.close(); } catch (_) {}
              return;
            }

            // 2. PKCE flow — exchange code for session
            const code = url.searchParams.get('code');
            if (code) {
              console.log('[Deep Link] PKCE code detected, exchanging for session...');
              const { error: codeErr } = await supabase.auth.exchangeCodeForSession(data.url);
              if (codeErr) {
                console.error('[Deep Link] exchangeCodeForSession failed:', codeErr.message);
              }
              // After code exchange, onAuthStateChange SIGNED_IN fires — just close and reload
              try { await Browser.close(); } catch (_) {}
              window.location.reload();
              return;
            }

            // 3. Implicit flow — set session from hash tokens
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken) {
              const type = hashParams.get('type');
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
              }
              try { await Browser.close(); } catch (_) {}
              window.location.reload();
              return;
            }

            // 4. No tokens in URL — this is a bare callback (Google OAuth success or identity linking)
            //    The Supabase SDK has already processed the session via onAuthStateChange.
            //    We just need to close the browser and reload so the app picks up the new session.
            console.log('[Deep Link] No tokens in URL — closing browser and reloading to pick up new session.');
            useAppStore.getState().setProfileLastFetched(null);
            try { await Browser.close(); } catch (_) {}
            window.location.reload();
          }
        } catch (err) {
          console.error('[Deep Link] Error handling URL:', err);
          try { await Browser.close(); } catch (_) {}
          window.location.reload();
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
    if (role === 'hm') return '/admin';
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
      {user && location.pathname !== '/register-verify' && <GoogleRecoveryNudgeModal />}

      <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
      <Route path="/" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={user ? <Navigate to={getRoleRoute(role)} replace /> : <Login />} />
      <Route path="/register" element={<RegisterSchool />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register-verify" element={<RegisterVerify />} />

      {/* ──────────────── ADMIN ──────────────── */}
      <Route element={<ProtectedRoute allowedRoles={['admin', 'hm']} />}>
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
        : `${window.location.origin}${window.location.pathname}`;

      if (Capacitor.isNativePlatform()) {
        const browserFinishedListener = await Browser.addListener('browserFinished', () => {
          setLoading(false);
          browserFinishedListener.remove();
        });

        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true
          }
        });
        if (error) {
          browserFinishedListener.remove();
          throw error;
        }
        if (data?.url) {
          await Browser.open({ url: data.url });
        } else {
          browserFinishedListener.remove();
          throw new Error('Google link URL not found.');
        }
        // Don't reset setLoading here — browserFinished listener will do it
        return;
      } else {
        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true
          }
        });
        if (error) throw error;
        if (data?.url) {
          const width = 500;
          const height = 600;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          const popup = window.open(
            data.url,
            'google-oauth',
            `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
          );
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            // Popup was blocked — fallback to full page redirect
            window.location.href = data.url;
          }
        } else {
          throw new Error('Google link URL not found.');
        }
        return;
      }
    } catch (err) {
      if (err.message && err.message.includes('Manual linking is disabled')) {
        alert('Manual identity linking is disabled in your Supabase project configuration.');
      } else {
        alert(`Linking Google failed: ${err.message}`);
      }
    } finally {
      if (!Capacitor.isNativePlatform()) {
        setLoading(false);
      }
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
      <div className="card w-full max-w-md relative border border-white/10" style={{ background: 'var(--card-bg)', padding: '24px' }}>
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
