-- ═══════════════════════════════════════════════════════════════════════════
-- v84_cascading_deletes_and_rpc_codec_fix.sql
-- Optimization Step 4: Cascading Deletes Hardening + Attendance Codec Fix in RPCs
--
-- WHY THIS MIGRATION EXISTS:
--
-- FIX 1 — Cascading Foreign Key on student_achievements.badge_id (P1):
--   In v65, `student_achievements.badge_id` references `badges_master(id)` with
--   `ON DELETE RESTRICT`. This means that if an admin tries to delete a badge
--   from `badges_master`, the operation will fail with a foreign key violation
--   as long as any student has been awarded that badge.
--
--   The correct behavior is `ON DELETE CASCADE`: when a badge definition is
--   deleted from `badges_master`, all award records for that badge in
--   `student_achievements` should also be automatically deleted, and then the
--   `badge_visibility_cache` (which stores JSONB, not badge FKs) will be
--   refreshed on next rebuild.
--
--   NOTE: The `badge_visibility_cache` table stores badge metadata as JSONB
--   objects, not as foreign key references to `badges_master.id`. It therefore
--   does NOT need a CASCADE fix — the cache is rebuilt via `rebuild_badge_cache()`
--   after any achievement change.
--
-- FIX 2 — Attendance Codec: Update RPCs to use compressed status codes (P0):
--   v82 changed `attendance_data` JSONB to use compressed keys and values:
--     Keys:   "2026-05-07" → "7"  (day-of-month integer string, no leading zeros)
--     Values: "Present" → "P", "Absent" → "A", "Late" → "L", etc.
--
--   However, two database RPCs still query for the OLD uncompressed values:
--
--   A) `check_and_award_streak_badges` (v65):
--      Line: WHERE value = 'Present'
--      After v82, the value is 'P' not 'Present'. This means the streak check
--      will NEVER award a badge because `value = 'Present'` returns zero rows.
--      This is a silent breakage — no error is thrown but no badges are awarded.
--
--   B) `award_monthly_attendance_badge` (v65):
--      Line: WHERE value = 'Present'
--      Same issue — the 100% attendance badge will never be awarded because
--      the count of 'Present' values will always be 0 after compression.
--
--   ADDITIONALLY in `check_and_award_streak_badges`:
--      The streak detection sorts attendance keys and compares them as dates:
--        v_sorted_dates[v_i]::date - v_sorted_dates[v_i-1]::date
--      After v82, keys are day-number strings ("1", "7", "31"), NOT full ISO
--      dates ("2026-05-01"). Casting "7"::date throws a type error.
--      We must reconstruct full ISO dates from the parent row's `month_year`.
--
-- WHAT THIS MIGRATION DOES:
--   1. Drops and rebuilds the FK on student_achievements.badge_id with CASCADE.
--   2. Rebuilds check_and_award_streak_badges() to:
--      a) Query `value = 'P'` (compressed Present code)
--      b) Reconstruct full ISO dates from `month_year + dayKey` before
--         performing date arithmetic for streak calculation.
--   3. Rebuilds award_monthly_attendance_badge() to query `value = 'P'`.
--
-- WRITTEN: 2026-06-01
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: Rebuild badge_id foreign key with ON DELETE CASCADE
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1a: Drop the old RESTRICT constraint
ALTER TABLE public.student_achievements
  DROP CONSTRAINT IF EXISTS student_achievements_badge_id_fkey;

-- Step 1b: Add the new CASCADE constraint
ALTER TABLE public.student_achievements
  ADD CONSTRAINT student_achievements_badge_id_fkey
  FOREIGN KEY (badge_id)
  REFERENCES public.badges_master(id)
  ON DELETE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2A: Rebuild check_and_award_streak_badges()
