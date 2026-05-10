-- ==============================================================================
-- V51: ATTENDANCE RLS BULLETPROOF FIX
-- Objective: Shift RLS from JWT metadata to absolute Database truth and 
--            guarantee access for Platform Admins and School Admins.
-- ==============================================================================

-- 1. Drop existing JWT-based policies
DROP POLICY IF EXISTS "attendance: read own row" ON public.attendance;
DROP POLICY IF EXISTS "attendance: staff read" ON public.attendance;
DROP POLICY IF EXISTS "attendance: staff insert" ON public.attendance;
DROP POLICY IF EXISTS "attendance: staff update" ON public.attendance;

-- 2. Create Database-Level Truth Policies

-- Policy A: Students/Parents can read their own records
CREATE POLICY "attendance_read_own" ON public.attendance
FOR SELECT USING (user_id = auth.uid());

-- Policy B: Read Access for Staff & Admins
CREATE POLICY "attendance_read_staff" ON public.attendance
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (
            role IN ('platform_admin', 'app_manager') 
            OR (role IN ('admin', 'teacher', 'staff') AND school_id = public.attendance.school_id)
        )
    )
);

-- Policy C: Insert Access for Staff & Admins (Bulk Upsert Requirement 1)
CREATE POLICY "attendance_insert_staff" ON public.attendance
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (
            role IN ('platform_admin', 'app_manager') 
            OR (role IN ('admin', 'teacher', 'staff') AND school_id = public.attendance.school_id)
        )
    )
);

-- Policy D: Update Access for Staff & Admins (Bulk Upsert Requirement 2)
CREATE POLICY "attendance_update_staff" ON public.attendance
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (
            role IN ('platform_admin', 'app_manager') 
            OR (role IN ('admin', 'teacher', 'staff') AND school_id = public.attendance.school_id)
        )
    )
);

-- Note: In a bulk upsert (INSERT ... ON CONFLICT DO UPDATE), 
-- Postgres requires both INSERT (WITH CHECK) and UPDATE (USING) permissions.
