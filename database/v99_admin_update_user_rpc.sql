-- ═══════════════════════════════════════════════════════════════════════════
-- v99_admin_update_user_rpc.sql
-- Synchronised Admin User Management Updates & Identites Syncer
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Redefine trigger function to sync auth.users email to public.users AND auth.identities
CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. Sync to public.users
  UPDATE public.users
  SET email = NEW.email
  WHERE id = NEW.id;

  -- 2. Sync to auth.identities (only for email provider logins)
  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', NEW.email),
      provider_id = NEW.email
  WHERE user_id = NEW.id AND provider = 'email';

  RETURN NEW;
END;
$$;

-- 2. Bind the trigger to email inserts and updates on auth.users
DROP TRIGGER IF EXISTS trg_sync_auth_user_email ON auth.users;
CREATE TRIGGER trg_sync_auth_user_email
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_email_from_auth();

-- 3. Secure RPC to update user profile (including credentials/metadata boundaries)
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id       uuid,
    p_email         text,
    p_username      text,
    p_name          text,
    p_role          text,
    p_class         text DEFAULT NULL,
    p_contact       text DEFAULT NULL,
    p_dob           date DEFAULT NULL,
    p_address       text DEFAULT NULL,
    p_blood_group   text DEFAULT NULL,
    p_qualification text DEFAULT NULL,
    p_aadhar_card   text DEFAULT NULL,
    p_designation   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_role   text;
    caller_school uuid;
    target_school uuid;
BEGIN
    -- Verify caller roles
    SELECT role, school_id INTO caller_role, caller_school 
    FROM public.users WHERE id = auth.uid();

    IF caller_role NOT IN ('admin', 'app_manager', 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or managers can update users.';
    END IF;

    -- Verify school boundaries (prevent cross-tenant edits)
    SELECT school_id INTO target_school FROM public.users WHERE id = p_user_id;
    
    IF caller_role = 'admin' AND caller_school != target_school THEN
        RAISE EXCEPTION 'Unauthorized: You can only update users within your own school.';
    END IF;

    -- Verify username uniqueness
    IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username AND id != p_user_id) THEN
        RAISE EXCEPTION 'Username "%" is already taken.', p_username;
    END IF;

    -- Verify email uniqueness
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email AND id != p_user_id) THEN
        RAISE EXCEPTION 'Email "%" is already registered.', p_email;
    END IF;

    -- Update auth schemas
    UPDATE auth.users
    SET email = p_email,
        raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', p_role)
    WHERE id = p_user_id;

    UPDATE auth.identities
    SET identity_data = identity_data || jsonb_build_object('email', p_email),
        provider_id = p_email
    WHERE user_id = p_user_id AND provider = 'email';

    -- Update public schema
    UPDATE public.users
    SET name = p_name,
        username = p_username,
        email = p_email,
        role = p_role,
        class = p_class,
        contact = p_contact,
        dob = p_dob,
        address = p_address,
        blood_group = p_blood_group,
        qualification = p_qualification,
        aadhar_card = p_aadhar_card,
        designation = p_designation
    WHERE id = p_user_id;

    -- Reload postgrest schemas
    NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text, text, text, text, date, text, text, text, text, text) TO authenticated;
