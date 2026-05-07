-- ==============================================================================
-- v47: Fix RLS Role Mismatch — Replace all 'app_manager' JWT checks
-- ==============================================================================
-- CONTEXT
-- -------
-- The original schema (v7-v11) used the role value 'app_manager' in auth.jwt()
-- user_metadata checks. v17 migrated all user records to 'platform_admin' and
-- updated the users table constraint. However, v38 and v40 introduced NEW RLS
-- policies that reverted back to checking for 'app_manager' — a role that no
-- longer exists in any user record. This silently blocked the Platform Admin
-- from reading, inserting, updating, or deleting subscription plans and
-- transactions. v39 attempted a partial fix for subscription_plans but missed
-- the public SELECT policy for schools. This migration is the definitive fix.
--
-- TABLES FIXED
-- ------------
--   1. subscription_plans         (v38 + v39 regressions)
--   2. subscription_transactions  (v40 regression)
--   3. school_settings UPDATE     (v33 line 120 lingering 'app_manager')
--
-- STRATEGY
-- --------
-- All policies now use a DB subquery:
--   (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
-- This is safer than auth.jwt() -> 'user_metadata' ->> 'role' because:
--   (a) JWT user_metadata is user-writable and can be spoofed
--   (b) The DB users table is the authoritative, RLS-protected source of truth
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: subscription_plans
-- Full CRUD for Platform Admin only.
-- Any authenticated user can SELECT active plans (needed for school billing UI).
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure RLS is ON
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on this table (clean slate to avoid conflicts)
DROP POLICY IF EXISTS "Admins can insert plans"         ON public.subscription_plans;
DROP POLICY IF EXISTS "Admins can update plans"         ON public.subscription_plans;
DROP POLICY IF EXISTS "Admins can delete plans"         ON public.subscription_plans;
DROP POLICY IF EXISTS "Admins can view all plans"       ON public.subscription_plans;
DROP POLICY IF EXISTS "Anyone can view active plans"    ON public.subscription_plans;
DROP POLICY IF EXISTS "Platform admin: manage plans"    ON public.subscription_plans;
DROP POLICY IF EXISTS "Schools can view active plans"   ON public.subscription_plans;

-- 1a. Platform Admin: full read (including inactive plans for management UI)
CREATE POLICY "Platform admin: read all plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );

-- 1b. Schools (admins): read only ACTIVE plans (for billing/upgrade page)
CREATE POLICY "Schools: read active plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'teacher', 'student')
  );

-- 1c. Platform Admin: INSERT new plans
CREATE POLICY "Platform admin: insert plans"
  ON public.subscription_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );

-- 1d. Platform Admin: UPDATE existing plans
CREATE POLICY "Platform admin: update plans"
  ON public.subscription_plans
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );

-- 1e. Platform Admin: DELETE plans
CREATE POLICY "Platform admin: delete plans"
  ON public.subscription_plans
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: subscription_transactions
-- Platform Admin reads all. School admins read only their own school's records.
-- INSERTs/UPDATEs are handled exclusively by Edge Functions (service role key).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on this table
DROP POLICY IF EXISTS "Users can view all transactions"          ON public.subscription_transactions;
DROP POLICY IF EXISTS "Enable read access for all users"        ON public.subscription_transactions;
DROP POLICY IF EXISTS "School admins can view own transactions"  ON public.subscription_transactions;
DROP POLICY IF EXISTS "App managers can view all transactions"   ON public.subscription_transactions;
DROP POLICY IF EXISTS "Anyone can view transactions"            ON public.subscription_transactions;

-- 2a. Platform Admin: read all transactions across every school
CREATE POLICY "Platform admin: read all transactions"
  ON public.subscription_transactions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );

-- 2b. School Admin: read only their own school's transactions
CREATE POLICY "School admin: read own transactions"
  ON public.subscription_transactions
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- Note: INSERT / UPDATE handled by Edge Functions using service_role key (bypasses RLS).
-- No frontend INSERT/UPDATE policies are intentionally defined here.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: school_settings UPDATE policy
-- v33 line 120 left a lingering 'app_manager' check in the UPDATE policy.
-- Replace it with a clean 'admin'-only check (Platform Admin has its own policy).
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the v33 policy that still checked for 'app_manager'
DROP POLICY IF EXISTS "Admin: update own school settings" ON public.school_settings;

-- Recreate clean: School admin can only update their own school's settings
CREATE POLICY "Admin: update own school settings"
  ON public.school_settings
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- Platform admin can update any school's settings (this policy from v33 is already correct)
-- "Platform admin: update any school settings" — no change needed


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Seed initial subscription plans (idempotent — safe to run twice)
-- The original seed in v38 may have failed due to RLS blocking the INSERT.
-- ON CONFLICT DO NOTHING ensures this is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Temporarily disable RLS for the seed operation (runs as superuser in SQL editor)
-- This is safe because the SQL editor runs with elevated privileges.
-- If these plans already exist, the INSERT is a no-op.

INSERT INTO public.subscription_plans (name, amount_paise, validity_days, is_active)
VALUES
  ('Premium Monthly', 50000,  28,  true),
  ('Premium Annual',  500000, 365, true)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Reload PostgREST schema cache
-- Required so Supabase's API layer picks up the new policies immediately.
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- VERIFICATION QUERIES (run after applying to confirm fix)
-- ==============================================================================
-- Check all current policies on the fixed tables:
--
--   SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('subscription_plans', 'subscription_transactions', 'school_settings')
--   ORDER BY tablename, policyname;
--
-- Check that no 'app_manager' JWT check remains in active policies:
--
--   SELECT tablename, policyname, qual, with_check
--   FROM pg_policies
--   WHERE qual LIKE '%app_manager%' OR with_check LIKE '%app_manager%';
--
-- Expected result for the second query: 0 rows.
-- ==============================================================================
