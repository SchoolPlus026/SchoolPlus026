-- ---------------------------------------------------------------------------
-- v100_auth_email_lookup_fix.sql
-- Fix get_email_by_username to read from public.users.email (synced table)
-- instead of querying auth.users directly, eliminating stale email lookups.
-- ---------------------------------------------------------------------------

-- 1. Fix get_email_by_username to read from public.users.email
--    public.users.email is kept in sync by trg_sync_auth_user_email trigger.
--    Reading from public.users is faster and avoids cross-schema auth lookup failures.
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text;
BEGIN
    SELECT email INTO v_email
    FROM public.users
    WHERE LOWER(username) = LOWER(p_username)
    LIMIT 1;

    RETURN v_email; -- Returns NULL if not found (handled by Login.jsx)
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO authenticated;

-- 2. Ensure the email sync trigger handles ALL email updates robustly
--    This replaces the v99 version with a more defensive implementation.
CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Only sync if email actually changed (avoids unnecessary writes)
  IF OLD IS NULL OR OLD.email IS DISTINCT FROM NEW.email THEN

    -- 1. Sync to public.users
    UPDATE public.users
    SET email = NEW.email
    WHERE id = NEW.id;

    -- 2. Sync to auth.identities (only for email/password provider logins)
    UPDATE auth.identities
    SET identity_data = identity_data || jsonb_build_object('email', NEW.email),
        provider_id = NEW.email
    WHERE user_id = NEW.id AND provider = 'email';

  END IF;

  RETURN NEW;
END;
$$;

-- 3. Rebind the trigger
DROP TRIGGER IF EXISTS trg_sync_auth_user_email ON auth.users;
CREATE TRIGGER trg_sync_auth_user_email
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_email_from_auth();

-- 4. Backfill: ensure all existing users have their public.users.email populated
--    from auth.users in case any rows were missed by previous trigger versions.
UPDATE public.users pu
SET email = au.email
FROM auth.users au
WHERE pu.id = au.id
  AND (pu.email IS NULL OR pu.email != au.email);

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
