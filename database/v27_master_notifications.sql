-- ====================================================================
-- Phase 27: Master Notification Engine
-- 1. Queue Table
-- 2. Trigger Functions
-- 3. Triggers for Action-Based Events
-- ====================================================================

-- ────────────────────────────────────────────────────────────────────
-- 1. QUEUE TABLE
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_notifications_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE, -- Nullable for global notifications
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE, -- Nullable if target_role is used
    target_role text CHECK (target_role IN ('all', 'students', 'student', 'teachers', 'teacher', 'admin', 'platform_admin')), -- For role-based fan-out
    title text NOT NULL,
    body text NOT NULL,
    route text, -- For deep linking (e.g., '/attendance', '/fees')
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    error_log text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.app_notifications_queue ENABLE ROW LEVEL SECURITY;

-- Service role and platform admin have full access. Admins can view their school's queue.
CREATE POLICY "Admins can view their school's notification queue" 
    ON public.app_notifications_queue FOR SELECT 
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- ────────────────────────────────────────────────────────────────────
-- 2. TRIGGER FUNCTIONS
-- ────────────────────────────────────────────────────────────────────

-- A. Attendance
CREATE OR REPLACE FUNCTION trg_notify_attendance() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'Absent' THEN
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route)
        VALUES (NEW.school_id, NEW.user_id, 'Attendance Alert', 'You have been marked absent today. Please provide a valid reason or leave application.', '/attendance');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Fees Payments
CREATE OR REPLACE FUNCTION trg_notify_fees_payment() RETURNS trigger AS $$
DECLARE
    v_student_id uuid;
BEGIN
    -- Fetch student_id from fees table
    SELECT student_id INTO v_student_id FROM public.fees WHERE id = NEW.fee_id;
    
    IF v_student_id IS NOT NULL THEN
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route)
        VALUES (NEW.school_id, v_student_id, 'Payment Received', 'Your fee payment of ₹' || NEW.amount || ' via ' || NEW.method || ' has been successfully recorded.', '/fees');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Leaves
CREATE OR REPLACE FUNCTION trg_notify_leave_update() RETURNS trigger AS $$
BEGIN
    IF OLD.status != NEW.status AND NEW.status IN ('approved', 'rejected') THEN
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route)
        VALUES (NEW.school_id, NEW.user_id, 'Leave Update', 'Your leave application from ' || NEW.from_date || ' to ' || NEW.to_date || ' has been ' || NEW.status || '.', '/leaves');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. Gallery
CREATE OR REPLACE FUNCTION trg_notify_gallery_insert() RETURNS trigger AS $$
BEGIN
    INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route)
    VALUES (NEW.school_id, 'all', 'New Photos Added', 'New photos have been added to the gallery: ' || NEW.title, '/gallery');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E. Support Tickets
CREATE OR REPLACE FUNCTION trg_notify_support_ticket() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Notify Platform Admin (Global so school_id is null or kept as context)
        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route)
        VALUES (NEW.school_id, 'platform_admin', 'New Support Ticket', 'A new ticket has been raised: ' || NEW.subject, '/support');
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status AND NEW.status = 'Resolved' THEN
            -- Notify School Admin
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route)
            VALUES (NEW.school_id, 'admin', 'Ticket Resolved', 'Your support ticket "' || NEW.subject || '" has been resolved.', '/support');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F. App Versions
CREATE OR REPLACE FUNCTION trg_notify_app_version() RETURNS trigger AS $$
BEGIN
    -- Global notification
    INSERT INTO public.app_notifications_queue (target_role, title, body, route)
    VALUES ('all', 'App Update Available', 'A new version (' || NEW.version_name || ') of SchoolOS+ is available! Please update for the best experience.', '/settings');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- G. Timetable
CREATE OR REPLACE FUNCTION trg_notify_timetable_update() RETURNS trigger AS $$
DECLARE
    v_student record;
BEGIN
    IF OLD.subject != NEW.subject AND NEW.subject IN ('Off', 'Proxy', 'off', 'proxy') THEN
        -- Insert a notification for every student in that class
        FOR v_student IN SELECT id FROM public.users WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student' LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route)
            VALUES (NEW.school_id, v_student.id, 'Class Update', 'Your ' || NEW.day || ' period ' || NEW.period_order || ' schedule has been updated to: ' || NEW.subject, '/timetable');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────
-- 3. APPLY TRIGGERS
-- ────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_attendance_notify ON public.attendance;
CREATE TRIGGER on_attendance_notify
    AFTER INSERT OR UPDATE ON public.attendance
    FOR EACH ROW EXECUTE FUNCTION trg_notify_attendance();

DROP TRIGGER IF EXISTS on_fees_payment_notify ON public.fees_payments;
CREATE TRIGGER on_fees_payment_notify
    AFTER INSERT ON public.fees_payments
    FOR EACH ROW EXECUTE FUNCTION trg_notify_fees_payment();

DROP TRIGGER IF EXISTS on_leaves_notify ON public.leaves;
CREATE TRIGGER on_leaves_notify
    AFTER UPDATE ON public.leaves
    FOR EACH ROW EXECUTE FUNCTION trg_notify_leave_update();

DROP TRIGGER IF EXISTS on_gallery_notify ON public.gallery;
CREATE TRIGGER on_gallery_notify
    AFTER INSERT ON public.gallery
    FOR EACH ROW EXECUTE FUNCTION trg_notify_gallery_insert();

DROP TRIGGER IF EXISTS on_support_ticket_notify ON public.support_tickets;
CREATE TRIGGER on_support_ticket_notify
    AFTER INSERT OR UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION trg_notify_support_ticket();

DROP TRIGGER IF EXISTS on_app_version_notify ON public.app_versions;
CREATE TRIGGER on_app_version_notify
    AFTER INSERT ON public.app_versions
    FOR EACH ROW EXECUTE FUNCTION trg_notify_app_version();

DROP TRIGGER IF EXISTS on_timetable_notify ON public.timetable;
CREATE TRIGGER on_timetable_notify
    AFTER UPDATE ON public.timetable
    FOR EACH ROW EXECUTE FUNCTION trg_notify_timetable_update();

-- ────────────────────────────────────────────────────────────────────
-- 4. WEBHOOK SETUP FOR EDGE FUNCTION
-- ────────────────────────────────────────────────────────────────────
-- Note: You should enable the webhook in the Supabase Dashboard -> Database -> Webhooks.
-- Webhook Name: trigger_notification_queue
-- Table: app_notifications_queue
-- Events: INSERT
-- Type: Supabase Edge Function (process-notification-queue)
