-- ============================================================
-- V9: MASTER FACTORY RESET — SchoolPro SaaS
-- ⚠️  THIS WIPES ALL CUSTOM TABLES AND STARTS COMPLETELY FRESH.
-- Run this ONCE in the Supabase SQL Editor.
-- After this succeeds, login with username: admin / password: 123456
-- ============================================================


-- ============================================================
-- PHASE 1: TEARDOWN — Drop everything cleanly
-- ============================================================

-- Drop RPC functions first (no dependencies)
DROP FUNCTION IF EXISTS public.get_email_by_username(text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_user(text,text,text,text,text,uuid,text,text) CASCADE;

-- Drop all custom tables in correct dependency order (children first)
DROP TABLE IF EXISTS public.support_tickets    CASCADE;
DROP TABLE IF EXISTS public.notifications      CASCADE;
DROP TABLE IF EXISTS public.fees_payments      CASCADE;
DROP TABLE IF EXISTS public.fees               CASCADE;
DROP TABLE IF EXISTS public.attendance         CASCADE;
DROP TABLE IF EXISTS public.leaves             CASCADE;
DROP TABLE IF EXISTS public.timetable          CASCADE;
DROP TABLE IF EXISTS public.notices            CASCADE;
DROP TABLE IF EXISTS public.gallery            CASCADE;
DROP TABLE IF EXISTS public.calendar_events    CASCADE;
DROP TABLE IF EXISTS public.app_config         CASCADE;
DROP TABLE IF EXISTS public.users              CASCADE;
DROP TABLE IF EXISTS public.school_settings    CASCADE;

-- Delete demo auth users to ensure clean UUID alignment
DELETE FROM auth.users WHERE email IN (
    'admin@demo.com',
    'teacher@demo.com',
    'student@demo.com',
    'manager@demo.com'
);


-- ============================================================
-- PHASE 2: REBUILD SCHEMA
-- ============================================================

-- 2.1 School Settings (Tenant Root)
CREATE TABLE public.school_settings (
    school_id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name                text NOT NULL,
    school_code         text UNIQUE NOT NULL,
    logo_url            text,
    subscription_status text DEFAULT 'Trial'
                        CHECK (subscription_status IN ('Trial', 'Paid', 'Expired')),
    classes             text[] DEFAULT ARRAY[
                            '1st','2nd','3rd','4th','5th',
                            '6th','7th','8th','9th','10th',
                            '11th','12th'
                        ],
    modules_active      jsonb DEFAULT '["timetable","attendance","fees","leaves","notices","gallery","calendar","reports","contact","settings"]'::jsonb,
    created_at          timestamptz DEFAULT now()
);

-- 2.2 Users (linked to Supabase Auth)
CREATE TABLE public.users (
    id            uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    school_id     uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    role          text NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'app_manager')),
    username      text UNIQUE NOT NULL,
    name          text NOT NULL,
    class         text,
    contact       text,
    qualification text,
    aadhar_card   text,
    created_at    timestamptz DEFAULT now()
);

-- 2.3 Attendance
CREATE TABLE public.attendance (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    user_id    uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role       text,
    date       date NOT NULL,
    status     text CHECK (status IN ('Present', 'Absent', 'Late', 'Half_day', 'Leave')),
    marked_by  uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (school_id, user_id, date)
);

-- 2.4 Fees
CREATE TABLE public.fees (
    id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id         uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    student_id        uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    year              integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer,
    total             numeric DEFAULT 0,
    last_year_pending numeric DEFAULT 0,
    created_at        timestamptz DEFAULT now()
);

-- 2.5 Fee Payments
CREATE TABLE public.fees_payments (
    id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id      uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    fee_id         uuid REFERENCES public.fees(id) ON DELETE CASCADE NOT NULL,
    amount         numeric NOT NULL,
    method         text CHECK (method IN ('Cash', 'Online', 'Cheque', 'UPI')),
    transaction_id text,
    payment_date   date NOT NULL,
    created_at     timestamptz DEFAULT now()
);

