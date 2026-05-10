-- ==============================================================================
-- Phase 1, Step 1: Attendance JSONB Refactor & Data Migration
-- Objective: Convert daily attendance rows into Student-Centric Monthly JSONB
-- ==============================================================================

-- 1. Create the new JSONB table
CREATE TABLE public.attendance_monthly (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    month_year text NOT NULL, -- Format: 'YYYY-MM'
    attendance_data jsonb DEFAULT '{}'::jsonb, -- Format: {"YYYY-MM-DD": "Present"}
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (school_id, user_id, month_year)
);

-- 2. Safely Migrate Data from old table to new table
DO $$
DECLARE
    r RECORD;
    v_month_year text;
    v_date_str text;
BEGIN
    RAISE NOTICE 'Starting Attendance Migration...';
    
    -- Loop through all existing attendance records ordered by date
    FOR r IN SELECT * FROM public.attendance ORDER BY date ASC
    LOOP
        v_month_year := to_char(r.date, 'YYYY-MM');
        v_date_str := to_char(r.date, 'YYYY-MM-DD');
        
        -- Upsert into the new monthly table
        INSERT INTO public.attendance_monthly (school_id, user_id, month_year, attendance_data)
        VALUES (
            r.school_id, 
            r.user_id, 
            v_month_year, 
            jsonb_build_object(v_date_str, r.status)
        )
        ON CONFLICT (school_id, user_id, month_year) 
        DO UPDATE SET 
            attendance_data = public.attendance_monthly.attendance_data || EXCLUDED.attendance_data,
            updated_at = now();
    END LOOP;
    
    RAISE NOTICE 'Attendance Migration Completed Successfully.';
END $$;

-- 3. Drop the old table (This safely cascades and drops the old trigger 'on_attendance_notify' as well)
DROP TABLE public.attendance CASCADE;

-- 4. Rename the new table to replace the old one
ALTER TABLE public.attendance_monthly RENAME TO attendance;

-- 5. Create highly optimized B-Tree Composite Indexes (Avoids GIN write-amplification)
CREATE INDEX idx_attendance_user_month ON public.attendance (user_id, month_year);
CREATE INDEX idx_attendance_school_month ON public.attendance (school_id, month_year);

-- 6. Apply strictly hardened Row-Level Security (RLS)
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Policy A: Students and Parents can ONLY read their own records
CREATE POLICY "attendance: read own row"
    ON public.attendance FOR SELECT
    USING (auth.uid() = user_id);

-- Policy B: Staff (Admins/Teachers) can read all attendance for their specific school
CREATE POLICY "attendance: staff read"
    ON public.attendance FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'teacher', 'app_manager')
    );

-- Policy C: Staff can insert/upsert attendance for their specific school
CREATE POLICY "attendance: staff insert"
    ON public.attendance FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'teacher', 'app_manager')
    );

-- Policy D: Staff can update existing attendance for their specific school
CREATE POLICY "attendance: staff update"
    ON public.attendance FOR UPDATE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'teacher', 'app_manager')
    );
