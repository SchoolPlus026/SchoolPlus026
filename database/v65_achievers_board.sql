-- ==============================================================================
-- V65: Achievers Board — 2-Tier Gamification Module
-- Tables: badges_master, student_achievements, badge_visibility_cache
-- RPCs:   check_and_award_streak_badges, award_monthly_attendance_badge,
--         get_student_achievements, rebuild_badge_cache
-- ==============================================================================

-- ── 1. BADGES MASTER ──────────────────────────────────────────────────────────
-- Central catalog. No image blobs. Icon = Lucide icon key + hex color (text only).
CREATE TABLE IF NOT EXISTS public.badges_master (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    name         text        NOT NULL,
    description  text,
    icon_key     text        NOT NULL DEFAULT 'star',  -- Lucide icon component name
    icon_color   text        NOT NULL DEFAULT '#FFD700',
    tier         text        NOT NULL CHECK (tier IN ('class_star', 'school_champion')),
    award_type   text        NOT NULL CHECK (award_type IN ('manual', 'automated')),
    -- For automated badges: JSON rule definition
    auto_rule    jsonb,      -- e.g. {"type":"attendance_streak","days":7}
    is_active    boolean     NOT NULL DEFAULT true,
    created_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_id, name, tier)
);

ALTER TABLE public.badges_master ENABLE ROW LEVEL SECURITY;

-- All roles in same school can read the catalog
CREATE POLICY "badges_master: school read"
    ON public.badges_master FOR SELECT
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- Only admin can manage the catalog
CREATE POLICY "badges_master: admin write"
    ON public.badges_master FOR ALL
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    )
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- ── 2. STUDENT ACHIEVEMENTS ───────────────────────────────────────────────────
-- Append-only event log. Each row = one badge award event.
CREATE TABLE IF NOT EXISTS public.student_achievements (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    student_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    badge_id        uuid        NOT NULL REFERENCES public.badges_master(id) ON DELETE RESTRICT,
    -- class_id is the class name string (e.g. '10th A') — matches users.class
    class_name      text,       -- NULL = school-wide (Tier 2). Set = class-scoped (Tier 1).
    awarded_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    awarded_at      timestamptz NOT NULL DEFAULT now(),
    academic_year   text        NOT NULL DEFAULT to_char(now(), 'YYYY'),
    note            text,
    is_active       boolean     NOT NULL DEFAULT true,  -- Admin soft-delete for Tier 2
    -- Prevents duplicate automated badges for the same period
    idempotency_key text        UNIQUE  -- e.g. '{student_id}_streak7_2025-W20'
);

CREATE INDEX IF NOT EXISTS idx_achievements_student
    ON public.student_achievements(student_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_achievements_class
    ON public.student_achievements(class_name, school_id, awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_school_badge
    ON public.student_achievements(school_id, badge_id, awarded_at DESC);

ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

-- Student reads their own achievements
CREATE POLICY "achievements: student read own"
    ON public.student_achievements FOR SELECT
    USING (student_id = auth.uid() AND is_active = true);

-- Class Teacher reads achievements for their class (Tier 1)
CREATE POLICY "achievements: teacher read class"
    ON public.student_achievements FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
        AND class_name = (SELECT class FROM public.users WHERE id = auth.uid())
        AND is_active = true
    );

-- Admin reads all achievements in their school
CREATE POLICY "achievements: admin read all"
    ON public.student_achievements FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- Teacher can insert Tier 1 (class_star) badges for their own class students
CREATE POLICY "achievements: teacher insert class_star"
    ON public.student_achievements FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
        AND class_name = (SELECT class FROM public.users WHERE id = auth.uid())
    );

-- Admin can insert Tier 2 (school_champion) badges
CREATE POLICY "achievements: admin insert champion"
    ON public.student_achievements FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- Admin can soft-delete (update is_active) for Tier 2
CREATE POLICY "achievements: admin update"
    ON public.student_achievements FOR UPDATE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- ── 3. BADGE VISIBILITY CACHE ─────────────────────────────────────────────────
