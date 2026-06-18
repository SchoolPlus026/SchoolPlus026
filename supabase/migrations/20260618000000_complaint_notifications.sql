-- ==============================================================================
-- V95: COMPLAINT BOX AUTOMATED NOTIFICATIONS TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_complaint_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- 1. Student raising a complaint to Admins
        IF NEW.recipient_type = 'admin' THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                'admin',
                'New Complaint Received',
                CASE WHEN NEW.is_anonymous THEN 'Anonymous: ' || NEW.subject ELSE NEW.subject END,
                '/complaint-box',
                false,
                'pending'
            );
        
        -- 2. Student raising a complaint to a specific Class Teacher
        ELSIF NEW.recipient_type = 'teacher' AND NEW.recipient_id IS NOT NULL THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                NEW.recipient_id,
                'New Complaint Received',
                CASE WHEN NEW.is_anonymous THEN 'Anonymous: ' || NEW.subject ELSE NEW.subject END,
                '/complaint-box',
                false,
                'pending'
            );
            
        -- 3. Teacher sending a message directly to a Student
        ELSIF NEW.recipient_type = 'student' AND NEW.recipient_id IS NOT NULL THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                NEW.recipient_id,
                'Message from Teacher',
                NEW.subject,
                '/complaint-box',
                false,
                'pending'
            );
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- 4. Admin or Teacher replying to a complaint (status switches to 'replied')
        IF NEW.status = 'replied' AND OLD.status IS DISTINCT FROM 'replied' THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                NEW.sender_id,
                'New Reply to your Complaint',
                'Reply: ' || NEW.subject,
                '/complaint-box',
                false,
                'pending'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger
DROP TRIGGER IF EXISTS on_complaint_activity_notify ON public.complaint_box;
CREATE TRIGGER on_complaint_activity_notify
    AFTER INSERT OR UPDATE ON public.complaint_box
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_complaint_activity();

-- Notify PostgREST cache reload
NOTIFY pgrst, 'reload schema';
