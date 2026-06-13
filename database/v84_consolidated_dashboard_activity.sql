-- v84: Consolidated Dashboard Activity Badges (Red Dot Storm Fix)
-- Consolidates 21 parallel query hooks polling every 30s into a single fast database RPC.

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
  -- 1. Fetch user class (needed for teacher pending leaves logic)
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

    IF v_last_viewed IS NULL THEN
      v_last_viewed := '1970-01-01 00:00:00+00'::timestamp with time zone;
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
        IF p_role = 'admin' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.complaint_box
          WHERE school_id = p_school_id AND status = 'pending';
        ELSIF p_role = 'teacher' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.complaint_box
          WHERE recipient_id = p_user_id AND status = 'pending';

          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.complaint_box
          WHERE sender_id = p_user_id AND status = 'replied' AND replied_at > v_last_viewed;
        ELSIF p_role = 'student' THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.complaint_box
          WHERE sender_id = p_user_id AND status = 'replied' AND replied_at > v_last_viewed;
        END IF;

      WHEN 'notices' THEN
        SELECT COALESCE(count(*), 0) INTO v_unseen_count
        FROM public.notices
        WHERE school_id = p_school_id AND created_at > v_last_viewed;

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
        SELECT COALESCE(count(*), 0) INTO v_unseen_count
        FROM public.lost_and_found
        WHERE school_id = p_school_id AND claimed_by IS NULL AND created_at > v_last_viewed;

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