-- 2.6 Timetable
CREATE TABLE public.timetable (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id    uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    day          text NOT NULL,
    period_order integer NOT NULL,
    period_label text,
    subject      text,
    class        text,
    teacher      text,
    teacher_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at   timestamptz DEFAULT now()
);

-- 2.7 Notices
CREATE TABLE public.notices (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    title      text NOT NULL,
    content    text NOT NULL,
    date       date NOT NULL,
    scope      text DEFAULT 'all' CHECK (scope IN ('all', 'students', 'teachers')),
    photo_url  text,
    created_at timestamptz DEFAULT now()
);

-- 2.8 Leaves
CREATE TABLE public.leaves (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    user_id    uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role       text NOT NULL,
    from_date  date NOT NULL,
    to_date    date NOT NULL,
    reason     text,
    status     text DEFAULT 'pending' CHECK (status IN ('pending', 'Approved', 'Rejected')),
    created_at timestamptz DEFAULT now()
);

-- 2.9 Calendar Events
CREATE TABLE public.calendar_events (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id   uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    title       text NOT NULL,
    description text,
    start_date  date NOT NULL,
    end_date    date,
    type        text DEFAULT 'activity' CHECK (type IN ('activity', 'exam', 'holiday')),
    created_at  timestamptz DEFAULT now()
);

-- 2.10 Gallery
CREATE TABLE public.gallery (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    title      text,
    link       text,
    category   text,
    created_at timestamptz DEFAULT now()
);

-- 2.11 Notifications
CREATE TABLE public.notifications (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    to_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    message    text NOT NULL,
    link       text,
    is_read    boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- 2.12 Support Tickets (App Manager)
CREATE TABLE public.support_tickets (
    id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id      uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE NOT NULL,
    admin_id       uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    subject        text NOT NULL,
    message        text NOT NULL,
    status         text DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    manager_reply  text,
    created_at     timestamptz DEFAULT now()
);

-- 2.13 App Config (Global, platform-level key-value store)
CREATE TABLE public.app_config (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    key_name      text UNIQUE NOT NULL,
    value_content text NOT NULL,
    updated_at    timestamptz DEFAULT now()
);


-- ============================================================
-- PHASE 3: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================
ALTER TABLE public.school_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config       ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PHASE 4: CLEAN, CONFLICT-FREE RLS POLICIES
-- Strategy: Use JWT user_metadata for school_id & role.
-- The demo seed (Phase 6) writes these into raw_user_meta_data.
-- ============================================================

-- Helper macro (used in all tenant policies):
-- (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid

-- ── school_settings ──────────────────────────────────────────
-- Public SELECT for school code lookup (needed at login page, before auth)
CREATE POLICY "Public: read school by code"
    ON public.school_settings FOR SELECT
    USING (true);

-- Only app_manager can modify school settings
CREATE POLICY "Manager: full school settings access"
    ON public.school_settings FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ── users ─────────────────────────────────────────────────────
-- Every user can read their own row (critical for profile fetch on login)
CREATE POLICY "Self: read own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

-- Tenant members can read all users in their school
CREATE POLICY "Tenant: read school users"
    ON public.users FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    );

-- App manager can read ALL users across all schools
CREATE POLICY "Manager: read all users"
    ON public.users FOR SELECT
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');

-- Admins & managers can insert users (via RPC admin_create_user)
CREATE POLICY "Admin: insert users"
    ON public.users FOR INSERT
    WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- Admins & managers can update users
CREATE POLICY "Admin: update users"
    ON public.users FOR UPDATE
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- Admins & managers can delete users
CREATE POLICY "Admin: delete users"
    ON public.users FOR DELETE
    USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );


-- ── attendance ────────────────────────────────────────────────
CREATE POLICY "Tenant: attendance access"
    ON public.attendance FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── fees ──────────────────────────────────────────────────────
CREATE POLICY "Tenant: fees access"
    ON public.fees FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── fees_payments ─────────────────────────────────────────────
CREATE POLICY "Tenant: fees_payments access"
    ON public.fees_payments FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── timetable ─────────────────────────────────────────────────
