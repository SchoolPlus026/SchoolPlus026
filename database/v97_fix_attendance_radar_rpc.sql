-- ═══════════════════════════════════════════════════════════════════════════
-- v97_fix_attendance_radar_rpc.sql
-- CRITICAL FIX: Rewrite get_missing_attendance_radar to handle:
--   1. v82 compressed attendance JSONB keys (day-of-month: "18", not "2026-06-18")
--   2. Mixed UUID/name-string teacher values in timetable.teacher column
--
-- ROOT CAUSE:
--   The v82_attendance_jsonb_compression migration changed attendance_data keys
--   from full ISO dates ("2026-06-18") to compressed day-of-month integers ("18").
--   But this RPC (from v59) was never updated. Its `? v_today_date` check always
--   returns FALSE for compressed data, so the duty banner NEVER clears.
--
--   Additionally, `t.teacher::uuid` crashes on legacy timetable rows where the
--   teacher column stores a name string (e.g. 'Hajare Shubham') instead of a UUID.
--
-- AFTER THIS FIX:
--   ✅ Checks both compressed key ("18") AND legacy key ("2026-06-18")
--   ✅ Safe JOIN handles both UUID and name-string teacher values
--   ✅ Banner correctly clears after attendance is saved
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_missing_attendance_radar(p_school_id uuid)
RETURNS TABLE (
    teacher_id uuid,
    teacher_name text,
    class_name text,
    subject_name text,
    period_order integer,
    period_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today_day text := trim(to_char(CURRENT_DATE, 'Day'));   -- e.g. 'Thursday'
    v_today_iso text := to_char(CURRENT_DATE, 'YYYY-MM-DD'); -- e.g. '2026-06-18'
    v_today_day_key text := EXTRACT(DAY FROM CURRENT_DATE)::integer::text; -- e.g. '18' (no leading zero)
    v_month_year text := to_char(CURRENT_DATE, 'YYYY-MM');   -- e.g. '2026-06'
BEGIN
    RETURN QUERY
    SELECT
        u.id          AS teacher_id,
        u.name        AS teacher_name,
        t.class       AS class_name,
        t.subject     AS subject_name,
        t.period_order,
        t.period_label
    FROM public.timetable t
    -- ── SAFE JOIN: handles both UUID and name-string teacher values ──
    -- Casting the UUID id to text is always safe and prevents any type-casting crashes.
    JOIN public.users u ON (
        t.teacher = u.id::text
        OR (LOWER(TRIM(t.teacher)) = LOWER(TRIM(u.name)) AND u.role = 'teacher')
    )
    WHERE t.school_id = p_school_id
      AND t.day = v_today_day
      AND u.school_id = p_school_id
      -- ── CHECK: has ANY student in this class been marked today? ──
      -- Must check BOTH compressed day key ("18") AND legacy full-date key ("2026-06-18")
      -- because some attendance rows may not have been through the v82 compression yet.
      AND NOT EXISTS (
          SELECT 1
          FROM public.attendance a
          JOIN public.users su ON a.user_id = su.id
          WHERE a.school_id = p_school_id
            AND a.month_year = v_month_year
            AND su.class = t.class
            AND su.role = 'student'
            -- v82 compressed key: "18" (day of month as integer string)
            -- Legacy key: "2026-06-18" (full ISO date)
            AND (a.attendance_data ? v_today_day_key OR a.attendance_data ? v_today_iso)
      )
    ORDER BY t.period_order ASC;
END;
$$;
