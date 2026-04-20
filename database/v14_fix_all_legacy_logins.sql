-- =====================================================================
-- v14_fix_all_legacy_logins.sql
-- 
-- PURPOSE: Fix ALL legacy users from school code '120' who cannot log in.
-- The v13 migration inserted auth.users rows without the required empty-string
-- fields (confirmation_token, email_change, etc.), causing signInWithPassword to fail.
--
-- HOW IT WORKS: For each user in public.users for school 120, it deletes the
-- broken auth row and re-creates it cleanly with all required fields.
--
-- SAFE TO RUN: Idempotent — you can run it multiple times without harm.
-- DEFAULT PASSWORD FOR ALL MIGRATED USERS: 123456
-- =====================================================================

DO $$
DECLARE
    v_school_id   uuid;
    v_rec         RECORD;
    v_new_auth_id uuid;
    v_email       text;
BEGIN
    -- Step 1: Find the school
    SELECT school_id INTO v_school_id
    FROM public.school_settings
    WHERE school_code = '120'
    LIMIT 1;

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'School code 120 not found in school_settings. Run v13_legacy_migration.sql first.';
    END IF;

    RAISE NOTICE 'Fixing all users for school_id: %', v_school_id;

    -- Step 2: Loop through every user in public.users for this school
    FOR v_rec IN
        SELECT id, username, name, role FROM public.users WHERE school_id = v_school_id
    LOOP
        v_email := v_rec.username || '@school.com';
        v_new_auth_id := v_rec.id; -- reuse the existing public.users ID

        RAISE NOTICE 'Processing user: % (email: %)', v_rec.username, v_email;

        -- Remove broken auth rows
        DELETE FROM auth.identities WHERE provider_id = v_email;
        DELETE FROM auth.users       WHERE id = v_new_auth_id OR email = v_email;

        -- Re-insert auth.users with ALL required fields
        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_new_auth_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt('123456', gen_salt('bf')),
            now(),
            jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
            jsonb_build_object(
                'role', v_rec.role,
                'school_id', v_school_id::text,
                'name', v_rec.name
            ),
            now(), now(),
            '', '', '', ''  -- ← These 4 fields are critical — v13 missed them
        );

        -- Re-insert auth.identities
        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_new_auth_id,
            v_email,
            jsonb_build_object(
                'sub', v_new_auth_id::text,
                'email', v_email,
                'email_verified', true
            ),
            'email',
            now(), now()
        );

        RAISE NOTICE '  ✓ Fixed: % → Login: % / 123456', v_rec.name, v_email;
    END LOOP;

    RAISE NOTICE '=== ALL DONE. All users in school 120 can now log in with password: 123456 ===';
END $$;
