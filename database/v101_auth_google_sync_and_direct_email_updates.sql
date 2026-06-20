-- ═══════════════════════════════════════════════════════════════════════════
-- v101_auth_google_sync_and_direct_email_updates.sql
-- Direct Email Overwrite RPC & Auto Google Identity Email Synchronization
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create a secure RPC to update email directly without double confirmation
CREATE OR REPLACE FUNCTION public.update_user_email_direct(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Validate email formatting
  IF p_email IS NULL OR p_email NOT LIKE '%@%._%' THEN
    RAISE EXCEPTION 'Invalid email address format.';
  END IF;

  -- Check email uniqueness in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = LOWER(p_email) AND id != auth.uid()) THEN
    RAISE EXCEPTION 'Email "%" is already registered to another account.', p_email;
  END IF;

  -- Update auth.users directly
  UPDATE auth.users
  SET email = LOWER(p_email),
      email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE id = auth.uid();

  -- Update auth.identities for email provider
  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', LOWER(p_email)),
      provider_id = LOWER(p_email)
  WHERE user_id = auth.uid() AND provider = 'email';

  -- Update public.users
  UPDATE public.users
  SET email = LOWER(p_email)
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_email_direct(text) TO authenticated;

-- 2. Create the identity changes synchronization trigger function
CREATE OR REPLACE FUNCTION public.sync_identity_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_username text;
  v_google_email text;
BEGIN
  -- On INSERT/UPDATE of Google identity: Sync Google email directly to user profile
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.provider = 'google' THEN
    v_google_email := NEW.identity_data->>'email';
    IF v_google_email IS NOT NULL THEN
      -- Update auth.users email
      UPDATE auth.users
      SET email = LOWER(v_google_email),
          email_confirmed_at = COALESCE(email_confirmed_at, now())
      WHERE id = NEW.user_id;

      -- Update email provider identity if it exists
      UPDATE auth.identities
      SET identity_data = identity_data || jsonb_build_object('email', LOWER(v_google_email)),
          provider_id = LOWER(v_google_email)
      WHERE user_id = NEW.user_id AND provider = 'email';
      
      -- Update public.users email
      UPDATE public.users
      SET email = LOWER(v_google_email)
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  -- On DELETE of Google identity: Reset email to username@school.internal
  IF TG_OP = 'DELETE' AND OLD.provider = 'google' THEN
    -- Check if another Google identity still exists for safety
    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = OLD.user_id AND provider = 'google') THEN
      SELECT username INTO v_username FROM public.users WHERE id = OLD.user_id;
      IF v_username IS NOT NULL THEN
        -- Revert auth.users email
        UPDATE auth.users
        SET email = LOWER(v_username || '@school.internal')
        WHERE id = OLD.user_id;

        -- Revert email provider identity if exists
        UPDATE auth.identities
        SET identity_data = identity_data || jsonb_build_object('email', LOWER(v_username || '@school.internal')),
            provider_id = LOWER(v_username || '@school.internal')
        WHERE user_id = OLD.user_id AND provider = 'email';
        
        -- Revert public.users email
        UPDATE public.users
        SET email = LOWER(v_username || '@school.internal')
        WHERE id = OLD.user_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 3. Bind trigger to auth.identities
DROP TRIGGER IF EXISTS trg_sync_identity_changes ON auth.identities;
CREATE TRIGGER trg_sync_identity_changes
  AFTER INSERT OR UPDATE OR DELETE ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_identity_changes();

-- 4. Sync existing Google links: if someone is already connected, force sync
UPDATE public.users pu
SET email = LOWER(ai.identity_data->>'email')
FROM auth.identities ai
WHERE pu.id = ai.user_id
  AND ai.provider = 'google'
  AND (pu.email IS NULL OR pu.email LIKE '%@school.internal' OR pu.email != ai.identity_data->>'email');

UPDATE auth.users au
SET email = LOWER(ai.identity_data->>'email')
FROM auth.identities ai
WHERE au.id = ai.user_id
  AND ai.provider = 'google'
  AND (au.email IS NULL OR au.email LIKE '%@school.internal' OR au.email != ai.identity_data->>'email');

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
