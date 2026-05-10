-- ==============================================================================
-- V50: CRITICAL BUG FIXES (Notification RLS & User Creation Auth)
-- ==============================================================================

-- 1. FIX: Missing RLS Insert Policy for Notifications
-- Since we moved notification creation from Database Triggers to the Frontend API,
-- teachers and admins were blocked by RLS from inserting into the queue.
DROP POLICY IF EXISTS "Staff can insert notifications" ON public.app_notifications_queue;
CREATE POLICY "Staff can insert notifications" 
ON public.app_notifications_queue FOR INSERT 
WITH CHECK (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'teacher', 'staff', 'app_manager', 'platform_admin')
);

-- Note: Also grant basic access to platform_admin in case it's missing
DROP POLICY IF EXISTS "Platform admin can insert notifications" ON public.app_notifications_queue;
CREATE POLICY "Platform admin can insert notifications" 
ON public.app_notifications_queue FOR INSERT 
WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'platform_admin'
);


-- 2. FIX: Unauthorized Student Creation for Platform Admins
-- The RPC function rejected 'platform_admin' because it only checked for 'app_manager'.
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

    -- FIX: Included 'platform_admin' in the authorization check
    IF caller_role NOT IN ('admin', 'app_manager', 'platform_admin') THEN
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
