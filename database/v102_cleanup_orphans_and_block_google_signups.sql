-- ═══════════════════════════════════════════════════════════════════════════
-- v102_cleanup_orphans_and_block_google_signups.sql
-- Clean up orphaned Google signups and restrict new signups to pre-registered users
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Delete all existing orphaned Google auth users who don't have a profile in public.users
DELETE FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
) AND (au.raw_app_meta_data->>'provider' = 'google' OR au.raw_app_meta_data->>'providers' LIKE '%google%');

-- 2. Create trigger to block new Google OAuth registrations if the email is not in public.users
CREATE OR REPLACE FUNCTION public.check_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- If it's an OAuth/Google signup (and not email/password created by admin)
  IF NEW.raw_app_meta_data->>'provider' != 'email' THEN
    -- Check if this email exists in public.users
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE email = LOWER(NEW.email)) THEN
      RAISE EXCEPTION 'Signup is disabled. Only pre-registered users can sign in with Google.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_new_auth_user ON auth.users;
CREATE TRIGGER trg_check_new_auth_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_new_auth_user();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