--
-- CHANGES FROM v65:
--   - WHERE value = 'Present'  →  WHERE value = 'P'
--   - Keys ("7", "31") are now day integers, not ISO dates.
--     Before streak date comparison, we reconstruct full dates as:
--       (p_month_year || '-' || lpad(key, 2, '0'))::date
--   - Preserves all existing logic (7-day streak, Mon-Fri school days,
--     idempotency keys, cache rebuild, push notification).
-- ─────────────────────────────────────────────────────────────────────────────

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
    v_day_keys        text[];    -- compressed day keys e.g. {"1","7","31"}
    v_iso_dates       date[];    -- reconstructed full dates for streak math
    v_streak          int;
    v_i               int;
    v_week_key        text;
    v_idempotency_key text;
    v_awarded         boolean;
    v_day_key         text;
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

        -- ── v84 CODEC FIX ─────────────────────────────────────────────────────
        -- After v82 compression, keys are day-number strings ("1"–"31")
        -- and values are single-char codes ("P"=Present, "A"=Absent, etc.).
        -- We filter for value = 'P' (was 'Present') and reconstruct full
        -- ISO date strings from the parent row's month_year column BEFORE
        -- performing date arithmetic.
        -- ─────────────────────────────────────────────────────────────────────

        -- Extract day keys where student was Present (value = 'P'), sorted by day number
        SELECT ARRAY(
            SELECT key
            FROM jsonb_each_text(v_att_data)
            WHERE value = 'P'   -- ← was 'Present' in v65; fixed for v82 compression
            ORDER BY key::integer ASC
        ) INTO v_day_keys;

        IF array_length(v_day_keys, 1) IS NULL OR array_length(v_day_keys, 1) < 7 THEN
            CONTINUE;
        END IF;

        -- Reconstruct full ISO dates from month_year + day key for date arithmetic
        -- e.g. p_month_year='2026-05', key='7' → '2026-05-07'::date
        SELECT ARRAY(
            SELECT (p_month_year || '-' || lpad(d, 2, '0'))::date
            FROM unnest(v_day_keys) AS d
            ORDER BY (p_month_year || '-' || lpad(d, 2, '0'))::date ASC
        ) INTO v_iso_dates;

        -- Count max consecutive calendar days (school days: Mon–Fri)
        v_streak := 1;
        FOR v_i IN 2..array_length(v_iso_dates, 1) LOOP
            IF (v_iso_dates[v_i] - v_iso_dates[v_i-1]) = 1
               OR (
                  -- Monday after Friday: gap of 3 calendar days is still consecutive
                  EXTRACT(DOW FROM v_iso_dates[v_i]) = 1
                  AND (v_iso_dates[v_i] - v_iso_dates[v_i-1]) = 3
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
                        (school_id, user_id, title, body, route, is_ephemeral, status)
                    VALUES (
                        p_school_id,
                        v_student.uid,
                        '⭐ New Badge Earned!',
                        'Congratulations! You earned the "7-Day Attendance Streak" star badge.',
                        '/achievements',
                        true,
                        'pending'
                    );

                    v_awarded := true;
                    EXIT; -- Stop counting for this student once streak is found
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


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2B: Rebuild award_monthly_attendance_badge()
--
-- CHANGES FROM v65:
--   - WHERE value = 'Present'  →  WHERE value = 'P'
--   - All other logic (100% check, idempotency, badge award, notification)
--     is preserved exactly as written in v65.
-- ─────────────────────────────────────────────────────────────────────────────

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
        v_att_data     := v_student.attendance_data;
        v_total_days   := (SELECT count(*) FROM jsonb_each_text(v_att_data));
        -- ── v84 CODEC FIX: was 'Present', now 'P' after v82 compression ──
        v_present_days := (SELECT count(*) FROM jsonb_each_text(v_att_data) WHERE value = 'P');

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
                    (school_id, user_id, title, body, route, is_ephemeral, status)
                VALUES (
                    p_school_id,
                    v_student.user_id,
                    '🏅 Perfect Attendance!',
                    'You achieved 100% attendance for ' ||
                        to_char((p_month_year || '-01')::date, 'Month YYYY') || '!',
                    '/achievements',
                    true,
                    'pending'
                );

                v_awarded_count := v_awarded_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_awarded_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_monthly_attendance_badge(uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: Verification Queries
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Confirm the FK on student_achievements is now CASCADE (not RESTRICT)
SELECT
  tc.constraint_name,
  rc.delete_rule,
  kcu.column_name,
  ccu.table_name AS referenced_table
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_name = 'student_achievements'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'badge_id';
-- Expected: delete_rule = 'CASCADE' (was 'RESTRICT')

-- 3b. Confirm the two rebuilt RPCs exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'check_and_award_streak_badges',
    'award_monthly_attendance_badge'
  );
-- Expected: 2 rows returned
