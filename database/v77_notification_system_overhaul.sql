-- ==============================================================================
-- v77: Notification System Overhaul & Master Sync
-- 1. Alter notifications table to resolve title constraint issues
-- 2. Bidirectional sync triggers between notifications and app_notifications_queue
-- 3. Missing push notification triggers for:
--    - Emergency Alerts
--    - Achievers Board (Manual Awards)
--    - Lost & Found
-- ==============================================================================

-- ── 1. ALTER NOTIFICATIONS TABLE ──────────────────────────────────────────────
-- Add title column if it is missing (due to legacy table overrides preventing v32 from creating it).
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Notification';

-- ── 2. BIDIRECTIONAL SYNC TRIGGERS ────────────────────────────────────────────

-- A. Trigger function: notifications (In-App Bell) -> app_notifications_queue (FCM Push)
CREATE OR REPLACE FUNCTION public.trg_sync_notifications_to_queue()
RETURNS TRIGGER AS $$
DECLARE
    v_sync_state text;
    v_user_id uuid;
    v_target_role text;
BEGIN
    -- Recursion guard using a transaction-scoped session variable
    v_sync_state := current_setting('vars.sync_in_progress', true);
    IF v_sync_state = 'on' THEN
        RETURN NEW;
    END IF;

    -- Set sync flag
    PERFORM set_config('vars.sync_in_progress', 'on', true);

    -- Try to find a user matching the email or username in to_user
    SELECT id INTO v_user_id 
    FROM public.users 
    WHERE LOWER(email) = LOWER(NEW.to_user) OR LOWER(username) = LOWER(NEW.to_user)
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- Insert a targeted push notification
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id, 
            v_user_id, 
            COALESCE(NEW.title, 'Notification'), 
            COALESCE(NEW.message, ''), 
            NULL, 
            true, 
            'pending'
        );
    ELSE
        -- Check if to_user represents a target role group
        IF NEW.to_user IN ('all', 'student', 'students', 'teacher', 'teachers', 'admin', 'platform_admin') THEN
            v_target_role := CASE NEW.to_user
                WHEN 'students' THEN 'student'
                WHEN 'teachers' THEN 'teacher'
                ELSE NEW.to_user
            END;

            -- Insert a group/role-based push notification
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                v_target_role, 
                COALESCE(NEW.title, 'Notification'), 
                COALESCE(NEW.message, ''), 
                NULL, 
                true, 
                'pending'
            );
        END IF;
    END IF;

    -- Reset sync flag
    PERFORM set_config('vars.sync_in_progress', 'off', true);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Safety fallback to reset flag on error
    PERFORM set_config('vars.sync_in_progress', 'off', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Trigger function: app_notifications_queue (FCM Push) -> notifications (In-App Bell)
CREATE OR REPLACE FUNCTION public.trg_sync_queue_to_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_sync_state text;
    v_user_email text;
    v_user record;
    v_norm_role text;
BEGIN
    -- Recursion guard
    v_sync_state := current_setting('vars.sync_in_progress', true);
    IF v_sync_state = 'on' THEN
        RETURN NEW;
    END IF;

    -- Set sync flag
    PERFORM set_config('vars.sync_in_progress', 'on', true);

    IF NEW.user_id IS NOT NULL THEN
        -- Resolve user email to create in-app notification
        SELECT email INTO v_user_email FROM public.users WHERE id = NEW.user_id;
        IF v_user_email IS NOT NULL AND v_user_email <> '' THEN
            INSERT INTO public.notifications (school_id, to_user, title, message, is_read)
            VALUES (
                NEW.school_id, 
                v_user_email, 
                COALESCE(NEW.title, 'Notification'), 
                COALESCE(NEW.body, ''), 
                false
            );
        END IF;
    ELSIF NEW.target_role IS NOT NULL THEN
        -- Normalize role string
        v_norm_role := CASE NEW.target_role
            WHEN 'students' THEN 'student'
            WHEN 'teachers' THEN 'teacher'
            ELSE NEW.target_role
        END;

        IF v_norm_role = 'all' THEN
            -- Write in-app notifications for all users in the school
            FOR v_user IN 
                SELECT email FROM public.users 
                WHERE school_id = NEW.school_id AND email IS NOT NULL AND email <> ''
            LOOP
                INSERT INTO public.notifications (school_id, to_user, title, message, is_read)
                VALUES (
                    NEW.school_id, 
                    v_user.email, 
                    COALESCE(NEW.title, 'Notification'), 
                    COALESCE(NEW.body, ''), 
                    false
                );
            END LOOP;
        ELSE
            -- Write in-app notifications for all users of the specified role in the school
            FOR v_user IN 
                SELECT email FROM public.users 
                WHERE school_id = NEW.school_id AND role = v_norm_role AND email IS NOT NULL AND email <> ''
            LOOP
                INSERT INTO public.notifications (school_id, to_user, title, message, is_read)
                VALUES (
                    NEW.school_id, 
                    v_user.email, 
                    COALESCE(NEW.title, 'Notification'), 
                    COALESCE(NEW.body, ''), 
                    false
                );
            END LOOP;
        END IF;
    END IF;

    -- Reset sync flag
    PERFORM set_config('vars.sync_in_progress', 'off', true);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Safety fallback to reset flag on error
    PERFORM set_config('vars.sync_in_progress', 'off', true);
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the triggers
DROP TRIGGER IF EXISTS on_notification_insert_sync ON public.notifications;
CREATE TRIGGER on_notification_insert_sync
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_notifications_to_queue();

DROP TRIGGER IF EXISTS on_queue_insert_sync ON public.app_notifications_queue;
CREATE TRIGGER on_queue_insert_sync
    AFTER INSERT ON public.app_notifications_queue
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_queue_to_notifications();


-- ── 3. MISSING MODULE TRIGGERS ────────────────────────────────────────────────

-- A. Emergency Alerts Trigger
CREATE OR REPLACE FUNCTION public.trg_notify_emergency_alert()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient record;
    v_target_role text;
BEGIN
    IF NEW.target_audience = 'specific_students' AND NEW.target_users IS NOT NULL THEN
        -- Loop through target student IDs and enqueue push notifications
        FOR v_recipient IN SELECT id FROM public.users WHERE id = any(NEW.target_users) LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                v_recipient.id, 
                '🚨 EMERGENCY ALERT: ' || UPPER(NEW.alert_type), 
                NEW.message, 
                '/dashboard', 
                false, -- Critical emergency alerts are not ephemeral (do not auto-delete)
                'pending'
            );
        END LOOP;
    ELSE
        -- Map audience keyword to a target role compatible with the queue check constraint
        v_target_role := CASE NEW.target_audience
            WHEN 'all' THEN 'all'
            WHEN 'staff' THEN 'teacher'
            WHEN 'students' THEN 'student'
            WHEN 'admin' THEN 'admin'
            ELSE 'all'
        END;

        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id, 
            v_target_role, 
            '🚨 EMERGENCY ALERT: ' || UPPER(NEW.alert_type), 
            NEW.message, 
            '/dashboard', 
            false, 
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_emergency_alert_notify ON public.emergency_alerts;
CREATE TRIGGER on_emergency_alert_notify
    AFTER INSERT ON public.emergency_alerts
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_emergency_alert();


