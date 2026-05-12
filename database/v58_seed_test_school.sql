-- ==============================================================================
-- V58: Seed Test School — Global Test Academy
-- All passwords: 123456  |  School Code: GLOBAL01
-- Cross-verified against: v9 (base), v48 (attendance JSONB), v56 (driver role + users columns)
-- ==============================================================================

-- Step 0: Clean up if already seeded
DELETE FROM auth.users WHERE email LIKE '%@globaltest.edu';

DO $$
DECLARE
    v_school_id uuid;
    v_admin_id  uuid := gen_random_uuid();
    v_t1_id     uuid := gen_random_uuid(); -- Teacher, 5th
    v_t2_id     uuid := gen_random_uuid(); -- Teacher, 8th
    v_t3_id     uuid := gen_random_uuid(); -- Teacher, 10th
    v_s1_id     uuid := gen_random_uuid(); -- Student, 5th
    v_s2_id     uuid := gen_random_uuid(); -- Student, 5th
    v_s3_id     uuid := gen_random_uuid(); -- Student, 8th
    v_s4_id     uuid := gen_random_uuid(); -- Student, 10th
    v_s5_id     uuid := gen_random_uuid(); -- Student, 10th
    v_d1_id     uuid := gen_random_uuid(); -- Driver
    v_day text;
    d integer;
