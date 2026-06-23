-- ==============================================================================
-- v104: Student Leave Routing & Notifications Rebuild
-- 1. Modify trg_notify_leave_update to route student leaves to 1st-period Class Teacher
-- 2. Modify trg_notify_leave_update to route teacher/staff/driver leaves to admin
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_leave_update()
RETURNS trigger AS $$
DECLARE
    v_user_name text;
    v_user_role text;
    v_user_class text;
    v_teacher_id uuid;
    v_teacher_found boolean := false;
BEGIN
    -- Fetch details of the applicant
    SELECT name, role, class INTO v_user_name, v_user_role, v_user_class
    FROM public.users 
    WHERE id = NEW.user_id;

    IF TG_OP = 'INSERT' THEN
        -- 1. Notify the applicant that their application is pending
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, status)
        VALUES (NEW.school_id, NEW.user_id, 'Leave Application', 'Hi ' || v_user_name || ', your leave application has been submitted and is pending approval.', '/leaves', 'pending');

        -- 2. Notify the reviewer
        IF v_user_role = 'student' THEN
            -- Find the Class Teacher (who has 1st period on the class in timetable)
            -- We search the timetable for this class and period_order = 1
            -- We order by day so we get a consistent default (e.g. Monday's teacher, or today's teacher)
            SELECT teacher::uuid INTO v_teacher_id
            FROM public.timetable
            WHERE school_id = NEW.school_id
              AND class = v_user_class
              AND period_order = 1
            ORDER BY 
              CASE WHEN trim(day) = to_char(now(), 'FMDay') THEN 1
                   WHEN trim(day) = 'Monday' THEN 2
                   ELSE 3
              END
            LIMIT 1;

            IF v_teacher_id IS NOT NULL THEN
                v_teacher_found := true;
                INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, status)
                VALUES (NEW.school_id, v_teacher_id, 'Student Leave Request', v_user_name || ' from your class (' || v_user_class || ') has requested leave.', '/leaves', 'pending');
            END IF;

            -- Fallback: if no class teacher is resolved from timetable, notify the school admin
            IF NOT v_teacher_found THEN
                INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, status)
                VALUES (NEW.school_id, 'admin', 'Student Leave Request (No Teacher)', v_user_name || ' (Class ' || COALESCE(v_user_class, 'N/A') || ') has requested leave, but no class teacher is assigned.', '/leaves', 'pending');
            END IF;
        ELSE
            -- Non-student leave (teacher/staff/driver) -> goes to Admin
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, status)
            VALUES (NEW.school_id, 'admin', 'Staff Leave Request', v_user_name || ' (' || v_user_role || ') has requested leave.', '/leaves', 'pending');
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Approved', 'Rejected') THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, status)
            VALUES (NEW.school_id, NEW.user_id, 'Leave Update', 'Hi ' || v_user_name || ', your leave application from ' || NEW.from_date::text || ' to ' || NEW.to_date::text || ' has been ' || NEW.status || '.', '/leaves', 'pending');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-bind the trigger to ensure schema reload
DROP TRIGGER IF EXISTS on_leaves_notify ON public.leaves;
CREATE TRIGGER on_leaves_notify
    AFTER INSERT OR UPDATE ON public.leaves
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_leave_update();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
