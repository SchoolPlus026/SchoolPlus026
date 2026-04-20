-- ============================================================
-- V13-FIX: ADMIN120 ACCOUNT REPAIR
-- Run this if V13 failed or admin120 can't log in.
-- This script safely upserts the admin120 auth account.
-- ============================================================

DO $$
DECLARE
    v_school_id uuid;
    v_admin_id  uuid := gen_random_uuid();
    existing_id uuid;
BEGIN
    -- 1. Find the school_id for school code '120'
    SELECT school_id INTO v_school_id
    FROM public.school_settings
    WHERE school_code = '120'
    LIMIT 1;

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'School with code 120 not found. Please run v13_legacy_migration.sql first.';
    END IF;

    -- 2. Check if admin120 already exists in auth.users
    SELECT id INTO existing_id FROM auth.users WHERE email = 'admin120@school.com' LIMIT 1;

    IF existing_id IS NOT NULL THEN
        -- Account exists but password may be wrong — reset it
        UPDATE auth.users
        SET encrypted_password = crypt('123456', gen_salt('bf')),
            email_confirmed_at = now(),
            updated_at = now(),
            raw_user_meta_data = jsonb_build_object('role', 'admin', 'school_id', v_school_id::text)
        WHERE id = existing_id;

        RAISE NOTICE 'admin120 auth account updated. Password reset to 123456.';

        -- Ensure identity row exists
        IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = existing_id AND provider = 'email') THEN
            INSERT INTO auth.identities (
                id, user_id, provider_id, identity_data, provider, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), existing_id, 'admin120@school.com',
                jsonb_build_object('sub', existing_id::text, 'email', 'admin120@school.com'),
                'email', now(), now()
            );
            RAISE NOTICE 'admin120 identity row created.';
        END IF;

        -- Ensure public.users row exists
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = existing_id) THEN
            INSERT INTO public.users (id, school_id, role, username, name)
            VALUES (existing_id, v_school_id, 'admin', 'admin120', 'School Admin 120');
            RAISE NOTICE 'admin120 public.users profile created.';
        END IF;

    ELSE
        -- Account does not exist — create it fresh
        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_admin_id, 'authenticated', 'authenticated', 'admin120@school.com',
            crypt('123456', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('role', 'admin', 'school_id', v_school_id::text),
            now(), now(), '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_admin_id, 'admin120@school.com',
            jsonb_build_object('sub', v_admin_id::text, 'email', 'admin120@school.com'),
            'email', now(), now()
        );

        -- Only insert public.users if not already there (from a partial run)
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE username = 'admin120') THEN
            INSERT INTO public.users (id, school_id, role, username, name)
            VALUES (v_admin_id, v_school_id, 'admin', 'admin120', 'School Admin 120');
        END IF;

        RAISE NOTICE 'admin120 auth account created fresh. Password: 123456';
    END IF;

END $$;

-- ============================================================
-- VERIFICATION — Run these after:
-- SELECT u.email, u.email_confirmed_at, p.role, p.school_id
-- FROM auth.users u JOIN public.users p ON p.id = u.id
-- WHERE u.email = 'admin120@school.com';
-- ============================================================
