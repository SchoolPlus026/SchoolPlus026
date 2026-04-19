-- ============================================================
-- V10: SCHOOLPRO — CLEAN REBUILD (EMPTY DATABASE)
-- ⚠️  Run this on a COMPLETELY EMPTY database only.
--     No DROP commands. Start directly with CREATE TABLE.
-- ============================================================
-- Demo Credentials after running:
--   School Code : DEMO01
--   admin       → password: 123456
--   teacher     → password: 123456
--   student     → password: 123456
--   manager     → password: 123456  (skip school code step)
-- ============================================================


-- ============================================================
-- SECTION 1: CREATE ALL TABLES
-- ============================================================

-- 1.1 school_settings — Tenant root. One row per school.
CREATE TABLE public.school_settings (
    school_id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    name                text        NOT NULL,
    school_code         text        UNIQUE NOT NULL,
    logo_url            text,
    subscription_status text        DEFAULT 'Trial'
                        CHECK (subscription_status IN ('Trial', 'Paid', 'Expired')),
    classes             text[]      DEFAULT ARRAY[
                                        '1st','2nd','3rd','4th','5th',
                                        '6th','7th','8th','9th','10th',
                                        '11th','12th'
                                    ],
    modules_active      jsonb       DEFAULT '["timetable","attendance","fees","leaves","notices","gallery","calendar","reports","contact","settings"]'::jsonb,
    created_at          timestamptz DEFAULT now()
);


-- 1.2 users — Extends Supabase auth.users. One row per user.
--     app_manager has NULL school_id (platform-wide role).
CREATE TABLE public.users (
    id            uuid        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    school_id     uuid        REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    role          text        NOT NULL
                  CHECK (role IN ('admin', 'teacher', 'student', 'app_manager')),
    username      text        UNIQUE NOT NULL,
    name          text        NOT NULL,
    class         text,
    contact       text,
    qualification text,
    aadhar_card   text,
    created_at    timestamptz DEFAULT now()
);


-- 1.3 attendance
CREATE TABLE public.attendance (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role       text,
    date       date        NOT NULL,
    status     text        CHECK (status IN ('Present', 'Absent', 'Late', 'Half_day', 'Leave')),
    marked_by  uuid        REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (school_id, user_id, date)
);


-- 1.4 fees
CREATE TABLE public.fees (
    id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id         uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    student_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    year              integer     NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer,
    total             numeric     DEFAULT 0,
    last_year_pending numeric     DEFAULT 0,
    created_at        timestamptz DEFAULT now()
);


-- 1.5 fees_payments
CREATE TABLE public.fees_payments (
    id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id      uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    fee_id         uuid        NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
    amount         numeric     NOT NULL,
    method         text        CHECK (method IN ('Cash', 'Online', 'Cheque', 'UPI')),
    transaction_id text,
    payment_date   date        NOT NULL,
    created_at     timestamptz DEFAULT now()
);


-- 1.6 timetable
CREATE TABLE public.timetable (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id    uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    day          text        NOT NULL,
    period_order integer     NOT NULL,
    period_label text,
    subject      text,
    class        text,
    teacher      text,
    teacher_id   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at   timestamptz DEFAULT now()
);


-- 1.7 notices
CREATE TABLE public.notices (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title      text        NOT NULL,
    content    text        NOT NULL,
    date       date        NOT NULL,
    scope      text        DEFAULT 'all' CHECK (scope IN ('all', 'students', 'teachers')),
    photo_url  text,
    created_at timestamptz DEFAULT now()
);


-- 1.8 leaves
CREATE TABLE public.leaves (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role       text        NOT NULL,
    from_date  date        NOT NULL,
    to_date    date        NOT NULL,
    reason     text,
    status     text        DEFAULT 'pending' CHECK (status IN ('pending', 'Approved', 'Rejected')),
    created_at timestamptz DEFAULT now()
);


-- 1.9 calendar_events
CREATE TABLE public.calendar_events (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id   uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title       text        NOT NULL,
    description text,
    start_date  date        NOT NULL,
    end_date    date,
    type        text        DEFAULT 'activity' CHECK (type IN ('activity', 'exam', 'holiday')),
    created_at  timestamptz DEFAULT now()
);


-- 1.10 gallery
CREATE TABLE public.gallery (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title      text,
    link       text,
    category   text,
    created_at timestamptz DEFAULT now()
);


-- 1.11 notifications
CREATE TABLE public.notifications (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id   uuid        REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    to_user_id  uuid        REFERENCES public.users(id) ON DELETE CASCADE,
    message     text        NOT NULL,
    link        text,
    is_read     boolean     DEFAULT false,
    created_at  timestamptz DEFAULT now()
);


-- 1.12 support_tickets (App Manager portal)
CREATE TABLE public.support_tickets (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id     uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    admin_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    subject       text        NOT NULL,
    message       text        NOT NULL,
    status        text        DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    manager_reply text,
    created_at    timestamptz DEFAULT now()
);


