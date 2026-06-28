# SchoolOS+ Migration State (SOT) ── Japan to India

This document serves as the Single Source of Truth (SOT) for the backend migration of SchoolOS+ from Supabase Japan region to India (Mumbai) region.

---

## 1. Verified Infrastructure Metadata

*   **Organization Name:** `schoolpro026@gmail.com's Org`
*   **Organization ID:** `acktackghvyocfwpoixz`
*   **Source Project (Japan):**
    *   **Project Name:** `schoolpro026@gmail.com's Project`
    *   **Project ID (Ref):** `nnaqayemfogpfehiaifw`
    *   **Region:** `ap-northeast-1` (Tokyo, Japan)
    *   **Project URL:** `https://nnaqayemfogpfehiaifw.supabase.co`
*   **Target Project (India):**
    *   **Project Name:** `SchoolOSPlus_india1`
    *   **Project ID (Ref):** `jbjtvosvwufimjcvvwcg`
    *   **Region:** `ap-south-1` (Mumbai, India)
    *   **Project URL:** `https://jbjtvosvwufimjcvvwcg.supabase.co`

---

## 2. Completed Steps Log

### [2026-06-26T14:48:00+05:30] Step 1: Verification of MCP Dual-Access
*   **Action:** Executed `list_projects` on the Supabase MCP Server.
*   **Result:** Verified access to both the Japan project (`nnaqayemfogpfehiaifw`) and the new India project (`jbjtvosvwufimjcvvwcg`). Both projects are active, healthy, and accessible under the current scope.
*   **Command log:** Supabase MCP tool `list_projects` called.

### [2026-06-26T14:49:00+05:30] Step 2: Initialize India Directory
*   **Action:** Created a brand-new directory `supabase_india` in the root of the workspace to isolate India configurations and testing files.

### [2026-06-26T15:20:00+05:30] Step 3: Extract Consolidated Schema
*   **Action:** Used Supabase MCP SQL tool `execute_sql` to extract complete metadata of columns, constraints, RLS enablement, RLS policies, custom functions, triggers, indexes, and pg_cron jobs from the Japan database (`nnaqayemfogpfehiaifw`).
*   **Result:** Generated `supabase_india/raw_japan_schema.sql` containing the exact consolidated schema.

### [2026-06-26T15:25:00+05:30] Step 4: Generate India Schema & Isolate Environment
*   **Action:** Swapped Japan project refs and the `service_role` authorization key for the India target database in `supabase_india/final_india_schema.sql`. Appended isolation commands (truncating `user_device_tokens`, resetting `gdrive_config` / `pa_gdrive_config` in settings tables) to ensure safety.
*   **Result:** Generated `supabase_india/final_india_schema.sql` ready for user review and deployment.

### [2026-06-26T15:42:00+05:30] Step 5: Execute Consolidated India Schema (Phase 2 Complete)
*   **Action:** Programmatically executed the partitioned SQL schema sections sequentially on Target India Project (`jbjtvosvwufimjcvvwcg`):
    *   **Part 1:** Extensions, Core Tables & Relations (46 tables).
    *   **Setup:** Schema `supabase_functions` and webhook helper `http_request` functions.
    *   **Part 3:** Custom Functions (60 functions successfully deployed).
    *   **Part 2:** RLS Enablement & RLS Policies (132 policies deployed).
    *   **Part 4:** Custom Triggers (28 triggers deployed).
    *   **Part 5:** Custom Indexes (73 indexes), active pg_cron schedules (5 active jobs), and environmental isolation resets.
*   **Result:** Queried target database directly: verified 46 tables, 60 public functions, 5 active cron jobs with Mumbai API keys and URLs, and verified that all user device tokens are truncated and Google Drive settings are reset (`[]`).
*   **Status:** Phase 2 (Schema Cloning) is 100% COMPLETE. Ready for Phase 3 (Functions & Secrets).

### [2026-06-26T20:28:00+05:30] Step 6: Inject Secrets & Deploy Edge Functions (Phase 3 Complete)
*   **Action:**
    *   **Auth:** Authenticated using the user's Supabase Personal Access Token (`sbp_45281419...`).
    *   **Secrets:** Injected all 10 verified staging secrets (FCM, Brevo, Razorpay, Google OAuth, frontend URL) using the CLI and a custom secrets deployment script `scratch/deploy_secrets.js`.
    *   **Config:** Created `supabase/config.toml` to declare the correct `verify_jwt` parameters for all 21 Edge Functions (disabling validation for 11 public/webhook callback functions and keeping it enabled for the remaining 10).
    *   **Deployment:** Deployed all 21 Edge Functions using `supabase functions deploy --project-ref jbjtvosvwufimjcvvwcg --use-api` to bypass Docker dependencies.
*   **Result:** All 10 secrets set successfully (verified via CLI list query). All 21 Edge Functions successfully deployed and status confirmed as `ACTIVE` with exact matching JWT verification rules.
*   **Status:** Phase 3 (Secrets Injection & Functions Deployment) is 100% COMPLETE. Ready for Phase 4 (Local Testing).

### [2026-06-26T22:55:00+05:30] Step 7: Executed Sandbox Demo Data Seeding
*   **Action:** Executed the corrected SQL script `supabase_india/seed_demo_data.sql` on the India target project (`jbjtvosvwufimjcvvwcg`) database using the Supabase MCP SQL tool `execute_sql`.
*   **Fixes:** 
    *   Replaced the invalid plan UUID starting with 's' with a valid hex-compliant UUID prefix `'c0000000-0000-0000-0000-000000000001'`.
    *   Substituted the template placeholder `${schoolId}` with the actual school ID `'d0000000-0000-0000-0000-000000000100'`.
    *   Aligned the database input values with active schema check constraints (updated `subscription_status` from `'Active'` to `'Paid'`, and `plan_type` from `'paid'` to `'premium'`).