-- One row per student. Pre-computed for fast "badge next to name" rendering.
-- Rebuilt by RPC after any achievement change.
CREATE TABLE IF NOT EXISTS public.badge_visibility_cache (
    student_id          uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    school_id           uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    -- Tier 1: array of active class star badge metadata (class-scoped)
    active_class_stars  jsonb       DEFAULT '[]'::jsonb,
    -- e.g. [{"icon_key":"star","icon_color":"#FFD700","badge_name":"7-Day Streak"}]
    -- Tier 2: single active champion badge metadata (or null)
    active_champion     jsonb       DEFAULT NULL,
    -- e.g. {"icon_key":"trophy","icon_color":"#C0392B","badge_name":"School Topper"}
    last_updated        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_badge_cache_school
    ON public.badge_visibility_cache(school_id);

ALTER TABLE public.badge_visibility_cache ENABLE ROW LEVEL SECURITY;

-- Everyone in the same school can read the cache (needed for name rendering)
CREATE POLICY "badge_cache: school read"
    ON public.badge_visibility_cache FOR SELECT
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- ── 4. RPC: check_and_award_streak_badges ────────────────────────────────────
-- Called from the FRONTEND immediately after a teacher saves attendance.
-- Scans the saved JSONB attendance_data for the given class + month,
-- checks each student for a 7-day consecutive school-day streak,
-- and awards the badge if not already awarded this ISO week.
CREATE OR REPLACE FUNCTION public.check_and_award_streak_badges(
    p_school_id  uuid,
    p_class_name text,
    p_month_year text   -- 'YYYY-MM'
)
RETURNS TABLE(student_id uuid, badge_awarded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_streak_badge_id uuid;
    v_student         RECORD;
    v_att_data        jsonb;
    v_dates           text[];
    v_sorted_dates    text[];
    v_streak          int;
    v_i               int;
    v_week_key        text;
    v_idempotency_key text;
    v_awarded         boolean;
BEGIN
    -- Find the 7-day streak badge for this school
    SELECT id INTO v_streak_badge_id
    FROM public.badges_master
    WHERE school_id = p_school_id
      AND award_type = 'automated'
      AND auto_rule->>'type' = 'attendance_streak'
      AND (auto_rule->>'days')::int = 7
      AND is_active = true
    LIMIT 1;

    IF v_streak_badge_id IS NULL THEN
        RETURN; -- Badge not configured for this school yet
    END IF;

    -- ISO week key for idempotency (one award per week per student)
    v_week_key := to_char(now(), 'IYYY-IW');

    -- Loop over each student in this class
    FOR v_student IN
        SELECT u.id AS uid
        FROM public.users u
        WHERE u.school_id = p_school_id
          AND u.class = p_class_name
          AND u.role = 'student'
    LOOP
        v_awarded := false;
        v_idempotency_key := v_student.uid::text || '_streak7_' || v_week_key;

        -- Skip if already awarded this week
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM public.student_achievements
            WHERE idempotency_key = v_idempotency_key
        );

        -- Fetch the student's monthly attendance JSONB
        SELECT attendance_data INTO v_att_data
        FROM public.attendance
        WHERE school_id = p_school_id
          AND user_id = v_student.uid
          AND month_year = p_month_year
        LIMIT 1;

        IF v_att_data IS NULL THEN
            CONTINUE;
        END IF;

        -- Extract dates where status = 'Present', sort ascending
        SELECT ARRAY(
            SELECT key
            FROM jsonb_each_text(v_att_data)
            WHERE value = 'Present'
            ORDER BY key ASC
        ) INTO v_sorted_dates;

        IF array_length(v_sorted_dates, 1) IS NULL OR array_length(v_sorted_dates, 1) < 7 THEN
            CONTINUE;
        END IF;

        -- Count max consecutive calendar days (school days: Mon-Fri)
        v_streak := 1;
        FOR v_i IN 2..array_length(v_sorted_dates, 1) LOOP
            -- Check if consecutive school day (diff = 1 weekday, skip weekends)
            IF (v_sorted_dates[v_i]::date - v_sorted_dates[v_i-1]::date) = 1
               OR (
                  -- Monday after Friday: gap of 3 calendar days
                  EXTRACT(DOW FROM v_sorted_dates[v_i]::date) = 1
                  AND (v_sorted_dates[v_i]::date - v_sorted_dates[v_i-1]::date) = 3
               )
            THEN
                v_streak := v_streak + 1;
                IF v_streak >= 7 THEN
                    -- Award the badge
                    INSERT INTO public.student_achievements
                        (school_id, student_id, badge_id, class_name, awarded_by,
                         academic_year, note, idempotency_key)
                    VALUES (
                        p_school_id, v_student.uid, v_streak_badge_id, p_class_name,
                        auth.uid(),
                        to_char(now(), 'YYYY'),
                        'Awarded automatically for 7 consecutive school-day attendance.',
                        v_idempotency_key
                    )
                    ON CONFLICT (idempotency_key) DO NOTHING;

                    -- Rebuild cache for this student
                    PERFORM public.rebuild_badge_cache(v_student.uid);

                    -- Queue push notification
                    INSERT INTO public.app_notifications_queue
                        (school_id, user_id, title, body, route)
                    VALUES (
                        p_school_id,
                        v_student.uid,
                        '⭐ New Badge Earned!',
                        'Congratulations! You earned the "7-Day Attendance Streak" star badge.',
                        '/achievements'
                    );

                    v_awarded := true;
                    EXIT; -- Stop counting for this student
                END IF;
            ELSE
                v_streak := 1; -- Reset streak on gap
            END IF;
        END LOOP;

        student_id    := v_student.uid;
        badge_awarded := v_awarded;
        RETURN NEXT;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_award_streak_badges(uuid, text, text) TO authenticated;


-- ── 5. RPC: award_monthly_attendance_badge ────────────────────────────────────
-- Called ONCE by Admin when closing a month. Awards 100% attendance badge.
CREATE OR REPLACE FUNCTION public.award_monthly_attendance_badge(
    p_school_id  uuid,
    p_month_year text  -- 'YYYY-MM'
)
RETURNS int   -- returns count of students awarded
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_badge_id        uuid;
    v_student         RECORD;
    v_att_data        jsonb;
    v_total_days      int;
    v_present_days    int;
    v_idempotency_key text;
    v_awarded_count   int := 0;
    v_caller_role     text;
BEGIN
    -- Security: Only admin or app_manager can call this
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
    IF v_caller_role NOT IN ('admin', 'app_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Find the monthly perfect attendance badge for this school
    SELECT id INTO v_badge_id
    FROM public.badges_master
    WHERE school_id = p_school_id
      AND award_type = 'automated'
      AND auto_rule->>'type' = 'monthly_attendance_perfect'
      AND is_active = true
    LIMIT 1;

    IF v_badge_id IS NULL THEN
        RAISE EXCEPTION 'Monthly attendance badge not configured for this school.';
    END IF;

    -- Loop over all students with attendance records for this month
    FOR v_student IN
        SELECT a.user_id, a.attendance_data
        FROM public.attendance a
        JOIN public.users u ON a.user_id = u.id
        WHERE a.school_id = p_school_id
          AND a.month_year = p_month_year
          AND u.role = 'student'
    LOOP
        v_att_data := v_student.attendance_data;
        v_total_days   := (SELECT count(*) FROM jsonb_each_text(v_att_data));
        v_present_days := (SELECT count(*) FROM jsonb_each_text(v_att_data) WHERE value = 'Present');

        -- 100% present for the month
        IF v_total_days > 0 AND v_present_days = v_total_days THEN
            v_idempotency_key := v_student.user_id::text || '_monthly100_' || p_month_year;

            INSERT INTO public.student_achievements
                (school_id, student_id, badge_id, class_name, awarded_by,
                 academic_year, note, idempotency_key)
            SELECT
                p_school_id,
                v_student.user_id,
                v_badge_id,
                u.class,
                auth.uid(),
                split_part(p_month_year, '-', 1),
                '100% attendance for ' || to_char((p_month_year || '-01')::date, 'Month YYYY'),
                v_idempotency_key
            FROM public.users u WHERE u.id = v_student.user_id
            ON CONFLICT (idempotency_key) DO NOTHING;

            IF FOUND THEN
                PERFORM public.rebuild_badge_cache(v_student.user_id);

                INSERT INTO public.app_notifications_queue
                    (school_id, user_id, title, body, route)
                VALUES (
                    p_school_id,
                    v_student.user_id,
                    '🏅 Perfect Attendance!',
                    'You achieved 100% attendance for ' ||
                        to_char((p_month_year || '-01')::date, 'Month YYYY') || '!',
                    '/achievements'
                );

                v_awarded_count := v_awarded_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_awarded_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_monthly_attendance_badge(uuid, text) TO authenticated;


-- ── 6. RPC: rebuild_badge_cache ───────────────────────────────────────────────
-- Recomputes the badge_visibility_cache row for one student.
-- Called after any achievement INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.rebuild_badge_cache(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id      uuid;
    v_class_stars    jsonb;
    v_champion       jsonb;
BEGIN
    -- Get school_id for this student
    SELECT school_id INTO v_school_id FROM public.users WHERE id = p_student_id;

    -- Aggregate active Tier 1 badges
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'icon_key',    bm.icon_key,
            'icon_color',  bm.icon_color,
            'badge_name',  bm.name,
            'awarded_at',  sa.awarded_at
        ) ORDER BY sa.awarded_at DESC
    ), '[]'::jsonb)
    INTO v_class_stars
    FROM public.student_achievements sa
    JOIN public.badges_master bm ON bm.id = sa.badge_id
    WHERE sa.student_id = p_student_id
      AND sa.is_active = true
      AND bm.tier = 'class_star'
      AND sa.academic_year = to_char(now(), 'YYYY');

    -- Get the most recent active Tier 2 badge
    SELECT jsonb_build_object(
        'icon_key',   bm.icon_key,
        'icon_color', bm.icon_color,
        'badge_name', bm.name,
        'awarded_at', sa.awarded_at
    )
    INTO v_champion
    FROM public.student_achievements sa
    JOIN public.badges_master bm ON bm.id = sa.badge_id
    WHERE sa.student_id = p_student_id
      AND sa.is_active = true
      AND bm.tier = 'school_champion'
    ORDER BY sa.awarded_at DESC
    LIMIT 1;

    -- Upsert the cache row
    INSERT INTO public.badge_visibility_cache
        (student_id, school_id, active_class_stars, active_champion, last_updated)
    VALUES
        (p_student_id, v_school_id, v_class_stars, v_champion, now())
    ON CONFLICT (student_id)
    DO UPDATE SET
        active_class_stars = EXCLUDED.active_class_stars,
        active_champion    = EXCLUDED.active_champion,
        last_updated       = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_badge_cache(uuid) TO authenticated;


