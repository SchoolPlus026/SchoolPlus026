-- ============================================================
-- v26_app_versions.sql
-- In-App Update System: app_versions table
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── 1. Create the Table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_versions (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_code  integer     NOT NULL,               -- e.g. 2  (must be monotonically increasing)
  version_name  text        NOT NULL,               -- e.g. "1.1.0"
  apk_url       text        NOT NULL,               -- Direct download URL for the APK
  release_notes text        DEFAULT '',             -- Optional changelog shown in the modal
  is_critical   boolean     NOT NULL DEFAULT false, -- If true → modal cannot be dismissed
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Index for fast "latest version" queries ──────────────
CREATE INDEX IF NOT EXISTS idx_app_versions_code
  ON public.app_versions (version_code DESC);

-- ─── 3. Row Level Security ───────────────────────────────────
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ (to check for updates)
CREATE POLICY "app_versions: authenticated read"
  ON public.app_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- Only platform_admins can INSERT / UPDATE / DELETE
CREATE POLICY "app_versions: platform_admin write"
  ON public.app_versions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role = 'platform_admin'
    )
  );

-- ─── 4. Seed the current version (v1.0.0) ────────────────────
-- This establishes the baseline so existing installs don't
-- immediately get prompted. Update apk_url to your actual
-- GitHub Actions artifact URL or CDN link.
INSERT INTO public.app_versions (version_code, version_name, apk_url, release_notes, is_critical)
VALUES (
  1,
  '1.0.0',
  'https://github.com/schoolpro026-svg/SchoolPro/releases/latest',
  'Initial release with FCM push notifications.',
  false
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- HOW TO PUBLISH A NEW UPDATE (Platform Admin):
--
--   INSERT INTO app_versions (version_code, version_name, apk_url, release_notes, is_critical)
--   VALUES (2, '1.1.0', 'https://your-apk-cdn.com/schoolos-v1.1.0.apk',
--           'Bug fixes, performance improvements.', false);
--
-- The app fetches MAX(version_code) to find the latest version.
-- Set is_critical = true to show a non-dismissible modal.
-- ============================================================