BEGIN

    -- ── 1. Create School ──────────────────────────────────────────────────────
    INSERT INTO public.school_settings (name, school_code, subscription_status)
    VALUES ('Global Test Academy', 'GLOBAL01', 'Paid')
    RETURNING school_id INTO v_school_id;

    RAISE NOTICE 'School created: %', v_school_id;


    -- ── Helper: a local procedure-style block to insert auth user + identity ──
    -- auth.users insert (full pattern from v56)
    -- auth.identities is required for Supabase Auth to allow password login

    -- ADMIN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', 'admin@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'admin'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin_id, 'admin@globaltest.edu', jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@globaltest.edu'), 'email', now(), now(), now());

    -- TEACHER 1 (5th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_t1_id, 'authenticated', 'authenticated', 'teacher5@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'teacher', 'class', '5th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_t1_id, 'teacher5@globaltest.edu', jsonb_build_object('sub', v_t1_id::text, 'email', 'teacher5@globaltest.edu'), 'email', now(), now(), now());

    -- TEACHER 2 (8th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_t2_id, 'authenticated', 'authenticated', 'teacher8@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'teacher', 'class', '8th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_t2_id, 'teacher8@globaltest.edu', jsonb_build_object('sub', v_t2_id::text, 'email', 'teacher8@globaltest.edu'), 'email', now(), now(), now());

    -- TEACHER 3 (10th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_t3_id, 'authenticated', 'authenticated', 'teacher10@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'teacher', 'class', '10th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_t3_id, 'teacher10@globaltest.edu', jsonb_build_object('sub', v_t3_id::text, 'email', 'teacher10@globaltest.edu'), 'email', now(), now(), now());

    -- STUDENT 1 (5th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s1_id, 'authenticated', 'authenticated', 'student1@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '5th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_s1_id, 'student1@globaltest.edu', jsonb_build_object('sub', v_s1_id::text, 'email', 'student1@globaltest.edu'), 'email', now(), now(), now());

    -- STUDENT 2 (5th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s2_id, 'authenticated', 'authenticated', 'student2@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '5th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_s2_id, 'student2@globaltest.edu', jsonb_build_object('sub', v_s2_id::text, 'email', 'student2@globaltest.edu'), 'email', now(), now(), now());

    -- STUDENT 3 (8th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s3_id, 'authenticated', 'authenticated', 'student3@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '8th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_s3_id, 'student3@globaltest.edu', jsonb_build_object('sub', v_s3_id::text, 'email', 'student3@globaltest.edu'), 'email', now(), now(), now());

    -- STUDENT 4 (10th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s4_id, 'authenticated', 'authenticated', 'student4@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '10th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_s4_id, 'student4@globaltest.edu', jsonb_build_object('sub', v_s4_id::text, 'email', 'student4@globaltest.edu'), 'email', now(), now(), now());

    -- STUDENT 5 (10th)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s5_id, 'authenticated', 'authenticated', 'student5@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '10th'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_s5_id, 'student5@globaltest.edu', jsonb_build_object('sub', v_s5_id::text, 'email', 'student5@globaltest.edu'), 'email', now(), now(), now());

    -- DRIVER
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_d1_id, 'authenticated', 'authenticated', 'driver@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'driver'), now(), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_d1_id, 'driver@globaltest.edu', jsonb_build_object('sub', v_d1_id::text, 'email', 'driver@globaltest.edu'), 'email', now(), now(), now());


    -- ── 3. Public Users (v56 schema: role allows driver) ──────────────
    INSERT INTO public.users (id, school_id, role, name, username)
    VALUES (v_admin_id, v_school_id, 'admin', 'Global Admin', 'gt_admin');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_t1_id, v_school_id, 'teacher', 'Mrs. Smith', 'gt_teacher5', '5th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_t2_id, v_school_id, 'teacher', 'Mr. Johnson', 'gt_teacher8', '8th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_t3_id, v_school_id, 'teacher', 'Dr. Williams', 'gt_teacher10', '10th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_s1_id, v_school_id, 'student', 'Alice', 'gt_alice', '5th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_s2_id, v_school_id, 'student', 'Bob', 'gt_bob', '5th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_s3_id, v_school_id, 'student', 'Charlie', 'gt_charlie', '8th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_s4_id, v_school_id, 'student', 'David', 'gt_david', '10th');

    INSERT INTO public.users (id, school_id, role, name, username, class)
    VALUES (v_s5_id, v_school_id, 'student', 'Eve', 'gt_eve', '10th');

    INSERT INTO public.users (id, school_id, role, name, username)
    VALUES (v_d1_id, v_school_id, 'driver', 'John Driver', 'gt_driver');


    -- ── 4. Timetable ──────────────────────────────────────────────────────────
    FOR d IN 1..5 LOOP
        v_day := (ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'])[d];
        INSERT INTO public.timetable (school_id, day, period_order, period_label, subject, class, teacher)
        VALUES
            (v_school_id, v_day, 1, 'Period 1', 'Mathematics', '5th',  v_t1_id::text),
            (v_school_id, v_day, 2, 'Period 2', 'English',     '5th',  v_t1_id::text),
            (v_school_id, v_day, 3, 'Period 3', 'Science',     '8th',  v_t2_id::text),
            (v_school_id, v_day, 4, 'Period 4', 'History',     '8th',  v_t2_id::text),
            (v_school_id, v_day, 5, 'Period 5', 'Physics',     '10th', v_t3_id::text),
            (v_school_id, v_day, 6, 'Period 6', 'Chemistry',   '10th', v_t3_id::text);
    END LOOP;


    -- ── 5. Attendance (v48 JSONB schema: school_id, user_id, month_year, attendance_data) ─
    INSERT INTO public.attendance (school_id, user_id, month_year, attendance_data)
    VALUES
        (v_school_id, v_s1_id, to_char(CURRENT_DATE, 'YYYY-MM'), jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'Present')),
        (v_school_id, v_s2_id, to_char(CURRENT_DATE, 'YYYY-MM'), jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'Absent')),
        (v_school_id, v_s3_id, to_char(CURRENT_DATE, 'YYYY-MM'), jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'Present')),
        (v_school_id, v_s4_id, to_char(CURRENT_DATE, 'YYYY-MM'), jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'Present')),
        (v_school_id, v_s5_id, to_char(CURRENT_DATE, 'YYYY-MM'), jsonb_build_object(to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'Late'));


    -- ── 6. Fees (v9 schema: school_id, student_id, year, total, last_year_pending) ─
    INSERT INTO public.fees (school_id, student_id, year, total, last_year_pending)
    VALUES
        (v_school_id, v_s1_id, EXTRACT(YEAR FROM now())::int, 12000, 0),
        (v_school_id, v_s2_id, EXTRACT(YEAR FROM now())::int, 12000, 1500),
        (v_school_id, v_s3_id, EXTRACT(YEAR FROM now())::int, 15000, 0),
        (v_school_id, v_s4_id, EXTRACT(YEAR FROM now())::int, 18000, 2000),
        (v_school_id, v_s5_id, EXTRACT(YEAR FROM now())::int, 18000, 0);


    -- ── 7. Notices (v9 schema: school_id, title, content, date, scope) ────────
    INSERT INTO public.notices (school_id, title, content, date, scope)
    VALUES
        (v_school_id, 'Welcome to Global Test Academy', 'This is a test notice. All dashboards are now seeded and live!', CURRENT_DATE, 'all'),
        (v_school_id, 'Exam Schedule Released', 'Mid-term exams begin next Monday. Prepare accordingly.', CURRENT_DATE, 'students');


    -- ── 8. Calendar Events ────────────────────────────────────────────────────
    INSERT INTO public.calendar_events (school_id, title, start_date, end_date, type)
    VALUES
        (v_school_id, 'Mid-Term Exams',    CURRENT_DATE + 7,  CURRENT_DATE + 10, 'exam'),
        (v_school_id, 'Annual Sports Day', CURRENT_DATE + 20, CURRENT_DATE + 20, 'activity'),
        (v_school_id, 'Diwali Holiday',    CURRENT_DATE + 30, CURRENT_DATE + 32, 'holiday');


    RAISE NOTICE '✅ Done! Global Test Academy seeded. School ID: %', v_school_id;
END $$;

-- ============================================================
-- ✅ Login Credentials (School Code: GLOBAL01)
--   Role        | Email                     | Password
--   Admin       | admin@globaltest.edu      | 123456
--   Teacher     | teacher5@globaltest.edu   | 123456  (5th)
--   Teacher     | teacher8@globaltest.edu   | 123456  (8th)
--   Teacher     | teacher10@globaltest.edu  | 123456  (10th)
--   Student     | student1@globaltest.edu   | 123456  (5th)
--   Student     | student2@globaltest.edu   | 123456  (5th)
--   Student     | student3@globaltest.edu   | 123456  (8th)
--   Student     | student4@globaltest.edu   | 123456  (10th)
--   Student     | student5@globaltest.edu   | 123456  (10th)
--   Driver      | driver@globaltest.edu     | 123456  (no school code)
-- ============================================================