-- ── 7. RPC: get_student_achievements ─────────────────────────────────────────
-- Fetches all achievements for a student with full badge details.
CREATE OR REPLACE FUNCTION public.get_student_achievements(p_student_id uuid)
RETURNS TABLE (
    achievement_id  uuid,
    badge_name      text,
    badge_desc      text,
    icon_key        text,
    icon_color      text,
    tier            text,
    award_type      text,
    class_name      text,
    awarded_by_name text,
    awarded_at      timestamptz,
    note            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id,
        bm.name,
        bm.description,
        bm.icon_key,
        bm.icon_color,
        bm.tier,
        bm.award_type,
        sa.class_name,
        u.name AS awarded_by_name,
        sa.awarded_at,
        sa.note
    FROM public.student_achievements sa
    JOIN public.badges_master bm ON bm.id = sa.badge_id
    LEFT JOIN public.users u ON u.id = sa.awarded_by
    WHERE sa.student_id = p_student_id
      AND sa.is_active = true
    ORDER BY sa.awarded_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_achievements(uuid) TO authenticated;


-- ── 8. DEFAULT BADGE SEED (runs for new schools via RPC or admin action) ──────
-- These are global templates. Each school gets their own copy seeded on onboarding.
-- We create a helper to seed default badges for any new/existing school.
CREATE OR REPLACE FUNCTION public.seed_default_badges(p_school_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ── Tier 1: Automated ────────────────────────────────
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, auto_rule, created_by)
    VALUES
        (p_school_id, '7-Day Streak', 'Attended school for 7 consecutive school days.', 'flame', '#F97316', 'class_star', 'automated', '{"type":"attendance_streak","days":7}'::jsonb, p_admin_id),
        (p_school_id, 'Monthly Star', '100% attendance for a full month.', 'calendar-check', '#10B981', 'class_star', 'automated', '{"type":"monthly_attendance_perfect"}'::jsonb, p_admin_id)
    ON CONFLICT (school_id, name, tier) DO NOTHING;

    -- ── Tier 1: Manual ───────────────────────────────────
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Homework Hero', 'Consistently submits excellent homework.', 'book-open', '#6366F1', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Helping Hand', 'Goes out of their way to help classmates.', 'hand-heart', '#EC4899', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Good Behavior', 'Exemplary classroom behavior.', 'smile', '#14B8A6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Class Leader', 'Shown outstanding leadership in class.', 'shield', '#8B5CF6', 'class_star', 'manual', p_admin_id)
    ON CONFLICT (school_id, name, tier) DO NOTHING;

    -- ── Tier 2: School Champions ─────────────────────────
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'School Topper', 'Highest academic achiever in the school.', 'trophy', '#F59E0B', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Sports Gold', 'Gold medal winner in school sports.', 'medal', '#EAB308', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Student of the Year', 'Overall excellence in academics and conduct.', 'crown', '#C0392B', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Science Champion', 'Outstanding achievement in Science Olympiad.', 'flask-conical', '#2563EB', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Cultural Star', 'Excellence in cultural and artistic events.', 'music', '#7C3AED', 'school_champion', 'manual', p_admin_id)
    ON CONFLICT (school_id, name, tier) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_badges(uuid, uuid) TO authenticated;

-- ── 9. NOTIFY PGRST ──────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
