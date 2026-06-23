-- ==============================================================================
-- v103: Unified Notification Gaps Rebuild
-- 1. Alter check constraint for subscription_transactions to support 'DISPUTED'
-- 2. Modify timetable trigger to notify on any subject/label/teacher updates
-- 3. Add trigger to notify admins when substitute declines or completes period
-- 4. Add trigger to notify all users on calendar event creation/updates
-- 5. Add trigger to notify students on syllabus completion/notes uploads
-- 6. Add trigger to notify class teachers on student sick/unwell check-ins
-- ==============================================================================

-- ── 1. ALTER SUBSCRIPTION_TRANSACTIONS STATUS CONSTRAINT ─────────────────────
ALTER TABLE public.subscription_transactions DROP CONSTRAINT IF EXISTS subscription_transactions_status_check;
ALTER TABLE public.subscription_transactions ADD CONSTRAINT subscription_transactions_status_check CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'DISPUTED'));


-- ── 2. GENERAL TIMETABLE EDITS TRIGGER ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_timetable_update()
RETURNS trigger AS $$
DECLARE
    v_student record;
BEGIN
    -- Trigger alert on ANY subject, label, or teacher assignment modifications
    IF OLD.subject IS DISTINCT FROM NEW.subject 
       OR OLD.period_label IS DISTINCT FROM NEW.period_label 
       OR OLD.teacher IS DISTINCT FROM NEW.teacher THEN
       
        -- Insert a notification for every student in that class
        FOR v_student IN 
            SELECT id FROM public.users 
            WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student'
        LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                v_student.id, 
                '📅 Timetable Modified', 
                'Your schedule for Class ' || NEW.class || ' on ' || NEW.day || ' (Period ' || NEW.period_order || ') has been updated.', 
                '/timetable',
                false,
                'pending'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-bind the trigger if needed (drops and binds cleanly)
DROP TRIGGER IF EXISTS on_timetable_notify ON public.timetable;
CREATE TRIGGER on_timetable_notify
    AFTER UPDATE ON public.timetable
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_timetable_update();


-- ── 3. SUBSTITUTIONS WF STATUS TRIGGER ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_substitution_update()
RETURNS trigger AS $$
DECLARE
    v_substitute_name text;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Look up the substitute teacher's name
        SELECT name INTO v_substitute_name FROM public.users WHERE id = NEW.substitute_teacher_id;
        
        IF NEW.status = 'cancelled' THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                'admin', 
                '📋 Substitution Declined', 
                COALESCE(v_substitute_name, 'A teacher') || ' has declined the substitution for ' || NEW.class || ' (Period ' || NEW.period_order || ').', 
                '/off-classes',
                false,
                'pending'
            );
        ELSIF NEW.status = 'completed' THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                'admin', 
                '✅ Substitution Completed', 
                COALESCE(v_substitute_name, 'A teacher') || ' has completed the substitution for ' || NEW.class || ' (Period ' || NEW.period_order || ').', 
                '/off-classes',
                false,
                'pending'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_substitution_status_notify ON public.substitutions;
CREATE TRIGGER on_substitution_status_notify
    AFTER UPDATE OF status ON public.substitutions
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_substitution_update();


-- ── 4. IMMEDIATE CALENDAR EVENT TRIGGER ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_calendar_event()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id, 
            'all', 
            '📅 New Event Created', 
            NEW.title || ' has been scheduled for ' || NEW.start_date::text || '.', 
            '/calendar',
            false,
            'pending'
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.title IS DISTINCT FROM NEW.title 
           OR OLD.start_date IS DISTINCT FROM NEW.start_date 
           OR OLD.description IS DISTINCT FROM NEW.description THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                'all', 
                '📅 Event Updated', 
                'Details for the event "' || NEW.title || '" have been updated.', 
                '/calendar',
                false,
                'pending'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_calendar_event_notify ON public.calendar_events;
CREATE TRIGGER on_calendar_event_notify
    AFTER INSERT OR UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_calendar_event();


