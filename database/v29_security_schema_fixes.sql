-- ============================================================
-- v29: Security & Schema Fixes
-- 1. Fix gallery storage bucket RLS (school-isolated uploads)
-- 2. Add subscription_tier column to school_settings (fixes Add School crash)
-- ============================================================

-- ── 1. Fix Gallery Storage RLS ────────────────────────────────
-- OLD policy allowed ANY authenticated user to upload to gallery (no school isolation).
-- NEW policy restricts uploads to the user's own school_id folder path.

DROP POLICY IF EXISTS "Allow authenticated uploads to gallery" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of gallery" ON storage.objects;

-- Users can only upload to their own school's folder: {school_id}/filename
CREATE POLICY "School-isolated gallery uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'school_id')
);

-- Users can only update/delete their own school's gallery files
CREATE POLICY "School-isolated gallery management"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'school_id')
);

CREATE POLICY "School-isolated gallery delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'school_id')
);

-- Public read remains open (gallery images are public-facing)
CREATE POLICY "Public read of gallery"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'gallery');


-- ── 2. Add subscription_tier to school_settings ───────────────
-- The Add School modal collected this field but the column didn't exist.
-- This caused silent INSERT failures.
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'Free'
  CHECK (subscription_tier IN ('Free', 'Premium', 'Enterprise'));

-- ── 3. Add gdrive_config column if missing ────────────────────
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS gdrive_config jsonb;
