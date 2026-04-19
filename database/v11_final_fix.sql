-- ============================================================
-- V11: SCHOOLPRO — DEFINITIVE FIX
-- ============================================================
-- This script handles EVERY scenario:
--   ✅ Truly empty database
--   ✅ Partially created tables from failed v10 run
--   ✅ Leftover ownership issues
--   ✅ ZERO DDL on auth.* schema (no ALTER, no ENABLE RLS, no CREATE POLICY)
-- ============================================================


-- ============================================================
-- STEP 0: CLEANUP — Fix ownership & drop any leftover tables
-- The previous v10 run may have created some tables before crashing.
-- We must reclaim ownership before we can drop them.
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
              'support_tickets','notifications','fees_payments','fees',
              'attendance','leaves','timetable','notices','gallery',
              'calendar_events','app_config','users','school_settings'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', t);
        RAISE NOTICE 'Reclaimed ownership of: %', t;
    END LOOP;
END $$;

-- Now safely drop any leftovers (children first, parents last)
DROP TABLE IF EXISTS public.support_tickets  CASCADE;
DROP TABLE IF EXISTS public.notifications    CASCADE;
DROP TABLE IF EXISTS public.fees_payments    CASCADE;
DROP TABLE IF EXISTS public.fees             CASCADE;
DROP TABLE IF EXISTS public.attendance       CASCADE;
DROP TABLE IF EXISTS public.leaves           CASCADE;
DROP TABLE IF EXISTS public.timetable        CASCADE;
DROP TABLE IF EXISTS public.notices          CASCADE;
DROP TABLE IF EXISTS public.gallery          CASCADE;
DROP TABLE IF EXISTS public.calendar_events  CASCADE;
DROP TABLE IF EXISTS public.app_config       CASCADE;
DROP TABLE IF EXISTS public.users            CASCADE;
DROP TABLE IF EXISTS public.school_settings  CASCADE;

-- Drop any leftover functions
DROP FUNCTION IF EXISTS public.get_email_by_username(text);
DROP FUNCTION IF EXISTS public.admin_create_user(text,text,text,text,text,uuid,text,text);


-- ============================================================
-- STEP 1: CREATE ALL 13 TABLES
-- No FK references to auth.users anywhere. Plain uuid columns.
-- ============================================================

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

CREATE TABLE public.users (
    id            uuid        PRIMARY KEY,
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

CREATE TABLE public.attendance (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role       text,
    date       date        NOT NULL,
    status     text        CHECK (status IN ('Present', 'Absent', 'Late', 'Half_day', 'Leave')),
    marked_by  uuid,
    created_at timestamptz DEFAULT now(),
    UNIQUE (school_id, user_id, date)
);

CREATE TABLE public.fees (
    id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id         uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    student_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    year              integer     NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer,
    total             numeric     DEFAULT 0,
    last_year_pending numeric     DEFAULT 0,
    created_at        timestamptz DEFAULT now()
);

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

CREATE TABLE public.gallery (
    id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title      text,
    link       text,
    category   text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id   uuid        REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    to_user_id  uuid        REFERENCES public.users(id) ON DELETE CASCADE,
    message     text        NOT NULL,
    link        text,
    is_read     boolean     DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

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

CREATE TABLE public.app_config (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    key_name      text        UNIQUE NOT NULL,
    value_content text        NOT NULL,
    updated_at    timestamptz DEFAULT now()
);


-- ============================================================
-- STEP 2: ENABLE RLS (public schema tables ONLY)
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
-- STEP 3: RLS POLICIES (public schema ONLY)
-- ============================================================

-- school_settings: public read (needed for login page school code lookup)
CREATE POLICY "school_settings: public read"
    ON public.school_settings FOR SELECT USING (true);

CREATE POLICY "school_settings: manager write"
    ON public.school_settings FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');

-- users
CREATE POLICY "users: read own row"
    ON public.users FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users: read same school"
    ON public.users FOR SELECT
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "users: manager read all"
    ON public.users FOR SELECT
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');

CREATE POLICY "users: admin insert"
    ON public.users FOR INSERT
    WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager'));

CREATE POLICY "users: admin update"
    ON public.users FOR UPDATE
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager'));

CREATE POLICY "users: admin delete"
    ON public.users FOR DELETE
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager'));

-- Tenant isolation (one policy per operational table)
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

-- notifications
CREATE POLICY "notifications: read own"
    ON public.notifications FOR SELECT USING (to_user_id = auth.uid());

CREATE POLICY "notifications: update own"
    ON public.notifications FOR UPDATE USING (to_user_id = auth.uid());

CREATE POLICY "notifications: tenant insert"
    ON public.notifications FOR INSERT
    WITH CHECK (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- support_tickets
CREATE POLICY "support_tickets: tenant"
    ON public.support_tickets FOR ALL
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "support_tickets: manager all"
    ON public.support_tickets FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');

-- app_config
CREATE POLICY "app_config: public read"
    ON public.app_config FOR SELECT USING (true);

CREATE POLICY "app_config: manager write"
    ON public.app_config FOR ALL
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');


-- ============================================================
-- STEP 4: RPC FUNCTIONS
-- ============================================================

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
    new_uid       uuid;
    caller_role   text;
    caller_school uuid;
BEGIN
    caller_role   := (auth.jwt() -> 'user_metadata' ->> 'role');
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
        RAISE EXCEPTION 'Invalid role. Allowed: admin, teacher, student.';
    END IF;

    new_uid := gen_random_uuid();

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

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), new_uid, p_email,
        jsonb_build_object('sub', new_uid::text, 'email', p_email),
        'email', now(), now(), now()
    );

    INSERT INTO public.users (id, school_id, role, username, name, class, contact)
    VALUES (new_uid, p_school_id, p_role, p_username, p_name, p_class, p_contact);

    RETURN new_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text,text,text,text,text,uuid,text,text) TO authenticated;