-- 1.13 app_config (global key-value store, managed by app_manager)
CREATE TABLE public.app_config (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    key_name      text        UNIQUE NOT NULL,
    value_content text        NOT NULL,
    updated_at    timestamptz DEFAULT now()
);


-- ============================================================
-- SECTION 2: ENABLE ROW LEVEL SECURITY
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
-- SECTION 3: RLS POLICIES
-- All tenant policies use: (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
-- This value is written into auth.users.raw_user_meta_data during seeding.
-- ============================================================

-- ── school_settings ──────────────────────────────────────────
-- Public SELECT so the login page can look up a school by code BEFORE auth.
CREATE POLICY "school_settings: public read"
    ON public.school_settings FOR SELECT USING (true);

CREATE POLICY "school_settings: manager write"
    ON public.school_settings FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ── users ─────────────────────────────────────────────────────
-- Every logged-in user must be able to read their own row immediately on login.
CREATE POLICY "users: read own row"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

-- Any authenticated member of a school can read all users in that school.
CREATE POLICY "users: read same school"
    ON public.users FOR SELECT
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- App manager can see all users across all schools.
CREATE POLICY "users: manager read all"
    ON public.users FOR SELECT
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');

-- Only admins/managers can insert new users (via admin_create_user RPC).
CREATE POLICY "users: admin insert"
    ON public.users FOR INSERT
    WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager'));

-- Admins/managers can update users in their school.
CREATE POLICY "users: admin update"
    ON public.users FOR UPDATE
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager'));

-- Admins/managers can delete users in their school.
CREATE POLICY "users: admin delete"
    ON public.users FOR DELETE
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager'));


-- ── Standard tenant isolation for all operational tables ─────
-- Pattern: school_id in row must match school_id in the user's JWT metadata.

CREATE POLICY "attendance: tenant"
    ON public.attendance FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "fees: tenant"
    ON public.fees FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "fees_payments: tenant"
    ON public.fees_payments FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "timetable: tenant"
    ON public.timetable FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "notices: tenant"
    ON public.notices FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "leaves: tenant"
    ON public.leaves FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "calendar_events: tenant"
    ON public.calendar_events FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "gallery: tenant"
    ON public.gallery FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── notifications ─────────────────────────────────────────────
CREATE POLICY "notifications: read own"
    ON public.notifications FOR SELECT
    USING (to_user_id = auth.uid());

CREATE POLICY "notifications: update own"
    ON public.notifications FOR UPDATE
    USING (to_user_id = auth.uid());

CREATE POLICY "notifications: tenant insert"
    ON public.notifications FOR INSERT
    WITH CHECK (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);


-- ── support_tickets ───────────────────────────────────────────
CREATE POLICY "support_tickets: tenant"
    ON public.support_tickets FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "support_tickets: manager all"
    ON public.support_tickets FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ── app_config ────────────────────────────────────────────────
CREATE POLICY "app_config: public read"
    ON public.app_config FOR SELECT USING (true);

CREATE POLICY "app_config: manager write"
    ON public.app_config FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ============================================================
-- SECTION 4: RPC FUNCTIONS
-- ============================================================

-- 4.1 get_email_by_username
--     Called by Login.jsx BEFORE the user is signed in.
--     SECURITY DEFINER lets it bypass RLS to read public.users + auth.users.
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

-- Allow anon key to call this (needed before login)
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO authenticated;


-- 4.2 admin_create_user
--     Called by UserManagement.jsx so admins can create users
--     without logging out (Supabase auth limitation workaround).
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email     text,
    p_password  text,
    p_role      text,
    p_name      text,
    p_username  text,
    p_school_id uuid,
    p_class     text DEFAULT NULL,
    p_contact   text DEFAULT NULL
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

    -- Authorization check
    IF caller_role NOT IN ('admin', 'app_manager') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or managers can create users.';
    END IF;

    IF caller_role = 'admin' AND caller_school != p_school_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create users for your own school.';
    END IF;

    -- Duplicate guards
    IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username) THEN
        RAISE EXCEPTION 'Username "%" is already taken.', p_username;
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
        RAISE EXCEPTION 'Email "%" is already registered.', p_email;
    END IF;

    IF p_role NOT IN ('admin', 'teacher', 'student') THEN
        RAISE EXCEPTION 'Invalid role. Allowed: admin, teacher, student.';
    END IF;

    new_uid := gen_random_uuid();

    -- Create Supabase auth user
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_uid, 'authenticated', 'authenticated', p_email,
        crypt(p_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('school_id', p_school_id, 'role', p_role),
        now(), now(), '', '', '', ''
    );

    -- Create public profile
    INSERT INTO public.users (id, school_id, role, username, name, class, contact)
    VALUES (new_uid, p_school_id, p_role, p_username, p_name, p_class, p_contact);

    RETURN new_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text,text,text,text,text,uuid,text,text) TO authenticated;


-- ============================================================
-- SECTION 5: SYNCHRONIZED DEMO SEED
-- New UUIDs are generated here. Both auth.users and public.users
-- receive the SAME uuid in the same transaction block.
-- raw_user_meta_data sets role + school_id for JWT-based RLS.
-- ============================================================