*   **Result:** 
    *   `public.users`: 112 users seeded (1 platform_admin, 1 admin, 10 teachers, 100 students).
    *   Verified specific key sandbox accounts: `shubham` (Teacher, Class 1) and `ravi` (Student, Class 1).
    *   All passwords are set to the hashed representation of `'654321'`.
    *   `public.school_settings`: 1 school record initialized.
*   **Status:** Demo Seeding is 100% COMPLETE and VERIFIED.

---

## 3. Phase 3 Secrets Requirements Manifest

The following secrets were verified through a static scan of the Edge Functions as the exact and only credentials required for Phase 3:

### A. Supabase Secrets (Backend Edge Functions)
1.  **FCM_PROJECT_ID:** Firebase Project ID for push notifications.
2.  **FCM_SERVICE_ACCOUNT_KEY:** JSON private key payload of the Firebase Service Account.
3.  **BREVO_API_KEY:** Brevo transactional email API key.
4.  **BREVO_SENDER_EMAIL:** Verified sender email address (e.g., `schoolosplus@gmail.com`).
5.  **RAZORPAY_KEY_ID:** Razorpay Public Key ID (for generating orders).
6.  **RAZORPAY_KEY_SECRET:** Razorpay Secret Key (for server-to-server status verification).
7.  **GOOGLE_CLIENT_ID:** Google Drive API OAuth client ID.
8.  **GOOGLE_CLIENT_SECRET:** Google Drive API OAuth client secret.
9.  **APP_FRONTEND_URL:** Target Firebase hosting client URL.
10. **RP_ID:** WebAuthn Relaying Party ID (matches the hosting domain).

### B. Client-Side Environment Variables (`.env`)
1.  `VITE_SUPABASE_URL`: Target India Supabase URL.
2.  `VITE_SUPABASE_ANON_KEY`: Target India Anon Key.
3.  `VITE_FIREBASE_DATABASE_URL`: Staging Firebase Realtime Database URL.
4.  `VITE_FIREBASE_API_KEY`: Staging Firebase API Key.
5.  `VITE_FIREBASE_AUTH_DOMAIN`: Staging Firebase Auth Domain.
6.  `VITE_FIREBASE_PROJECT_ID`: Staging Firebase Project ID.
7.  `VITE_FIREBASE_STORAGE_BUCKET`: Staging Firebase Storage Bucket.
8.  `VITE_FIREBASE_MESSAGING_SENDER_ID`: Staging Firebase Messaging Sender ID.
9.  `VITE_FIREBASE_APP_ID`: Staging Firebase App ID.
10. `VITE_FIREBASE_VAPID_KEY`: Staging Firebase Cloud Messaging VAPID key.
11. `VITE_GOOGLE_CLIENT_ID`: Google Drive OAuth client ID (added for local development).

---

## 4. Phase 4 Local Testing Feedback Patches (Staging Fixes)

### [2026-06-27T14:15:00+05:30] Step 8: Apply and Verify Bug Fixes
All reported issues from local testing on the India project have been resolved and verified via local build check:

*   **Database Sync & Timetable Logic (Group A):**
    *   **Bug 1 (Relational Sync):** Added `trg_sync_teacher_class_change` trigger to `public.users` to automatically update associated class assignments across the weekly timetable when a teacher's class is modified in the UI.
    *   **Bug 2 (Ghost Bug):** Patched `TeacherDutyBanner.jsx` to filter out null/empty class or subject entries, preventing ghost warning boxes from rendering on dashboards.
    *   **Bug 3a (Duplicate Substitutions):** Rewrote `assignSubstitute` in `OffClasses.jsx` to perform an `UPDATE` on cancelled substitutions instead of inserting duplicate rows, preserving constraints.
    *   **Bug 3b (Unavailable Teacher Filter):** Refactored available teacher queries in `OffClasses.jsx` to cross-reference scheduled periods and active substitutions, filtering busy teachers from the substitute pick list.
    *   **Bug 3c (Substitute Notification):** Added substitution warning banners and red card badges to `TeacherDashboard.jsx` to immediately alert coverage teachers.

*   **Integrations & Edge Functions (Group B):**
    *   **Bug 4 (Google Drive Connection):** Added `VITE_GOOGLE_CLIENT_ID` to the React environment `.env` file to fix missing Google OAuth parameter popup block.
    *   **Bug 5 (FCM Push Notifications):** Corrected JSON string escaping inside `deploy_secrets.js` to ensure the private key is stored natively without backslash corruption. Re-injected all secrets and verified that `verify_jwt = false` is active in `config.toml`.
    *   **Bug 6 (Brevo Email Template Mix-up):** Patched `send-welcome-email` Edge Function to check for `BREVO_WELCOME_TEMPLATE_ID` secret and map parameters dynamically while maintaining raw HTML fallback. Redeployed the updated function.

*   **Frontend UI & RBAC (Group C):**
    *   **Bug 7 (Missing Register Option):** Restored the "Register Your School" link in step 1 of `Login.jsx` to route users to the school self-registration module.
    *   **Bug 8 (HM Settings Access):** Configured `'hm'` role alias across `App.jsx` routing and `ModuleGuard.jsx` to grant Head Master roles dashboard entry and persistent access to the Settings card.

