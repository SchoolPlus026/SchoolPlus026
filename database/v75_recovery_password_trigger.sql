-- ═══════════════════════════════════════════════════════════════════════════
-- v75_recovery_password_trigger.sql
-- Hybrid Recovery System — Password Update Tracker Trigger
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add password_updated_at column to recovery_profiles
ALTER TABLE public.recovery_profiles 
ADD COLUMN IF NOT EXISTS password_updated_at timestamp with time zone;

-- 2. Create the trigger function to track password updates from auth.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if encrypted_password has changed
  IF (TG_OP = 'UPDATE' AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password) THEN
    -- Update or insert password_updated_at in recovery_profiles
    INSERT INTO public.recovery_profiles (user_id, password_updated_at, updated_at)
    VALUES (NEW.id, now(), now())
    ON CONFLICT (user_id) DO UPDATE 
    SET password_updated_at = EXCLUDED.password_updated_at,
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Bind the trigger to auth.users encrypted_password changes
DROP TRIGGER IF EXISTS trg_auth_user_password_change ON auth.users;
CREATE TRIGGER trg_auth_user_password_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_password_change();