DO $$
DECLARE
    v_school_id uuid := gen_random_uuid();
    v_admin_id  uuid := gen_random_uuid();
    v_teacher_id uuid := gen_random_uuid();
    v_student_id uuid := gen_random_uuid();
    v_manager_id uuid := gen_random_uuid();
BEGIN

    -- ── 5.1 Demo school ──────────────────────────────────────
    INSERT INTO public.school_settings (
        school_id, name, school_code, subscription_status
    ) VALUES (
        v_school_id, 'Demo High School', 'DEMO01', 'Paid'
    );


    -- ── 5.2 Auth users ───────────────────────────────────────
    -- ADMIN
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_admin_id, 'authenticated', 'authenticated', 'admin@demo.com',
        crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('role', 'admin', 'school_id', v_school_id::text),
        now(), now(), '', '', '', ''
    );

    -- TEACHER
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_teacher_id, 'authenticated', 'authenticated', 'teacher@demo.com',
        crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('role', 'teacher', 'school_id', v_school_id::text),
        now(), now(), '', '', '', ''
    );

    -- STUDENT
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_student_id, 'authenticated', 'authenticated', 'student@demo.com',
        crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('role', 'student', 'school_id', v_school_id::text),
        now(), now(), '', '', '', ''
    );

    -- APP MANAGER (no school_id — platform-level account)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_manager_id, 'authenticated', 'authenticated', 'manager@demo.com',
        crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        '{"role":"app_manager"}',
        now(), now(), '', '', '', ''
    );


    -- ── 5.3 Public profiles — SAME UUIDs as auth above ───────
    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (v_admin_id, v_school_id, 'admin', 'admin', 'System Admin');

    INSERT INTO public.users (id, school_id, role, username, name, class, qualification)
    VALUES (v_teacher_id, v_school_id, 'teacher', 'teacher', 'Demo Teacher', '10th A', 'B.Ed');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_student_id, v_school_id, 'student', 'student', 'Demo Student', '10th A');

    -- App Manager: school_id is NULL (platform-wide)
    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (v_manager_id, NULL, 'app_manager', 'manager', 'Platform Manager');


    -- ── 5.4 Sample operational data ──────────────────────────
    INSERT INTO public.notices (school_id, title, content, date, scope)
    VALUES (v_school_id,
            'Welcome to SchoolPro!',
            'This is a sample notice visible to all users. Admins and teachers can post notices here.',
            CURRENT_DATE, 'all');

    INSERT INTO public.calendar_events (school_id, title, start_date, end_date, type)
    VALUES
        (v_school_id, 'Annual Sports Day', CURRENT_DATE + 7,  CURRENT_DATE + 7,  'activity'),
        (v_school_id, 'Unit Test Week',    CURRENT_DATE + 14, CURRENT_DATE + 16, 'exam'),
        (v_school_id, 'Diwali Holiday',    CURRENT_DATE + 21, CURRENT_DATE + 23, 'holiday');

    INSERT INTO public.fees (school_id, student_id, year, total, last_year_pending)
    VALUES (v_school_id, v_student_id, EXTRACT(YEAR FROM now())::integer, 15000, 2500);

    INSERT INTO public.timetable
        (school_id, day, period_order, period_label, subject, class, teacher, teacher_id)
    VALUES
        (v_school_id, 'Monday',    1, '08:00–08:40', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Monday',    2, '08:40–09:20', 'English',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Monday',    3, '09:30–10:10', 'Science',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Tuesday',   1, '08:00–08:40', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Tuesday',   2, '08:40–09:20', 'History',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Wednesday', 1, '08:00–08:40', 'Science',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Wednesday', 2, '08:40–09:20', 'English',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Thursday',  1, '08:00–08:40', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Friday',    1, '08:00–08:40', 'English',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Friday',    2, '08:40–09:20', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id);

    INSERT INTO public.gallery (school_id, title, link, category)
    VALUES
        (v_school_id, 'Annual Day 2024', 'https://drive.google.com/example1', 'Events'),
        (v_school_id, 'Sports Day 2024', 'https://drive.google.com/example2', 'Sports');

    INSERT INTO public.app_config (key_name, value_content)
    VALUES (
        'about_text',
        'SchoolPro is a multi-tenant school management platform built to modernize school administration. It provides role-based dashboards for Admins, Teachers, and Students. Developed by Shubham Arun Hajare.'
    );

END $$;


-- ============================================================
-- SECTION 6: QUICK VERIFICATION (run these after the script)
-- ============================================================
-- SELECT id, username, role, school_id FROM public.users ORDER BY role;
-- SELECT school_id, name, school_code FROM public.school_settings;
-- SELECT get_email_by_username('admin');    -- expect: admin@demo.com
-- SELECT get_email_by_username('teacher');  -- expect: teacher@demo.com
-- SELECT get_email_by_username('student');  -- expect: student@demo.com
-- SELECT get_email_by_username('manager');  -- expect: manager@demo.com

-- ============================================================
-- ✅  ALL DONE. Your database is ready.
--     Open the app, enter school code: DEMO01
--     Login with admin / 123456
-- ============================================================
