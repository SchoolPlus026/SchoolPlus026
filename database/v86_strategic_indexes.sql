-- ═══════════════════════════════════════════════════════════════════════════
-- v86_strategic_indexes.sql
-- Optimization Step 6: Strategic Database Indexing
--
-- WHY THIS MIGRATION EXISTS:
--   The app's core tables were created in v10/v11 (schema rebuild) without any
--   indexes beyond primary keys. As a result, every query that filters on
--   `school_id`, `role`, `class`, `status`, or `created_at` performs a full
--   table scan. At 5–20 schools × 1000 students, this is invisible today.
--   At 50+ schools, these become the dominant query cost.
--
--   EXISTING INDEXES (already present — NOT re-created here):
--   ✅ attendance:   idx_attendance_user_month (user_id, month_year)
--   ✅ attendance:   idx_attendance_school_month (school_id, month_year)
--   ✅ attendance:   idx_attendance_archived (school_id, archived) partial
--   ✅ student_achievements: idx_achievements_student, _class, _school_badge
--   ✅ badge_visibility_cache: idx_badge_cache_school
--   ✅ badges_master: idx_badges_master_scope_class
--   ✅ user_passkeys: idx_passkeys_credential_id, idx_passkeys_user_id
--   ✅ webauthn_challenges: idx_challenges_owner_key, idx_challenges_expires_at
--   ✅ recovery_profiles: idx_recovery_profiles_user_id, _school_id, _locked
--   ✅ login_brute_force_logs: idx_brute_force_username, idx_brute_force_locked_until
--   ✅ user_device_tokens: idx_user_device_tokens_user_id, _school_id
--   ✅ app_notifications_queue: (none found — adding below)
--   ✅ announcements: idx_announcements_dates
--   ✅ school_registrations: idx_school_registrations_status
--   ✅ academic_archives: idx_academic_archives_school
--
--   MISSING INDEXES (added in this migration):
--   ❌ users:                    school_id + role (most queries ever)
--   ❌ users:                    school_id + class (attendance class filter)
--   ❌ users:                    username (login lookup)
--   ❌ users:                    email (login, notification lookup)
--   ❌ notifications:            school_id + to_user (bell reads)
--   ❌ notifications:            school_id + is_read (unread count)
--   ❌ app_notifications_queue:  school_id + status (batch processor cron)
--   ❌ app_notifications_queue:  user_id + status (user-targeted push)
--   ❌ fees:                     school_id + user_id (student fee lookup)
--   ❌ fees:                     school_id + status (overdue fee queries)
--   ❌ fees_payments:            school_id + user_id (payment history)
--   ❌ leaves:                   school_id + user_id (personal leave history)
--   ❌ leaves:                   school_id + status (pending leave approvals)
--   ❌ leaves:                   school_id + created_at (chronological queries)
--   ❌ timetable:                school_id + class (class timetable view)
--   ❌ timetable:                school_id + teacher (teacher schedule view)
--   ❌ timetable:                school_id + day (daily off-classes view)
--   ❌ notices:                  school_id + created_at DESC (notice board)
--   ❌ notices:                  school_id + target_role (role-filtered notices)
--   ❌ gallery:                  school_id + created_at DESC (gallery scroll)
--   ❌ calendar_events:          school_id + start_date (event range queries)
--   ❌ audit_logs:               school_id + created_at DESC (admin audit view)
--   ❌ support_tickets:          school_id + status (platform support queue)
--   ❌ subscription_transactions: school_id + created_at DESC (billing history)
--   ❌ lost_and_found:           school_id + status (item board queries)
--   ❌ emergency_alerts:         school_id + created_at DESC (alert history)
--
-- INDEX STRATEGY:
--   1. Composite indexes are ordered by SELECTIVITY (most selective first).
--      Rule: highest cardinality column first = fewer rows per index scan.
--   2. Partial indexes (WHERE clause) used where status/flag filters dominate.
--      e.g. WHERE status = 'pending' for queue tables reduces index size by 90%+.
--   3. DESC sort included on time columns for ORDER BY created_at DESC queries.
--   4. ALL are `IF NOT EXISTS` — safe to re-run, never fails.
--   5. ALL created as CONCURRENTLY equivalent using standard IF NOT EXISTS
--      (Supabase runs migrations in transactions, CONCURRENTLY not supported there).
--
-- WRITTEN: 2026-06-01
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: users
-- Most queried table in the entire app. Used for:
--   - Login: WHERE username = ? or email = ?
--   - Listing: WHERE school_id = ? AND role = ?
--   - Class queries: WHERE school_id = ? AND class = ?
--   - Notification lookup: WHERE email = ? (from trg_replicate_queue_to_bell)
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite: school + role — used by every admin/teacher user list query
CREATE INDEX IF NOT EXISTS idx_users_school_role
    ON public.users(school_id, role);

