-- ==========================================
-- V6: NOTIFICATIONS MODULE & DEMO USER SEED (SUPABASE COMPATIBLE)
-- ==========================================

-- 1. Create Notifications Table (Restored from Legacy)
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    to_user text NOT NULL, -- We will use email here
    message text NOT NULL,
    link text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Safely add RLS and Policies
DO $$ 
BEGIN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own notifications') THEN
        CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT 
        USING (to_user = (auth.jwt() ->> 'email'));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own notifications') THEN
        CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE 
        USING (to_user = (auth.jwt() ->> 'email'));
    END IF;
END $$;

-- 2. Seed Demo Database Configuration (Idempotent)
DO $$
DECLARE
    target_school_id uuid;
    admin_uuid uuid;
    teacher_uuid uuid;
    student_uuid uuid;
BEGIN
    -- Ensure the DEMO01 school exists and capture its ID
    INSERT INTO public.school_settings (name, school_code, subscription_status)
    VALUES ('Demo High School', 'DEMO01', 'Paid')
    ON CONFLICT (school_code) DO UPDATE 
    SET name = EXCLUDED.name, subscription_status = EXCLUDED.subscription_status
    RETURNING school_id INTO target_school_id;

    -- 3. DEMO ADMIN SETUP
    -- First try to find existing user by username in public.users
    SELECT id INTO admin_uuid FROM public.users WHERE username = 'admin';
    -- Fallback to auth.users if not found
    IF admin_uuid IS NULL THEN
        SELECT id INTO admin_uuid FROM auth.users WHERE email = 'admin@demo.com';
    END IF;
    IF admin_uuid IS NULL THEN
        admin_uuid := gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_uuid) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', admin_uuid, 'authenticated', 'authenticated', 
            'admin@demo.com', crypt('123456', gen_salt('bf')), timezone('utc'::text, now()), 
            '{"provider": "email", "providers": ["email"]}', 
            jsonb_build_object('school_id', target_school_id, 'role', 'admin'),
            timezone('utc'::text, now()), timezone('utc'::text, now()), '', '', '', ''
        );
    ELSE
        UPDATE auth.users 
        SET encrypted_password = crypt('123456', gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object('school_id', target_school_id, 'role', 'admin'),
            updated_at = timezone('utc'::text, now())
        WHERE id = admin_uuid;
    END IF;

    -- We now know admin_uuid is correctly aligned with the existing username if it existed
    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (admin_uuid, target_school_id, 'admin', 'admin', 'System Admin')
    ON CONFLICT (id) DO UPDATE 
    SET school_id = EXCLUDED.school_id, role = EXCLUDED.role, name = EXCLUDED.name;


    -- 4. DEMO TEACHER SETUP
    SELECT id INTO teacher_uuid FROM public.users WHERE username = 'teacher';
    IF teacher_uuid IS NULL THEN
        SELECT id INTO teacher_uuid FROM auth.users WHERE email = 'teacher@demo.com';
    END IF;
    IF teacher_uuid IS NULL THEN
        teacher_uuid := gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = teacher_uuid) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', teacher_uuid, 'authenticated', 'authenticated', 
            'teacher@demo.com', crypt('123456', gen_salt('bf')), timezone('utc'::text, now()), 
            '{"provider": "email", "providers": ["email"]}', 
            jsonb_build_object('school_id', target_school_id, 'role', 'teacher'),
            timezone('utc'::text, now()), timezone('utc'::text, now()), '', '', '', ''
        );
    ELSE
        UPDATE auth.users 
        SET encrypted_password = crypt('123456', gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object('school_id', target_school_id, 'role', 'teacher'),
            updated_at = timezone('utc'::text, now())
        WHERE id = teacher_uuid;
    END IF;

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (teacher_uuid, target_school_id, 'teacher', 'teacher', 'Demo Teacher', '10th A')
    ON CONFLICT (id) DO UPDATE 
    SET school_id = EXCLUDED.school_id, role = EXCLUDED.role, name = EXCLUDED.name, class = EXCLUDED.class;


    -- 5. DEMO STUDENT SETUP
    SELECT id INTO student_uuid FROM public.users WHERE username = 'student';
    IF student_uuid IS NULL THEN
        SELECT id INTO student_uuid FROM auth.users WHERE email = 'student@demo.com';
    END IF;
    IF student_uuid IS NULL THEN
        student_uuid := gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = student_uuid) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', student_uuid, 'authenticated', 'authenticated', 
            'student@demo.com', crypt('123456', gen_salt('bf')), timezone('utc'::text, now()), 
            '{"provider": "email", "providers": ["email"]}', 
            jsonb_build_object('school_id', target_school_id, 'role', 'student'),
            timezone('utc'::text, now()), timezone('utc'::text, now()), '', '', '', ''
        );
    ELSE
        UPDATE auth.users 
        SET encrypted_password = crypt('123456', gen_salt('bf')),
            raw_user_meta_data = jsonb_build_object('school_id', target_school_id, 'role', 'student'),
            updated_at = timezone('utc'::text, now())
        WHERE id = student_uuid;
    END IF;

    INSERT INTO public.users (id, school_id, role, username, name, class)
    VALUES (student_uuid, target_school_id, 'student', 'student', 'Demo Student', '10th A')
    ON CONFLICT (id) DO UPDATE 
    SET school_id = EXCLUDED.school_id, role = EXCLUDED.role, name = EXCLUDED.name, class = EXCLUDED.class;
    
END $$;
