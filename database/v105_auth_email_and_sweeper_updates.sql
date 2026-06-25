-- ═══════════════════════════════════════════════════════════════════════════
-- v105_auth_email_and_sweeper_updates.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add student_emails_enabled to school_settings
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS student_emails_enabled BOOLEAN DEFAULT FALSE;

-- 2. Create password reset logs for rate limiting
CREATE TABLE IF NOT EXISTS public.password_reset_logs (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    requested_at  timestamptz DEFAULT now()
);

-- Enable RLS for password_reset_logs (no public read/write allowed since it's only called via SECURITY DEFINER functions)
ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;

-- 3. Redefine request_password_reset_email RPC with student toggle and free-tier teacher limit
CREATE OR REPLACE FUNCTION public.request_password_reset_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id                 uuid;
    v_email                   text;
    v_role                    text;
    v_school_id               uuid;
    v_plan_type               text;
    v_student_emails_enabled  boolean;
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

    -- Fetch student email toggle
    SELECT student_emails_enabled INTO v_student_emails_enabled
    FROM public.school_settings
    WHERE school_id = v_school_id;

    -- Apply Student recovery restriction (Only allow students if student_emails_enabled is TRUE)
    IF v_role = 'student' AND COALESCE(v_student_emails_enabled, false) = FALSE THEN
        RAISE EXCEPTION 'Password recovery via email is not enabled for students of this school. Please contact your class teacher or school administrator for help.';
    END IF;

    -- Apply Free Plan Teacher rate limit (1 request per 24 hours)
    IF v_role = 'teacher' AND v_plan_type = 'free' THEN
        IF EXISTS (
            SELECT 1 FROM public.password_reset_logs
            WHERE user_id = v_user_id
              AND requested_at > NOW() - INTERVAL '24 hours'
        ) THEN
            RAISE EXCEPTION 'Teachers in free tier schools can only request password resets once per 24 hours. Please try again later.';
        END IF;
    END IF;

    -- Log reset request
    INSERT INTO public.password_reset_logs (user_id) VALUES (v_user_id);

    -- Reload schema cache notification
    NOTIFY pgrst, 'reload schema';

    RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_password_reset_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.request_password_reset_email(text) TO authenticated;

-- 4. Define retrieve_username_by_email RPC for username recovery
CREATE OR REPLACE FUNCTION public.retrieve_username_by_email(p_email text, p_contact text)
RETURNS TABLE (
    username text,
    name text,
    role text,
    student_emails_enabled boolean,
    school_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT u.username, u.name, u.role, COALESCE(s.student_emails_enabled, false), s.name
    FROM public.users u
    JOIN public.school_settings s ON u.school_id = s.school_id
    WHERE LOWER(u.email) = LOWER(p_email) AND u.contact = p_contact
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.retrieve_username_by_email(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.retrieve_username_by_email(text, text) TO authenticated;

-- 5. Reconfigure the notification sweeper cron job (Strictly Notifications Only)
-- Unschedule the old sweeper job if it exists
SELECT cron.unschedule('notification-smart-sweeper')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'notification-smart-sweeper'
);

-- Schedule the new plan-aware sweeper (runs daily at 02:30 AM UTC)
SELECT cron.schedule(
  'notification-smart-sweeper',
  '30 2 * * *',  -- Daily at 02:30 AM UTC
  $$
  -- 1. Free plan schools (including trial): Delete notifications older than 3 months
  DELETE FROM public.notifications n
  USING public.school_settings s
  WHERE n.school_id = s.school_id
    AND s.plan_type IN ('free', 'trial')
    AND n.created_at < NOW() - INTERVAL '3 months';

  DELETE FROM public.app_notifications_queue q
  USING public.school_settings s
  WHERE q.school_id = s.school_id
    AND s.plan_type IN ('free', 'trial')
    AND q.created_at < NOW() - INTERVAL '3 months';

  -- 2. Premium plan schools: Delete notifications older than 6 months
  DELETE FROM public.notifications n
  USING public.school_settings s
  WHERE n.school_id = s.school_id
    AND s.plan_type = 'premium'
    AND n.created_at < NOW() - INTERVAL '6 months';

  DELETE FROM public.app_notifications_queue q
  USING public.school_settings s
  WHERE q.school_id = s.school_id
    AND s.plan_type = 'premium'
    AND q.created_at < NOW() - INTERVAL '6 months';

  -- 3. Cleanup orphan notifications / global notification queue items older than 3 months
  DELETE FROM public.notifications
  WHERE school_id IS NULL
    AND created_at < NOW() - INTERVAL '3 months';

  DELETE FROM public.app_notifications_queue
  WHERE school_id IS NULL
    AND created_at < NOW() - INTERVAL '3 months';
  $$
);
