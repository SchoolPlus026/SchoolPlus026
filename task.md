# 📝 SchoolOS+ $0 Scaling Implementation Checklist

- [x] **Phase 1: Caching, Polling Reduction & Refresh Throttling**
  - [x] Create `useTieredCache.js` hook with tier-based caching times
  - [x] Update `App.jsx` to load dynamic settings and use cache window thresholds
  - [x] Implement night-time guard boundary utility in useAppStore / hooks
  - [x] Rewrite `NotificationBell.jsx` to "Ghost Bell" (cache-first + FCM foreground toast count increment)
  - [x] Throttle manual Refresh Button with dynamic cooldowns (30s Free / 10s Premium) + Countdown Timer UI in layout files:
    - [x] `AdminLayout.jsx`
    - [x] `TeacherLayout.jsx`
    - [x] `StudentLayout.jsx`
    - [x] `DriverLayout.jsx`
  - [x] Increase polling intervals & disable specific widgets for Free:
    - [x] `FeeReminderBanner.jsx`
    - [x] `useAllModuleActivities`
    - [x] `ExecutiveBriefingWidget.jsx`
    - [x] `PendingAttendanceWidget.jsx`

- [x] **Phase 2: Dynamic Admin Controls & Realtime Migration**
  - [x] Write database migration `v91_platform_settings_controls.sql` to add optimization columns to `platform_settings`
  - [x] Hydrate `platformSettings` in `useAppStore` during init in `App.jsx`
  - [x] Build "Advanced Optimization Controls" panel in `PlatformAdminDashboard.jsx` (Quota Control tab)
  - [x] Migrate `EmergencyOverlay.jsx` from Supabase RT to Firebase RTDB (Premium) / FCM-only (Free)
  - [x] Migrate `GlobalBroadcastBanner.jsx` from Supabase RT to Firebase RTDB (Premium) / FCM-only (Free)
  - [x] Verify surgical Realtime subscription in payment checkouts

- [x] **Phase 3: Database Optimization (Storage Fix)**
  - [x] Update `notification-smart-sweeper` cron in database (3 days read, 7 days all retention)
  - [x] Add pagination (50 per page) to `UserManagement.jsx`
  - [x] Add pagination (50 per page) to `AdminFeeManager.jsx` (via dynamic class-level database filtering)
  - [x] Add `data_version` column & trigger on `school_settings`

- [x] **Phase 4: Module Gating (Feature Access Manager)**
  - [x] Align default locked modules (Fees, Gallery, Reports, Bus Tracker, Executive Briefing, Staff Pending Duty) in the database
  - [x] Verify Timetable and Leaves remain unlocked by default for Free Tier
  - [x] Enforce caps: Notices (max 5/month, no images), Emergency (max 5/month), Complaints (max 10/month) for Free

- [x] **Phase 5: Edge Function Optimization**
  - [x] Fix QR polling in `Login.jsx` (3s -> 5s with 90s timeout + backoff)
  - [x] Adjust cron batch window for Free notifications to 30 minutes

- [x] **Phase 6: Jugaad Deployment**
  - [x] Create GitHub Actions keepalive cron `keepalive.yml`
  - [x] Implement client-side `data_version` stamp check on app startup
  - [x] Audit on-demand lazy module loading

- [x] **Security Audit: Phase 1 (Firebase Rules Hardening)**
  - [x] Whitelist `tracking`, `schools`, and `global/announcements_update` paths in RTDB rules
  - [x] Apply default deny `$other` to all other paths
  - [x] Deploy and publish rules to Firebase RTDB console

- [x] **Security Audit: Phase 2 (Token Storage Security)**
  - [x] Create `secureStorage.js` utility implementing AES-GCM and non-extractable IndexedDB master key
  - [x] Update `supabaseClient.js` to use the custom async secure storage provider
  - [x] Remove Firebase custom token caching from `localStorage` and keep strictly in-memory in `firebaseAuth.js`
  - [x] Convert `multiAccount.js` and UI consumers to use async encrypted storage for `sp_accounts`
  - [x] Compile and verify zero-breakage across login and account switcher


