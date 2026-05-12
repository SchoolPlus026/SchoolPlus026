-- ==============================================================================
-- V59: Phase 4 - Advanced Automation & Utilities
-- ==============================================================================

-- ── 1. Emergency Alerts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emergency_alerts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    alert_type text NOT NULL, -- 'weather', 'lockdown', 'general', 'medical'
    message text NOT NULL,
    target_audience text NOT NULL DEFAULT 'all', -- 'all', 'staff', 'students', 'admin', 'specific_students'
    target_users uuid[], -- Array of student IDs if specific_students
    status text NOT NULL DEFAULT 'active', -- 'active', 'resolved'
    created_at timestamptz DEFAULT now(),
    resolved_at timestamptz
);

ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Emergency Alerts: Read Access"
    ON public.emergency_alerts FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    );

CREATE POLICY "Emergency Alerts: Admin Insert"
    ON public.emergency_alerts FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'platform_admin', 'teacher')
    );

CREATE POLICY "Emergency Alerts: Admin Update"
    ON public.emergency_alerts FOR UPDATE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'platform_admin')
    );

-- Enable Realtime for Emergency Alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_alerts;


-- ── 2. Lost & Found ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lost_and_found (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    reported_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    item_name text NOT NULL,
    description text,
    photo_url text NOT NULL, -- COMPULSORY now
    location_found text,
    target_class text, -- if null, entire school. otherwise specific class
    status text NOT NULL DEFAULT 'active', -- 'active', 'claimed', 'resolved'
    claimed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.lost_and_found ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lost & Found: Read Access"
    ON public.lost_and_found FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    );

CREATE POLICY "Lost & Found: Insert Access"
    ON public.lost_and_found FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        -- Anyone can report items
    );

CREATE POLICY "Lost & Found: Update Access"
    ON public.lost_and_found FOR UPDATE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    );


-- ── 3. Executive Briefings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.executive_briefings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    date date NOT NULL DEFAULT CURRENT_DATE,
    summary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    UNIQUE(school_id, date)
);

ALTER TABLE public.executive_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executive Briefing: Admin Read"
    ON public.executive_briefings FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'platform_admin')
    );

-- System RPC or Edge function will handle inserts via Service Role.


-- ── 4. Teacher Duty Radar RPC ─────────────────────────────────────────────
-- Returns a list of teachers who have periods assigned for the current day/period 
-- but have NOT logged any attendance data today.
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
    v_today_day text := to_char(CURRENT_DATE, 'Day'); -- e.g. 'Monday   '
    v_today_date text := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    v_month_year text := to_char(CURRENT_DATE, 'YYYY-MM');
BEGIN
    v_today_day := trim(v_today_day);

    RETURN QUERY
    SELECT 
        u.id AS teacher_id,
        u.name AS teacher_name,
        t.class AS class_name,
        t.subject AS subject_name,
        t.period_order,
        t.period_label
    FROM public.timetable t
    JOIN public.users u ON t.teacher::uuid = u.id
    WHERE t.school_id = p_school_id
      AND t.day = v_today_day
      AND NOT EXISTS (
          -- Check if this teacher has inserted ANY attendance for today
          -- Note: In v48 jsonb schema, attendance is stored as monthly records per student.
          -- We assume the teacher logs attendance, which sets `marked_by` or simply that 
          -- attendance exists for the `class` they are teaching. Since v48 attendance doesn't 
          -- strictly store `class` or `marked_by` easily queryable at the row level without 
          -- joining users, we will check if ANY student in `t.class` has attendance for today.
          SELECT 1 
          FROM public.attendance a
          JOIN public.users su ON a.user_id = su.id
          WHERE a.school_id = p_school_id
            AND a.month_year = v_month_year
            AND su.class = t.class
            AND a.attendance_data ? v_today_date
      )
    ORDER BY t.period_order ASC;
END;
$$;