CREATE POLICY "Tenant: timetable access"
    ON public.timetable FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── notices ───────────────────────────────────────────────────
CREATE POLICY "Tenant: notices access"
    ON public.notices FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── leaves ────────────────────────────────────────────────────
CREATE POLICY "Tenant: leaves access"
    ON public.leaves FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── calendar_events ───────────────────────────────────────────
CREATE POLICY "Tenant: calendar access"
    ON public.calendar_events FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── gallery ───────────────────────────────────────────────────
CREATE POLICY "Tenant: gallery access"
    ON public.gallery FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── notifications ─────────────────────────────────────────────
CREATE POLICY "Self: read own notifications"
    ON public.notifications FOR SELECT
    USING (to_user_id = auth.uid());

CREATE POLICY "Self: update own notifications"
    ON public.notifications FOR UPDATE
    USING (to_user_id = auth.uid());

CREATE POLICY "Tenant: insert notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── support_tickets ───────────────────────────────────────────
CREATE POLICY "Admin: own school tickets"
    ON public.support_tickets FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Manager: all tickets"
    ON public.support_tickets FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ── app_config ────────────────────────────────────────────────
CREATE POLICY "Public: read app config"
    ON public.app_config FOR SELECT USING (true);

CREATE POLICY "Manager: write app config"
    ON public.app_config FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ============================================================
-- PHASE 5: REBUILD RPC FUNCTIONS
-- ============================================================

-- 5.1 get_email_by_username — used by Login.jsx pre-authentication
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
  SELECT id INTO v_user_id
  FROM public.users
  WHERE LOWER(username) = LOWER(p_username)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO authenticated;


-- 5.2 admin_create_user — called by UserManagement.jsx to create users without logout
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email      text,
    p_password   text,
    p_role       text,
    p_name       text,
    p_username   text,
    p_school_id  uuid,
    p_class      text DEFAULT NULL,
    p_contact    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_uid      uuid;
  caller_role  text;
  caller_school uuid;
BEGIN
  caller_role  := (auth.jwt() -> 'user_metadata' ->> 'role');
  caller_school := (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid;

  IF caller_role NOT IN ('admin', 'app_manager') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins or managers can create users.';
  END IF;

  IF caller_role = 'admin' AND caller_school != p_school_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only create users for your own school.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username) THEN
    RAISE EXCEPTION 'Username "%" is already taken.', p_username;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email "%" is already registered.', p_email;
  END IF;

  IF p_role NOT IN ('admin', 'teacher', 'student') THEN
    RAISE EXCEPTION 'Invalid role. Use admin, teacher, or student.';
  END IF;

  new_uid := gen_random_uuid();

  INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_uid, 'authenticated', 'authenticated',
      p_email, crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('school_id', p_school_id, 'role', p_role),
      now(), now(), '', '', '', ''
  );

  INSERT INTO public.users (id, school_id, role, username, name, class, contact)
  VALUES (new_uid, p_school_id, p_role, p_username, p_name, p_class, p_contact);

  RETURN new_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text,text,text,text,text,uuid,text,text) TO authenticated;


-- ============================================================
-- PHASE 6: CLEAN DEMO SEED — Fresh users with aligned UUIDs
-- All demo passwords: 123456
-- ============================================================
DO $$
DECLARE
    v_school_id   uuid;
    admin_id      uuid := gen_random_uuid();
    teacher_id    uuid := gen_random_uuid();
    student_id    uuid := gen_random_uuid();
    manager_id    uuid := gen_random_uuid();
