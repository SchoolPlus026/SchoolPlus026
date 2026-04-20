-- ============================================================
-- V12: SCHEMA UPDATES, ROLES, NEW FIELDS & STORAGE
-- ============================================================

-- 1. DYNAMIC ROLES (Add 'staff')
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'student', 'app_manager', 'staff'));

-- 2. NEW FIELDS
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS designation text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dob date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS blood_group text;

-- 3. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) 
VALUES ('school_assets', 'school_assets', true) 
ON CONFLICT (id) DO NOTHING;

-- Storage public read policy
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'school_assets' );

-- Storage admin write policy
DROP POLICY IF EXISTS "Admin Uploads" ON storage.objects;
CREATE POLICY "Admin Uploads" ON storage.objects FOR INSERT 
WITH CHECK ( 
   bucket_id = 'school_assets' AND 
   (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager') 
);

-- 4. UPDATE RPC FUNCTION (admin_create_user) to accept new fields natively
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email     text,
    p_password  text,
    p_role      text,
    p_name      text,
    p_username  text,
    p_school_id uuid,
    p_class     text DEFAULT NULL,
    p_contact   text DEFAULT NULL,
    p_dob       date DEFAULT NULL,
    p_address   text DEFAULT NULL,
    p_blood_group text DEFAULT NULL,
    p_designation text DEFAULT NULL,
    p_qualification text DEFAULT NULL,
    p_aadhar_card text DEFAULT NULL
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
    IF p_role NOT IN ('admin', 'teacher', 'student', 'staff') THEN
        RAISE EXCEPTION 'Invalid role. Allowed: admin, teacher, student, staff.';
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

    INSERT INTO public.users (
      id, school_id, role, username, name, class, contact,
      dob, address, blood_group, designation, qualification, aadhar_card
    )
    VALUES (
      new_uid, p_school_id, p_role, p_username, p_name, p_class, p_contact,
      p_dob, p_address, p_blood_group, p_designation, p_qualification, p_aadhar_card
    );

    RETURN new_uid;
END;
$$;
