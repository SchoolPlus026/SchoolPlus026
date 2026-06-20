-- ═══════════════════════════════════════════════════════════════════════════
-- v98_native_auth_recovery_and_sync.sql
-- Native Auth Email Synchronization Trigger & Gated Password Reset RPC
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Function to sync auth.users email updates to public.users table
CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- 2. Bind the trigger to auth.users updates and inserts
DROP TRIGGER IF EXISTS trg_sync_auth_user_email ON auth.users;
CREATE TRIGGER trg_sync_auth_user_email
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_email_from_auth();

-- 3. Secure RPC to validate reset password request and return verified email
CREATE OR REPLACE FUNCTION public.request_password_reset_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id     uuid;
    v_email       text;
    v_role        text;
    v_school_id   uuid;
    v_plan_type   text;
BEGIN
    -- Resolve user ID, role, school, and email by either username or email
    SELECT id, role, school_id, email INTO v_user_id, v_role, v_school_id, v_email
    FROM public.users
    WHERE LOWER(username) = LOWER(p_identifier) OR LOWER(email) = LOWER(p_identifier)
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No account found for "%".', p_identifier;
    END IF;

    -- Block placeholders (e.g. initial demo accounts or school.internal domains)
    IF v_email IS NULL OR v_email NOT LIKE '%@%._%' OR v_email LIKE '%@school.internal' OR v_email LIKE '%@demo.com' THEN
        RAISE EXCEPTION 'This account does not have a verified recovery email linked. Please contact your teacher/admin for a manual password reset.';
    END IF;

    -- Fetch active plan type (auto-handles trial downgrades)
    v_plan_type := public.get_effective_plan(v_school_id);

    -- Apply Gating Rule: Free school + Student = Blocked from email reset
    IF v_plan_type = 'free' AND v_role = 'student' THEN
        RAISE EXCEPTION 'Password recovery via email is not available for students in free schools. Please ask your teacher or administrator to reset your password.';
    END IF;

    -- Reload schema cache notification
    NOTIFY pgrst, 'reload schema';

    RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_password_reset_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.request_password_reset_email(text) TO authenticated;
