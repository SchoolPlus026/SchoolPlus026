-- v89: QA Batch 2 Database & RPC Bug Fixes

-- 1. Create a transaction-safe RPC to claim pending notifications using locking (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_pending_notifications(p_limit int)
RETURNS SETOF public.app_notifications_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids bigint[];
BEGIN
  -- Select and lock the rows
  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id
    FROM public.app_notifications_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) t;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    -- Update and return the rows
    RETURN QUERY
    UPDATE public.app_notifications_queue
    SET status = 'processing'
    WHERE id = any(v_ids)
    RETURNING *;
  END IF;
END;
$$;


-- 2. Overhaul the activity badge RPC to fix permanent red dots and enforce scope/class visibility rules
CREATE OR REPLACE FUNCTION public.check_all_module_activities(
  p_user_id uuid,
  p_school_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_class text;
  v_last_viewed timestamp with time zone;
  v_pending_count integer;
  v_unseen_count integer;
  v_result jsonb;
  v_module text;
  v_modules text[] := ARRAY['leaves', 'complaint_box', 'notices', 'achievers', 'lost_found'];
BEGIN
  -- Fetch user class (needed for teacher pending leaves and visibility logic)
  SELECT class INTO v_user_class FROM public.users WHERE id = p_user_id;

  v_result := jsonb_build_object();

  -- Loop through modules and calculate activity
  FOREACH v_module IN ARRAY v_modules LOOP
    v_pending_count := 0;
    v_unseen_count := 0;

    -- Fetch last_viewed_at from user_module_views
    SELECT last_viewed_at INTO v_last_viewed
    FROM public.user_module_views
    WHERE user_id = p_user_id AND module_name = v_module;

    -- FIX: If never viewed, default to the last 7 days to prevent permanent historical red dots
    IF v_last_viewed IS NULL THEN
      v_last_viewed := NOW() - INTERVAL '7 days';
    END IF;

    -- Module-specific logic
    CASE v_module
      WHEN 'leaves' THEN
        IF p_role = 'admin' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.leaves
          WHERE school_id = p_school_id AND status = 'pending';
        ELSIF p_role = 'teacher' THEN
          IF v_user_class IS NOT NULL AND v_user_class <> '' THEN
            SELECT COALESCE(count(*), 0) INTO v_pending_count
            FROM public.leaves l
            JOIN public.users u ON l.user_id = u.id
            WHERE l.status = 'pending' 
              AND u.role = 'student' 
              AND u.class = v_user_class 
              AND u.school_id = p_school_id;
          END IF;
        END IF;

        IF p_role IN ('student', 'teacher', 'staff') THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.leaves
          WHERE user_id = p_user_id AND created_at > v_last_viewed;
        END IF;

      WHEN 'complaint_box' THEN
        -- FIX: status is 'unread', not 'pending' in the complaint_box table schema
        IF p_role = 'admin' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.complaint_box
          WHERE school_id = p_school_id AND status = 'unread';
        ELSIF p_role = 'teacher' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.complaint_box
          WHERE recipient_id = p_user_id AND status = 'unread';

          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.complaint_box
          WHERE sender_id = p_user_id AND status = 'replied' AND replied_at > v_last_viewed;
        ELSIF p_role = 'student' THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.complaint_box
          WHERE sender_id = p_user_id AND status = 'replied' AND replied_at > v_last_viewed;
        END IF;

      WHEN 'notices' THEN
        -- FIX: Filter notices by p_role's visibility scope to match NoticeBoard filters
        SELECT COALESCE(count(*), 0) INTO v_unseen_count
        FROM public.notices
        WHERE school_id = p_school_id 
          AND created_at > v_last_viewed
          AND (
            p_role IN ('admin', 'platform_admin', 'staff', 'driver')
            OR (p_role = 'student' AND scope IN ('all', 'students'))
            OR (p_role = 'teacher' AND scope IN ('all', 'teachers'))
          );

      WHEN 'achievers' THEN
        IF p_role = 'student' THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.student_achievements
          WHERE student_id = p_user_id AND is_active = true AND awarded_at > v_last_viewed;
        ELSE
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.student_achievements
          WHERE school_id = p_school_id AND is_active = true AND awarded_at > v_last_viewed;
        END IF;

      WHEN 'lost_found' THEN
        -- FIX: Filter unseen items by target_class visibility scope to match LostAndFound filters
        SELECT COALESCE(count(*), 0) INTO v_unseen_count
        FROM public.lost_and_found
        WHERE school_id = p_school_id 
          AND claimed_by IS NULL 
          AND created_at > v_last_viewed
          AND (
            p_role NOT IN ('student', 'teacher')
            OR (target_class IS NULL)
            OR (v_user_class IS NOT NULL AND target_class = v_user_class)
          );

        SELECT COALESCE(count(*), 0) INTO v_pending_count
        FROM public.lost_and_found
        WHERE reported_by = p_user_id AND status = 'claimed';

      ELSE
        -- No action
    END CASE;

    -- Store results for this module
    v_result := jsonb_set(
      v_result, 
      ARRAY[v_module], 
      jsonb_build_object(
        'hasActivity', (v_pending_count > 0 OR v_unseen_count > 0),
        'pendingCount', v_pending_count,
        'unseenCount', v_unseen_count
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;


-- 3. Fix safe update constraint in update_cron_schedule RPC
CREATE OR REPLACE FUNCTION public.update_cron_schedule(p_minutes INT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cron_expr TEXT;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid interval. Must be between 1 and 60 minutes.');
  END IF;

  -- FIX: Added WHERE constraint on platform_settings to bypass safe update validation checks
  UPDATE public.platform_settings 
  SET free_tier_cron_minutes = p_minutes
  WHERE id = (SELECT id FROM public.platform_settings LIMIT 1);

  -- Construct standard cron schedule (run every X minutes during school hours 8 AM - 6 PM)
  v_cron_expr := '*/' || p_minutes || ' 8-18 * * *';

  -- Re-register pg_cron schedule
  PERFORM cron.unschedule('notification-batch-processor-free-tier');
  PERFORM cron.schedule(
    'notification-batch-processor-free-tier',
    v_cron_expr,
    $cron$
    SELECT net.http_post(
      url     => 'https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue',
      headers => jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8'
      ),
      body    => '{}'::jsonb
    );
    $cron$
  );

  RETURN jsonb_build_object('success', true, 'minutes', p_minutes, 'schedule', v_cron_expr);
END;
$$;