-- Composite: school + class — used by attendance, timetable, achievements
CREATE INDEX IF NOT EXISTS idx_users_school_class
    ON public.users(school_id, class)
    WHERE class IS NOT NULL;

-- Single: username lookup — used by login flow (brute force + auth)
CREATE INDEX IF NOT EXISTS idx_users_username
    ON public.users(username)
    WHERE username IS NOT NULL;

-- Single: email lookup — used by login, notification trigger (email→user_id resolve)
CREATE INDEX IF NOT EXISTS idx_users_email
    ON public.users(email)
    WHERE email IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: notifications (in-app bell)
-- Used by NotificationBell.jsx which queries:
--   WHERE school_id = ? AND to_user = ? ORDER BY created_at DESC
--   UPDATE WHERE school_id = ? AND to_user = ? (mark as read)
-- After v83 optimization, only non-ephemeral rows enter this table,
-- but unread counts and reads still benefit greatly from indexes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite: school + to_user — primary read pattern for bell component
CREATE INDEX IF NOT EXISTS idx_notifications_school_user
    ON public.notifications(school_id, to_user);

-- Composite: school + is_read — unread count badge query
CREATE INDEX IF NOT EXISTS idx_notifications_school_unread
    ON public.notifications(school_id, to_user, is_read)
    WHERE is_read = false;

