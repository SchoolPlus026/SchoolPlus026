-- ==============================================================================
-- V58: Seed Test School — Global Test Academy
-- All passwords: 123456
-- School Code: GLOBAL01
-- Cross-verified against v9_master_factory_reset.sql schema
-- ==============================================================================

-- Step 0: Clean up if this seed was run before
DELETE FROM auth.users WHERE email LIKE '%@globaltest.edu';

DO $$
DECLARE
    v_school_id uuid;
    v_admin_id  uuid := gen_random_uuid();
    v_t1_id     uuid := gen_random_uuid(); -- Teacher 5th
    v_t2_id     uuid := gen_random_uuid(); -- Teacher 8th
    v_t3_id     uuid := gen_random_uuid(); -- Teacher 10th
    v_s1_id     uuid := gen_random_uuid(); -- Student, 5th
    v_s2_id     uuid := gen_random_uuid(); -- Student, 5th
    v_s3_id     uuid := gen_random_uuid(); -- Student, 8th
    v_s4_id     uuid := gen_random_uuid(); -- Student, 10th
    v_s5_id     uuid := gen_random_uuid(); -- Student, 10th
    v_d1_id     uuid := gen_random_uuid(); -- Driver (stored as app_manager role workaround)
    v_day text;
    d integer;
BEGIN

    -- ── 1. Create School ──────────────────────────────────────────────────────
    INSERT INTO public.school_settings (name, school_code, subscription_status)
    VALUES ('Global Test Academy', 'GLOBAL01', 'Paid')
    RETURNING school_id INTO v_school_id;

    RAISE NOTICE 'Created school_id: %', v_school_id;


    -- ── 2. Auth Users (all confirmed, bcrypt password "123456") ───────────────

    -- Admin
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', 'admin@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'admin'), now(), now(), '', '', '', '');

    -- Teacher 1 — 5th class
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_t1_id, 'authenticated', 'authenticated', 'teacher5@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'teacher', 'class', '5th'), now(), now(), '', '', '', '');

    -- Teacher 2 — 8th class
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_t2_id, 'authenticated', 'authenticated', 'teacher8@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'teacher', 'class', '8th'), now(), now(), '', '', '', '');

    -- Teacher 3 — 10th class
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_t3_id, 'authenticated', 'authenticated', 'teacher10@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'teacher', 'class', '10th'), now(), now(), '', '', '', '');

    -- Students
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s1_id, 'authenticated', 'authenticated', 'student1@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '5th'), now(), now(), '', '', '', '');

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s2_id, 'authenticated', 'authenticated', 'student2@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '5th'), now(), now(), '', '', '', '');

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s3_id, 'authenticated', 'authenticated', 'student3@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '8th'), now(), now(), '', '', '', '');

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s4_id, 'authenticated', 'authenticated', 'student4@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '10th'), now(), now(), '', '', '', '');

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_s5_id, 'authenticated', 'authenticated', 'student5@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'student', 'class', '10th'), now(), now(), '', '', '', '');

    -- Driver (stored with role 'student' in public.users as schema only allows admin/teacher/student/app_manager
    -- The JWT metadata carries the real 'driver' role for UI routing)
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_d1_id, 'authenticated', 'authenticated', 'driver@globaltest.edu', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('school_id', v_school_id, 'role', 'driver'), now(), now(), '', '', '', '');


    -- ── 3. Public Users (schema: username required UNIQUE NOT NULL) ───────────
    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (v_admin_id, v_school_id, 'admin', 'gt_admin', 'Global Admin');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_t1_id, v_school_id, 'teacher', 'gt_teacher5', 'Mrs. Smith', '5th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_t2_id, v_school_id, 'teacher', 'gt_teacher8', 'Mr. Johnson', '8th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_t3_id, v_school_id, 'teacher', 'gt_teacher10', 'Dr. Williams', '10th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_s1_id, v_school_id, 'student', 'gt_alice', 'Alice', '5th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_s2_id, v_school_id, 'student', 'gt_bob', 'Bob', '5th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_s3_id, v_school_id, 'student', 'gt_charlie', 'Charlie', '8th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_s4_id, v_school_id, 'student', 'gt_david', 'David', '10th');

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (v_s5_id, v_school_id, 'student', 'gt_eve', 'Eve', '10th');

    -- Driver: not insertable into public.users if CHECK constraint doesn't allow 'driver'.
    -- The driver account uses auth.jwt() role='driver' for routing; no public.users row needed.


    -- ── 4. Timetable (Teacher UUID stored in teacher column) ──────────────────
    -- Teacher 1 (Mrs. Smith) → 5th: Math + English
    -- Teacher 2 (Mr. Johnson) → 8th: Science + History
    -- Teacher 3 (Dr. Williams) → 10th: Physics + Chemistry

    FOR d IN 1..5 LOOP
        v_day := (ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'])[d];

        INSERT INTO public.timetable (school_id, day, period_order, period_label, subject, class, teacher)
        VALUES (v_school_id, v_day, 1, 'Period 1', 'Mathematics', '5th', v_t1_id::text),
               (v_school_id, v_day, 2, 'Period 2', 'English',     '5th', v_t1_id::text),
               (v_school_id, v_day, 3, 'Period 3', 'Science',     '8th', v_t2_id::text),
               (v_school_id, v_day, 4, 'Period 4', 'History',     '8th', v_t2_id::text),
               (v_school_id, v_day, 5, 'Period 5', 'Physics',     '10th', v_t3_id::text),
               (v_school_id, v_day, 6, 'Period 6', 'Chemistry',   '10th', v_t3_id::text);
    END LOOP;


    -- ── 5. Attendance (schema: school_id, user_id, role, date, status) ────────
    INSERT INTO public.attendance (school_id, user_id, role, date, status, marked_by)
    VALUES
        (v_school_id, v_s1_id, 'student', CURRENT_DATE, 'Present', v_t1_id),
        (v_school_id, v_s2_id, 'student', CURRENT_DATE, 'Absent',  v_t1_id),
        (v_school_id, v_s3_id, 'student', CURRENT_DATE, 'Present', v_t2_id),
        (v_school_id, v_s4_id, 'student', CURRENT_DATE, 'Present', v_t3_id),
        (v_school_id, v_s5_id, 'student', CURRENT_DATE, 'Late',    v_t3_id);


    -- ── 6. Fees (schema: school_id, student_id, year, total, last_year_pending) ─
    INSERT INTO public.fees (school_id, student_id, year, total, last_year_pending)
    VALUES
        (v_school_id, v_s1_id, EXTRACT(YEAR FROM now())::int, 12000, 0),
        (v_school_id, v_s2_id, EXTRACT(YEAR FROM now())::int, 12000, 1500),
        (v_school_id, v_s3_id, EXTRACT(YEAR FROM now())::int, 15000, 0),
        (v_school_id, v_s4_id, EXTRACT(YEAR FROM now())::int, 18000, 2000),
        (v_school_id, v_s5_id, EXTRACT(YEAR FROM now())::int, 18000, 0);


    -- ── 7. Notice (schema: school_id, title, content, date, scope) ────────────
    INSERT INTO public.notices (school_id, title, content, date, scope)
    VALUES
        (v_school_id, 'Welcome to Global Test Academy', 'This is a test notice for all users. Dashboards are now live!', CURRENT_DATE, 'all'),
        (v_school_id, 'Exam Schedule Released', 'Mid-term exams begin next Monday. Prepare accordingly.', CURRENT_DATE, 'students');


    -- ── 8. Calendar Events ────────────────────────────────────────────────────
    INSERT INTO public.calendar_events (school_id, title, start_date, end_date, type)
    VALUES
        (v_school_id, 'Mid-Term Exams',      CURRENT_DATE + 7,  CURRENT_DATE + 10, 'exam'),
        (v_school_id, 'Annual Sports Day',   CURRENT_DATE + 20, CURRENT_DATE + 20, 'activity'),
        (v_school_id, 'Diwali Holiday',      CURRENT_DATE + 30, CURRENT_DATE + 32, 'holiday');


    RAISE NOTICE '✅ Global Test Academy seeded successfully!';
    RAISE NOTICE 'School ID: % | School Code: GLOBAL01', v_school_id;

END $$;

-- ============================================================
-- ✅ DONE. Test Login Credentials:
--   School Code : GLOBAL01
--   Role        | Email                      | Password
--   Admin       | admin@globaltest.edu       | 123456
--   Teacher     | teacher5@globaltest.edu    | 123456  (Class 5th)
--   Teacher     | teacher8@globaltest.edu    | 123456  (Class 8th)
--   Teacher     | teacher10@globaltest.edu   | 123456  (Class 10th)
--   Student     | student1@globaltest.edu    | 123456  (Class 5th)
--   Student     | student2@globaltest.edu    | 123456  (Class 5th)
--   Student     | student3@globaltest.edu    | 123456  (Class 8th)
--   Student     | student4@globaltest.edu    | 123456  (Class 10th)
--   Student     | student5@globaltest.edu    | 123456  (Class 10th)
--   Driver      | driver@globaltest.edu      | 123456  (no school code needed)
-- ============================================================