-- ── 5. SYLLABUS UPDATES & NOTES TRIGGER ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_syllabus_change()
RETURNS trigger AS $$
DECLARE
    v_old_chapter jsonb;
    v_new_chapter jsonb;
    v_recipient record;
    v_old_completed boolean;
    v_new_completed boolean;
    v_old_notes text;
    v_new_notes text;
    v_chapter_title text;
    v_chapter_id int;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Loop through the elements of the new chapters array
        FOR v_new_chapter IN SELECT jsonb_array_elements(NEW.chapters) LOOP
            v_chapter_id := (v_new_chapter ->> 'id')::int;
            v_chapter_title := COALESCE(v_new_chapter ->> 'title', 'Chapter ' || v_chapter_id);
            v_new_completed := COALESCE((v_new_chapter ->> 'is_completed')::boolean, false);
            v_new_notes := v_new_chapter ->> 'notes_url';

            -- Match corresponding chapter in OLD structure
            SELECT c INTO v_old_chapter 
            FROM jsonb_array_elements(OLD.chapters) AS c
            WHERE (c ->> 'id')::int = v_chapter_id;

            IF v_old_chapter IS NOT NULL THEN
                v_old_completed := COALESCE((v_old_chapter ->> 'is_completed')::boolean, false);
                v_old_notes := v_old_chapter ->> 'notes_url';

                -- Case A: Chapter completion marked completed (false -> true)
                IF NOT v_old_completed AND v_new_completed THEN
                    FOR v_recipient IN 
                        SELECT id FROM public.users 
                        WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student'
                    LOOP
                        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
                        VALUES (
                            NEW.school_id,
                            v_recipient.id,
                            '📚 Syllabus Completed',
                            'Great job! Chapter ' || v_chapter_id || ' (' || v_chapter_title || ') of ' || NEW.subject || ' is completed.',
                            '/syllabus',
                            false,
                            'pending'
                        );
                    END LOOP;
                END IF;

                -- Case B: Chapter notes uploaded / changed
                IF v_new_notes IS NOT NULL AND (v_old_notes IS NULL OR v_old_notes IS DISTINCT FROM v_new_notes) THEN
                    FOR v_recipient IN 
                        SELECT id FROM public.users 
                        WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student'
                    LOOP
                        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
                        VALUES (
                            NEW.school_id,
                            v_recipient.id,
                            '📝 Study Notes Uploaded',
                            'New study notes have been uploaded for ' || NEW.subject || ' — ' || v_chapter_title || '.',
                            '/syllabus',
                            false,
                            'pending'
                        );
                    END LOOP;
                END IF;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_syllabus_change_notify ON public.syllabus_tracker;
CREATE TRIGGER on_syllabus_change_notify
    AFTER UPDATE OF chapters ON public.syllabus_tracker
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_syllabus_change();


-- ── 6. MORNING HEALTH/SICK FLAGS TRIGGER ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_mood_flag()
RETURNS trigger AS $$
DECLARE
    v_date text;
    v_entry jsonb;
    v_old_emoji text;
    v_emoji text;
    v_note text;
    v_student_name text;
    v_student_class text;
    v_teacher record;
    v_teacher_found boolean := false;
BEGIN
    -- Fetch student details
    SELECT name, class INTO v_student_name, v_student_class
    FROM public.users
    WHERE id = NEW.student_id;

    -- Loop through all entries in the new notes jsonb object
    FOR v_date, v_entry IN SELECT * FROM jsonb_each(NEW.notes) LOOP
        v_teacher_found := false;
        v_emoji := v_entry ->> 'emoji';
        v_note := COALESCE(v_entry ->> 'note', 'No note provided.');

        -- Alert strictly on '🤒' (Sick/Unwell) check-ins
        IF v_emoji = '🤒' THEN
            -- Check if this is a newly inserted date or if the emoji transitioned to '🤒'
            v_old_emoji := NULL;
            IF OLD IS NOT NULL AND OLD.notes IS NOT NULL THEN
                v_old_emoji := OLD.notes -> v_date ->> 'emoji';
            END IF;

            IF v_old_emoji IS NULL OR v_old_emoji IS DISTINCT FROM '🤒' THEN
                
                -- Look up the class teacher for this student's class
                FOR v_teacher IN 
                    SELECT id FROM public.users
                    WHERE school_id = NEW.school_id 
                      AND class = v_student_class 
                      AND role = 'teacher'
                LOOP
                    v_teacher_found := true;
                    
                    INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
                    VALUES (
                        NEW.school_id,
                        v_teacher.id,
                        '🤒 Student Health Alert',
                        v_student_name || ' checked in today as Unwell (🤒). Note: "' || v_note || '"',
                        '/mood_note',
                        false,
                        'pending'
                    );
                END LOOP;

                -- Fallback: If no teacher is found in that class, alert the school admin
                IF NOT v_teacher_found THEN
                    INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
                    VALUES (
                        NEW.school_id,
                        'admin',
                        '🤒 Student Health Alert',
                        v_student_name || ' (Class ' || COALESCE(v_student_class, 'N/A') || ') checked in today as Unwell (🤒). Note: "' || v_note || '"',
                        '/mood_note',
                        false,
                        'pending'
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_mood_flag_notify ON public.health_mood_notes;
CREATE TRIGGER on_mood_flag_notify
    AFTER INSERT OR UPDATE ON public.health_mood_notes
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_mood_flag();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
