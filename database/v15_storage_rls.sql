-- =====================================================================
-- v15_storage_rls.sql
-- 
-- PURPOSE: Fix RLS policies for the physical 'school_assets' storage bucket.
-- Allows public read access so logos display for everyone, and permits
-- authenticated users (Admins/Managers) to upload and overwrite.
-- =====================================================================

DO $$
BEGIN
    -- 1. Ensure the bucket exists (in case it wasn't created properly)
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('school_assets', 'school_assets', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    -- 2. Grant SELECT access to everyone (public read)
    DROP POLICY IF EXISTS "Public Read Access for Assets" ON storage.objects;
    CREATE POLICY "Public Read Access for Assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'school_assets');

    -- 3. Grant INSERT/UPDATE/DELETE to authenticated users
    DROP POLICY IF EXISTS "Authenticated Users Can Write Assets" ON storage.objects;
    CREATE POLICY "Authenticated Users Can Write Assets"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'school_assets')
    WITH CHECK (bucket_id = 'school_assets');

    RAISE NOTICE '✅ Successfully configured Storage RLS for school_assets bucket.';
END $$;
