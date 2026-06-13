-- v85: Secure Login Brute-Force Protection Migration
-- Migrates brute force log updates from unauthenticated Edge Function endpoints into a secure SQL RPC function.

CREATE OR REPLACE FUNCTION public.check_and_log_login_attempt(
  p_username text,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username text;
  v_log record;
  v_locked boolean := false;
  v_locked_until timestamp with time zone := null;
  v_attempts integer := 0;
BEGIN
  v_username := lower(trim(p_username));
  IF v_username IS NULL OR v_username = '' THEN
    RETURN jsonb_build_object('error', 'Username is required');
  END IF;

  -- Get current lock log
  SELECT * INTO v_log FROM public.login_brute_force_logs WHERE username = v_username;

  IF p_action = 'check' THEN
    IF v_log.locked_until IS NOT NULL AND v_log.locked_until > now() THEN
      v_locked := true;
      v_locked_until := v_log.locked_until;
    END IF;
    RETURN jsonb_build_object('locked', v_locked, 'lockedUntil', v_locked_until, 'attempts', COALESCE(v_log.failed_attempts, 0));

  ELSIF p_action = 'fail' THEN
    IF v_log.username IS NULL THEN
      -- Create new log on first failure
      INSERT INTO public.login_brute_force_logs (username, failed_attempts, last_attempt_at)
      VALUES (v_username, 1, now())
      RETURNING failed_attempts, locked_until INTO v_attempts, v_locked_until;
    ELSE
      -- Increment failed attempts
      v_attempts := v_log.failed_attempts + 1;
      IF v_attempts >= 5 THEN
        -- Lock account for 2 hours to match frontend UI message
        v_locked_until := now() + interval '2 hours';
        v_locked := true;
      END IF;
      
      UPDATE public.login_brute_force_logs
      SET failed_attempts = v_attempts,
          last_attempt_at = now(),
          locked_until = COALESCE(v_locked_until, locked_until)
      WHERE username = v_username;
    END IF;
    
    RETURN jsonb_build_object('attempts', v_attempts, 'locked', v_attempts >= 5, 'lockedUntil', v_locked_until);

  ELSIF p_action = 'success' THEN
    -- Clear failed logs on successful authentication
    DELETE FROM public.login_brute_force_logs WHERE username = v_username;
    RETURN jsonb_build_object('success', true);

  ELSE
    RETURN jsonb_build_object('error', 'Invalid action');
  END IF;
END;
$$;
