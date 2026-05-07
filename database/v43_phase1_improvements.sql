-- ============================================================
-- MIGRATION: v43_phase1_improvements.sql
-- Description:
--   1. Add start_date and expiry_date to announcements for
--      time-bound broadcasts (auto-expire).
--   2. Update the client-facing announcement fetch RLS/view
--      to only return broadcasts within their active window.
-- ============================================================

-- 1. Add scheduling columns to announcements
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS start_date  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expiry_date timestamptz DEFAULT NULL;

-- 2. Drop and recreate the RLS SELECT policy so users only
--    see broadcasts that are currently active (within window).
--    Service role (Platform Admin dashboard) still sees all rows.

-- Announcements already has RLS enabled. We just update policy:
DROP POLICY IF EXISTS "Allow all users to read announcements" ON public.announcements;

CREATE POLICY "Allow users to read active announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    -- No expiry set → show forever (backwards compat)
    expiry_date IS NULL
    OR
    -- Within the active window
    (now() >= COALESCE(start_date, created_at) AND now() <= expiry_date)
  );

-- 3. Grant platform_admin full access (service role bypasses RLS anyway,
--    but this keeps policies tidy for dashboard reads using anon/user key)
DROP POLICY IF EXISTS "Platform admin manages announcements" ON public.announcements;

CREATE POLICY "Platform admin manages announcements"
  ON public.announcements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- 4. Index for performance on the date-range filter
CREATE INDEX IF NOT EXISTS idx_announcements_dates
  ON public.announcements (start_date, expiry_date);

COMMENT ON COLUMN public.announcements.start_date  IS 'When this broadcast becomes visible to users.';
COMMENT ON COLUMN public.announcements.expiry_date IS 'When this broadcast stops being visible. NULL = show forever.';