-- ============================================================
-- STEP 5: SYNCHRONIZED DEMO SEED
-- Inserts into auth.users (DML only) + auth.identities + public.users
-- ============================================================

DO $$
DECLARE
    v_school_id  uuid := gen_random_uuid();
    v_admin_id   uuid := gen_random_uuid();
    v_teacher_id uuid := gen_random_uuid();
    v_student_id uuid := gen_random_uuid();
    v_manager_id uuid := gen_random_uuid();
BEGIN

    -- Demo school
    INSERT INTO public.school_settings (school_id, name, school_code, subscription_status)
    VALUES (v_school_id, 'Demo High School', 'DEMO01', 'Paid');

    -- ── ADMIN ────────────────────────────────────────────────
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
    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_admin_id, 'admin@demo.com',
        jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@demo.com'),
        'email', now(), now(), now()
    );

    -- ── TEACHER ──────────────────────────────────────────────
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
    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_teacher_id, 'teacher@demo.com',
        jsonb_build_object('sub', v_teacher_id::text, 'email', 'teacher@demo.com'),
        'email', now(), now(), now()
    );

    -- ── STUDENT ──────────────────────────────────────────────
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
    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_student_id, 'student@demo.com',
        jsonb_build_object('sub', v_student_id::text, 'email', 'student@demo.com'),
        'email', now(), now(), now()
    );

    -- ── APP MANAGER (no school_id) ───────────────────────────
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
    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_manager_id, 'manager@demo.com',
        jsonb_build_object('sub', v_manager_id::text, 'email', 'manager@demo.com'),
        'email', now(), now(), now()
    );


    -- ── PUBLIC PROFILES (same UUIDs) ─────────────────────────
    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (v_admin_id, v_school_id, 'admin', 'admin', 'System Admin');

    INSERT INTO public.users (id, school_id, role, username, name, class, qualification)
    VALUES (v_teacher_id, v_school_id, 'teacher', 'teacher', 'Demo Teacher', '10th A', 'B.Ed');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_student_id, v_school_id, 'student', 'student', 'Demo Student', '10th A');

    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (v_manager_id, NULL, 'app_manager', 'manager', 'Platform Manager');


    -- ── SAMPLE DATA ──────────────────────────────────────────
    INSERT INTO public.notices (school_id, title, content, date, scope)
    VALUES (v_school_id, 'Welcome to SchoolPro!',
            'This is a sample notice. Admins and teachers can post here.',
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
        (v_school_id, 'Monday',    1, '08:00-08:40', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Monday',    2, '08:40-09:20', 'English',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Monday',    3, '09:30-10:10', 'Science',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Tuesday',   1, '08:00-08:40', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Tuesday',   2, '08:40-09:20', 'History',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Wednesday', 1, '08:00-08:40', 'Science',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Thursday',  1, '08:00-08:40', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Friday',    1, '08:00-08:40', 'English',     '10th A', 'Demo Teacher', v_teacher_id),
        (v_school_id, 'Friday',    2, '08:40-09:20', 'Mathematics', '10th A', 'Demo Teacher', v_teacher_id);

    INSERT INTO public.gallery (school_id, title, link, category)
    VALUES
        (v_school_id, 'Annual Day 2024', 'https://drive.google.com/example1', 'Events'),
        (v_school_id, 'Sports Day 2024', 'https://drive.google.com/example2', 'Sports');

    INSERT INTO public.app_config (key_name, value_content)
    VALUES ('about_text',
            'SchoolPro is a multi-tenant school management platform. Developed by Shubham Arun Hajare.');

END $$;


-- ============================================================
-- ✅  DONE. Run these to verify:
-- ============================================================
-- SELECT id, username, role, school_id FROM public.users ORDER BY role;
-- SELECT get_email_by_username('admin');
-- SELECT get_email_by_username('manager');

-- Login:  School Code: DEMO01  |  All passwords: 123456
-- ============================================================