-- B. Achievers Board (Manual Awards) Trigger
CREATE OR REPLACE FUNCTION public.trg_notify_manual_badge_award()
RETURNS TRIGGER AS $$
DECLARE
    v_badge_name text;
    v_award_type text;
BEGIN
    -- Look up the badge details
    SELECT name, award_type INTO v_badge_name, v_award_type
    FROM public.badges_master
    WHERE id = NEW.badge_id;

    -- Only enqueue push notifications for manual badge awards to prevent double-notifying automated ones
    IF v_award_type = 'manual' AND NEW.is_active = true THEN
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id,
            NEW.student_id,
            '🏅 New Achievement Badge!',
            'Congratulations! You have been awarded the "' || v_badge_name || '" badge.',
            '/achievements',
            true,
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_manual_badge_award_notify ON public.student_achievements;
CREATE TRIGGER on_manual_badge_award_notify
    AFTER INSERT ON public.student_achievements
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_manual_badge_award();


-- C. Lost & Found Trigger
CREATE OR REPLACE FUNCTION public.trg_notify_lost_found_item()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient record;
BEGIN
    IF NEW.target_class IS NOT NULL AND NEW.target_class <> '' THEN
        -- Notify all students in the targeted class
        FOR v_recipient IN 
            SELECT id FROM public.users 
            WHERE school_id = NEW.school_id AND class = NEW.target_class AND role = 'student'
        LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                v_recipient.id,
                '🔍 Lost & Found Update',
                'A new item (' || NEW.item_name || ') has been reported found in your class.',
                '/dashboard',
                true,
                'pending'
            );
        END LOOP;
    ELSE
        -- Notify the entire school
        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id,
            'all',
            '🔍 Lost & Found Update',
            'A new item (' || NEW.item_name || ') has been reported found.',
            '/dashboard',
            true,
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_lost_found_item_notify ON public.lost_and_found;
CREATE TRIGGER on_lost_found_item_notify
    AFTER INSERT ON public.lost_and_found
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_lost_found_item();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
