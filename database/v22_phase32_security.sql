-- Phase 32: Intelligence & Security

-- 1. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type TEXT NOT NULL,
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    school_id UUID REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    target_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only Platform Admin can read all audit logs
CREATE POLICY "Platform Admin read audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    );

-- Any authenticated user can insert an audit log (so we can log their actions)
CREATE POLICY "Auth insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
    );

-- 2. Create Platform Analytics RPC (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION get_platform_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_schools INT;
    total_students INT;
    total_teachers INT;
    premium_schools INT;
BEGIN
    SELECT count(*) INTO total_schools FROM public.school_settings;
    SELECT count(*) INTO premium_schools FROM public.school_settings WHERE subscription_tier = 'Premium';
    SELECT count(*) INTO total_students FROM public.users WHERE role = 'student';
    SELECT count(*) INTO total_teachers FROM public.users WHERE role = 'teacher';

    RETURN json_build_object(
        'total_schools', total_schools,
        'premium_schools', premium_schools,
        'total_students', total_students,
        'total_teachers', total_teachers
    );
END;
$$;
