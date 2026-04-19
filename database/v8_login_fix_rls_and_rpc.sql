-- ==========================================
-- V8: LOGIN FIX — RLS POLICY & USERNAME LOOKUP RPC
-- Run this ONCE in your Supabase SQL Editor.
-- ==========================================

-- ─────────────────────────────────────────────
-- PART 1: Fix RLS on public.users
-- Problem: After signInWithPassword(), the app tries to SELECT
--   from public.users. If RLS is too strict, this fails.
-- Solution: Ensure users can always read their OWN row.
--   Also allow the service/anon role to read email+username
--   for the username→email lookup (needed pre-login).
-- ─────────────────────────────────────────────

-- Enable RLS (safe to run if already enabled)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop and recreate clean policies to avoid duplicates
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow own profile read" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read own profile" ON public.users;

-- Policy 1: Any logged-in user can read their own row
CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Admins can read all users in their school
DROP POLICY IF EXISTS "Admins can read all users in school" ON public.users;
CREATE POLICY "Admins can read all users in school"
  ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'app_manager')
        AND (me.school_id = users.school_id OR me.role = 'app_manager')
    )
  );

-- Policy 3: Teachers can read students/teachers in their school
DROP POLICY IF EXISTS "Teachers can read their school users" ON public.users;
CREATE POLICY "Teachers can read their school users"
  ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS me
      WHERE me.id = auth.uid()
        AND me.role = 'teacher'
        AND me.school_id = users.school_id
    )
  );

-- Policy 4: Admins can insert users in their school
DROP POLICY IF EXISTS "Admins can insert users" ON public.users;
CREATE POLICY "Admins can insert users"
  ON public.users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'app_manager')
        AND (me.school_id = users.school_id OR me.role = 'app_manager')
    )
  );

-- Policy 5: Admins can update users in their school
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users"
  ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'app_manager')
        AND (me.school_id = users.school_id OR me.role = 'app_manager')
    )
  );

-- Policy 6: Admins can delete users in their school
DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
CREATE POLICY "Admins can delete users"
  ON public.users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'app_manager')
        AND (me.school_id = users.school_id OR me.role = 'app_manager')
    )
  );


-- ─────────────────────────────────────────────
-- PART 2: Username → Email lookup RPC
-- This is called by Login.jsx BEFORE the user is logged in.
-- It must be a SECURITY DEFINER function so it can bypass RLS
-- and look up the email in auth.users by matching username in public.users.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
BEGIN
  -- Find the user's UUID from public.users by username
  SELECT id INTO v_user_id
  FROM public.users
  WHERE LOWER(username) = LOWER(p_username)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL; -- No user with that username
  END IF;

  -- Get the email from the auth.users table
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- ─────────────────────────────────────────────
-- PART 3: Allow anon role to EXECUTE the RPC
-- (This is safe because it only returns an email given a username,
--  which is not a security sensitive operation for a school portal)
-- ─────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO authenticated;


-- ─────────────────────────────────────────────
-- PART 4: Fix school_settings RLS
-- The login page reads school_settings using ANON key (before login).
-- Make sure this is publicly readable.
-- ─────────────────────────────────────────────
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read school settings" ON public.school_settings;
CREATE POLICY "Anyone can read school settings"
  ON public.school_settings
  FOR SELECT
  USING (true);  -- Public read is safe; it only stores name, logo, subscription status etc.

-- ─────────────────────────────────────────────
-- DONE. Verify with:
-- SELECT get_email_by_username('admin');
-- SELECT get_email_by_username('teacher');
-- ─────────────────────────────────────────────
