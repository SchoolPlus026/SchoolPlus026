-- ═══════════════════════════════════════════════════════════════════════════
-- v96_off_classes_substitution.sql
-- Off Classes: Full Auto-Substitution Engine
--
-- This migration creates two new tables to support the smart substitute
-- allocation workflow for the Off Classes module:
--
-- 1. timetable_free_periods
--    Teachers declare which of their timetable slots are "free" on a given
--    calendar date. Used by the auto-allocation engine to find available subs.
--
-- 2. substitutions
--    Tracks each substitution assignment: which teacher is covering which
--    absent teacher's class, at what time, on which date. Supports status
--    tracking (pending → accepted → completed) and realtime notifications.
--
-- REALTIME: supabase_realtime is enabled on substitutions so the OffClasses
-- dashboard receives live assignment updates without page refresh.
--
-- RLS:
--   - Teachers can manage their own free_periods.
--   - Admins have full access to both tables within their school.
--   - All users of the school can SELECT substitutions (needed for banner view).
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1: timetable_free_periods
-- A teacher registers a specific timetable slot as "free" for a specific date.
-- This is ephemeral (date-scoped), not a permanent timetable change.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.timetable_free_periods (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id   uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    teacher_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- The day of week (e.g. 'Monday') — used to match timetable.day
    day         text NOT NULL,
    period_order integer NOT NULL,
    -- The specific calendar date for which this free period is declared
    date        date NOT NULL DEFAULT CURRENT_DATE,
    created_at  timestamptz DEFAULT now(),
    -- A teacher can only declare a slot free once per date
    UNIQUE (school_id, teacher_id, day, period_order, date)
);

ALTER TABLE public.timetable_free_periods ENABLE ROW LEVEL SECURITY;

-- All school members can view free period declarations (needed for admin allocation)
CREATE POLICY "free_periods: school read"
    ON public.timetable_free_periods FOR SELECT
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- Teachers can insert/delete their own free period declarations
CREATE POLICY "free_periods: teacher insert"
    ON public.timetable_free_periods FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND teacher_id = auth.uid()
    );

CREATE POLICY "free_periods: teacher delete"
    ON public.timetable_free_periods FOR DELETE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND teacher_id = auth.uid()
    );

-- Admins can also manage free periods (e.g. for seeding or override)
CREATE POLICY "free_periods: admin manage"
    ON public.timetable_free_periods FOR ALL
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2: substitutions
-- Tracks each substitution assignment for a specific class period on a date.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.substitutions (
    id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id             uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    -- The absent teacher whose slot needs covering
    original_teacher_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    -- The substitute teacher assigned to cover the slot
    substitute_teacher_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    class                 text NOT NULL,
    subject               text,
    day                   text NOT NULL,
    period_order          integer NOT NULL,
    period_label          text,
    -- The specific calendar date of this substitution
    date                  date NOT NULL DEFAULT CURRENT_DATE,
    -- Who assigned this substitution: 'admin' (manual) or 'auto' (5-min rule)
    assigned_by           text DEFAULT 'admin' CHECK (assigned_by IN ('admin', 'auto')),
    assigned_at           timestamptz DEFAULT now(),
    -- Workflow status
    status                text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
    -- When the substitute marked the class as "taken"
    taken_at              timestamptz,
    created_at            timestamptz DEFAULT now(),
    -- Prevent duplicate assignments for the same slot on the same date
    UNIQUE (school_id, original_teacher_id, date, period_order)
);

ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;

-- All school members can view substitutions (needed for teacher dashboard banner)
CREATE POLICY "substitutions: school read"
    ON public.substitutions FOR SELECT
    USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- Admins can insert/update/delete substitutions
CREATE POLICY "substitutions: admin manage"
    ON public.substitutions FOR ALL
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'platform_admin')
    );

-- Substitute teachers can update status on their own assignments (mark as taken)
CREATE POLICY "substitutions: sub teacher update"
    ON public.substitutions FOR UPDATE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND substitute_teacher_id = auth.uid()
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME: Enable live updates on substitutions table
-- This allows the OffClasses dashboard to instantly reflect new assignments.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.substitutions;
