-- ============================================================
-- V16: FIX SCHOOL SETTINGS RLS (LOGO/NAME PERSISTENCE)
-- ============================================================
-- Problem: 
-- The previous RLS policies for `public.school_settings` only granted
-- write permissions to the `app_manager`. Admins could read settings 
-- (public read policy), but `UPDATE` queries for logo_url or name 
-- failed silently (0 rows updated), leading to the logo disappearing 
-- on refresh.
-- 
-- Fix: 
-- Add a targeted RLS policy that allows `admin` users to update 
-- strictly their own school's row.
-- ============================================================

-- Grant UPDATE access to the school's admin
CREATE POLICY "school_settings: admin update"
ON public.school_settings
FOR UPDATE
USING (
  school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Note: Ensure row level security is already enabled (it is by default from v10)
-- ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