-- Time index: for ORDER BY created_at DESC (bell inbox sorted newest first)
CREATE INDEX IF NOT EXISTS idx_notifications_created_desc
    ON public.notifications(school_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: app_notifications_queue (FCM push queue)
-- Used by the batch processor cron (v81) which queries:
--   WHERE status = 'pending' ORDER BY created_at ASC
-- Also used by the sweeper cron:
--   WHERE status IN ('sent', 'failed') AND created_at < NOW() - INTERVAL '1 day'
-- These are the two most critical queries in our cron system.
-- ─────────────────────────────────────────────────────────────────────────────

-- Partial: pending only — batch processor's core query (90%+ smaller than full index)
CREATE INDEX IF NOT EXISTS idx_notif_queue_pending
    ON public.app_notifications_queue(created_at ASC)
    WHERE status = 'pending';

-- Composite: school + status — for school-scoped notification management
CREATE INDEX IF NOT EXISTS idx_notif_queue_school_status
    ON public.app_notifications_queue(school_id, status);

-- Composite: user + status — for user-targeted push lookup
CREATE INDEX IF NOT EXISTS idx_notif_queue_user_status
    ON public.app_notifications_queue(user_id, status)
    WHERE user_id IS NOT NULL;

-- Time index: for the sweeper cron cleanup (DELETE WHERE created_at < threshold)
CREATE INDEX IF NOT EXISTS idx_notif_queue_created_at
    ON public.app_notifications_queue(created_at ASC);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: fees
-- Used by AdminFeeManager and StudentFeeLedger for:
--   WHERE school_id = ? AND user_id = ? (student fee breakdown)
--   WHERE school_id = ? AND status = 'pending' (overdue fee list)
--   WHERE school_id = ? ORDER BY due_date (upcoming dues)
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite: school + student — student fee lookup (fees uses student_id, not user_id)
CREATE INDEX IF NOT EXISTS idx_fees_school_student
    ON public.fees(school_id, student_id);

-- Composite: school + year — year-based fee lookup
CREATE INDEX IF NOT EXISTS idx_fees_school_year
    ON public.fees(school_id, year);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: fees_payments
-- Used by payment history queries:
--   WHERE school_id = ? AND user_id = ? ORDER BY paid_at DESC
-- ─────────────────────────────────────────────────────────────────────────────

-- fees_payments has NO user_id — it links via fee_id → fees → student_id
-- Index on school_id + fee_id for payment history lookups
CREATE INDEX IF NOT EXISTS idx_fees_payments_school_fee
    ON public.fees_payments(school_id, fee_id);

CREATE INDEX IF NOT EXISTS idx_fees_payments_created_desc
    ON public.fees_payments(school_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: leaves (leave_requests)
-- Used by LeavesManager for:
--   WHERE school_id = ? AND user_id = ? (personal history)
--   WHERE school_id = ? AND status = 'pending' (teacher approval queue)
--   WHERE school_id = ? ORDER BY created_at DESC (admin list)
-- Also used by OffClasses: filtered by attendance, not leaves directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite: school + user — personal leave history
CREATE INDEX IF NOT EXISTS idx_leaves_school_user
    ON public.leaves(school_id, user_id);

-- Partial: pending only — approval queue (status is lowercase 'pending' per schema)
CREATE INDEX IF NOT EXISTS idx_leaves_school_pending
    ON public.leaves(school_id, created_at DESC)
    WHERE status = 'pending';

-- Composite: school + status — all status queries
CREATE INDEX IF NOT EXISTS idx_leaves_school_status
    ON public.leaves(school_id, status);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: timetable
-- Used by TimetableManager, TimetableViewer, and OffClasses for:
--   WHERE school_id = ? AND class = ? (class timetable)
--   WHERE school_id = ? AND teacher = ? (teacher schedule)
--   WHERE school_id = ? AND day = ? AND teacher IN (...) (off-classes query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite: school + class — class timetable view (most common)
CREATE INDEX IF NOT EXISTS idx_timetable_school_class
    ON public.timetable(school_id, class);

-- Composite: school + teacher — teacher schedule / off-classes
CREATE INDEX IF NOT EXISTS idx_timetable_school_teacher
    ON public.timetable(school_id, teacher);

-- Composite: school + day — day-based queries (off-classes, daily schedule)
CREATE INDEX IF NOT EXISTS idx_timetable_school_day
    ON public.timetable(school_id, day);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: notices
-- Used by NoticeManager and NoticeBoard for:
--   WHERE school_id = ? ORDER BY created_at DESC (notice board)
--   WHERE school_id = ? AND target_role IN ('all', 'student') (role-filtered)
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite: school + created_at DESC — notice board scroll (primary query)
CREATE INDEX IF NOT EXISTS idx_notices_school_created_desc
    ON public.notices(school_id, created_at DESC);

-- Composite: school + scope — scope-filtered notice board (column is 'scope' not 'target_role')
CREATE INDEX IF NOT EXISTS idx_notices_school_scope
    ON public.notices(school_id, scope);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: gallery
-- Used by GalleryManager for:
--   WHERE school_id = ? ORDER BY created_at DESC LIMIT N (paginated scroll)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gallery_school_created_desc
    ON public.gallery(school_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: calendar_events
-- Used by CalendarEvents for:
--   WHERE school_id = ? AND start_date >= ? AND end_date <= ? (date range view)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_calendar_events_school_date
    ON public.calendar_events(school_id, start_date);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: audit_logs
-- Used by AdminSettings and PlatformAdminDashboard for:
--   WHERE school_id = ? ORDER BY created_at DESC LIMIT 50
-- ─────────────────────────────────────────────────────────────────────────────

DO $safe_audit_logs$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_school_created_desc
        ON public.audit_logs(school_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table audit_logs does not exist yet — skipping indexes.';
END
$safe_audit_logs$;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: support_tickets
-- Used by PlatformAdminDashboard for:
--   ORDER BY created_at DESC (platform admin view — all schools)
--   WHERE school_id = ? (school-specific)
--   WHERE status = 'Pending' (open ticket queue)
-- ─────────────────────────────────────────────────────────────────────────────

DO $safe_support_tickets$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_support_tickets_created_desc
        ON public.support_tickets(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_school_status
        ON public.support_tickets(school_id, status);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table support_tickets does not exist yet — skipping indexes.';
END
$safe_support_tickets$;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: subscription_transactions
-- Used by PlatformAdminDashboard billing views:
--   WHERE school_id = ? ORDER BY created_at DESC (school billing history)
--   WHERE status = 'SUCCESSFUL' (revenue calculations)
-- ─────────────────────────────────────────────────────────────────────────────

DO $safe_subscription_transactions$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_sub_transactions_school_date
        ON public.subscription_transactions(school_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sub_transactions_status
        ON public.subscription_transactions(status);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table subscription_transactions does not exist yet — skipping indexes.';
END
$safe_subscription_transactions$;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: lost_and_found
-- Used by LostAndFound for:
--   WHERE school_id = ? AND status = 'found'/'claimed' ORDER BY created_at DESC
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: lost_and_found & emergency_alerts
-- These tables are optional features — created in later migrations.
-- Wrapped in safe DO blocks: if the table doesn't exist, the error is swallowed.
-- ─────────────────────────────────────────────────────────────────────────────

DO $safe_lost_found$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_lost_found_school_status
        ON public.lost_and_found(school_id, status);
    CREATE INDEX IF NOT EXISTS idx_lost_found_school_created_desc
        ON public.lost_and_found(school_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table lost_and_found does not exist yet — skipping indexes.';
END
$safe_lost_found$;

DO $safe_emergency$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_emergency_alerts_school_created_desc
        ON public.emergency_alerts(school_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table emergency_alerts does not exist yet — skipping indexes.';
END
$safe_emergency$;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: principals_desk / complaint_box
-- Already have school_id + sender/recipient indexes from v52/v54.
-- Adding time-based index for chronological reads.
-- ─────────────────────────────────────────────────────────────────────────────

DO $safe_principals_desk$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_principals_desk_created_desc
        ON public.principals_desk(school_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table principals_desk does not exist yet — skipping indexes.';
END
$safe_principals_desk$;

DO $safe_complaint_box$
BEGIN
    CREATE INDEX IF NOT EXISTS idx_complaint_box_created_desc
        ON public.complaint_box(school_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table complaint_box does not exist yet — skipping indexes.';
END
$safe_complaint_box$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Verification — Count all indexes on each core table
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
    t.relname AS table_name,
    COUNT(i.indexrelid) AS index_count
FROM pg_class t
JOIN pg_index i ON i.indrelid = t.oid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relkind = 'r'
  AND t.relname IN (
    'users', 'attendance', 'notifications', 'app_notifications_queue',
    'fees', 'fees_payments', 'leaves', 'timetable', 'notices', 'gallery',
    'calendar_events', 'audit_logs', 'support_tickets', 'subscription_transactions',
    'lost_and_found', 'emergency_alerts', 'student_achievements',
    'badge_visibility_cache', 'academic_archives', 'principals_desk', 'complaint_box'
  )
GROUP BY t.relname
ORDER BY t.relname;
-- Expected: Every table should have 2+ indexes (primary key + at least 1 new composite)