BEGIN
    -- ── Step 1: Create demo school ───────────────────────────
    INSERT INTO public.school_settings (name, school_code, subscription_status)
    VALUES ('Demo High School', 'DEMO01', 'Paid')
    RETURNING school_id INTO v_school_id;


    -- ── Step 2: Insert auth.users with confirmed emails ──────

    -- ADMIN
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        admin_id, 'authenticated', 'authenticated',
        'admin@demo.com', crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('school_id', v_school_id, 'role', 'admin'),
        now(), now(), '', '', '', ''
    );

    -- TEACHER
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        teacher_id, 'authenticated', 'authenticated',
        'teacher@demo.com', crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('school_id', v_school_id, 'role', 'teacher'),
        now(), now(), '', '', '', ''
    );

    -- STUDENT
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        student_id, 'authenticated', 'authenticated',
        'student@demo.com', crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('school_id', v_school_id, 'role', 'student'),
        now(), now(), '', '', '', ''
    );

    -- APP MANAGER (no school_id — platform-wide role)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        manager_id, 'authenticated', 'authenticated',
        'manager@demo.com', crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"role":"app_manager"}',
        now(), now(), '', '', '', ''
    );


    -- ── Step 3: Insert public.users with SAME UUIDs ──────────

    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (admin_id, v_school_id, 'admin', 'admin', 'System Admin');

    INSERT INTO public.users (id, school_id, role, username, name, class, qualification)
    VALUES (teacher_id, v_school_id, 'teacher', 'teacher', 'Demo Teacher', '10th A', 'B.Ed');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (student_id, v_school_id, 'student', 'student', 'Demo Student', '10th A');

    -- App Manager has NULL school_id (platform-wide)
    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (manager_id, NULL, 'app_manager', 'manager', 'Platform Manager');


    -- ── Step 4: Seed sample operational data ─────────────────

    -- Sample notice
    INSERT INTO public.notices (school_id, title, content, date, scope)
    VALUES (v_school_id, 'Welcome to SchoolPro!',
            'This is a demo notice. Admins and teachers can post notices here.', 
            CURRENT_DATE, 'all');

    -- Sample calendar event
    INSERT INTO public.calendar_events (school_id, title, start_date, end_date, type)
    VALUES (v_school_id, 'Annual Sports Day', CURRENT_DATE + 7, CURRENT_DATE + 7, 'activity');

    INSERT INTO public.calendar_events (school_id, title, start_date, end_date, type)
    VALUES (v_school_id, 'Unit Test', CURRENT_DATE + 14, CURRENT_DATE + 16, 'exam');

    -- Sample fee record for demo student
    INSERT INTO public.fees (school_id, student_id, year, total, last_year_pending)
    VALUES (v_school_id, student_id, EXTRACT(YEAR FROM now())::integer, 15000, 2500);

    -- Sample timetable entry
    INSERT INTO public.timetable (school_id, day, period_order, period_label, subject, class, teacher)
    VALUES 
        (v_school_id, 'Monday', 1, '08:00 - 08:40', 'Mathematics', '10th A', 'Demo Teacher'),
        (v_school_id, 'Monday', 2, '08:40 - 09:20', 'English',     '10th A', 'Demo Teacher'),
        (v_school_id, 'Tuesday', 1, '08:00 - 08:40', 'Science',    '10th A', 'Demo Teacher');

    -- App config seed
    INSERT INTO public.app_config (key_name, value_content)
    VALUES ('about_text', 'SchoolPro is a multi-tenant school management platform built to modernize school administration. Built by Shubham Arun Hajare.');

END $$;


-- ============================================================
-- PHASE 7: VERIFICATION QUERIES
-- Uncomment and run these to confirm success.
-- ============================================================
-- SELECT 'school_settings' AS tbl, count(*) FROM public.school_settings
-- UNION ALL SELECT 'users', count(*) FROM public.users
-- UNION ALL SELECT 'auth.users', count(*) FROM auth.users WHERE email LIKE '%@demo.com';

-- SELECT id, username, role, school_id FROM public.users;

-- SELECT get_email_by_username('admin');   -- should return admin@demo.com
-- SELECT get_email_by_username('teacher'); -- should return teacher@demo.com
-- SELECT get_email_by_username('manager'); -- should return manager@demo.com

-- ============================================================
-- ✅  DONE. Login credentials:
--     School Code : DEMO01
--     admin       / 123456
--     teacher     / 123456
--     student     / 123456
--     manager     / 123456  (skip school code step)
-- ============================================================
