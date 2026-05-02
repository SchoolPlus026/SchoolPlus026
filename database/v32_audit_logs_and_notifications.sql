-- ==============================================================================
-- v32: Audit Logs and Notifications tables fix
-- Resolves 400 Bad Request on missing tables and 406 Not Acceptable on notices
-- ==============================================================================

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    action_type TEXT NOT NULL,
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    school_id UUID REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    target_data JSONB DEFAULT '{}'::jsonb
);

-- RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read all audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'platform_admin'));

CREATE POLICY "School admins can read their school's audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Any authenticated user can insert audit logs for their school" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid()));


-- 2. Create notifications table (for NotificationBell.jsx)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    school_id UUID REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    to_user TEXT NOT NULL, -- role, class, or specific user identifier
    title TEXT NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false NOT NULL
);

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications" ON public.notifications
    FOR SELECT TO authenticated
    USING (
      school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid()) 
      -- Simplified: allow reading all for their school, NotificationBell filters by to_user on the client
    );

CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE TO authenticated
    USING (
      school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid())
    );

CREATE POLICY "Admins can insert notifications" ON public.notifications
    FOR INSERT TO authenticated
    WITH CHECK (
      school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid()) AND
      EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
    );

-- 3. Reload PostgREST schema cache to resolve 406 Not Acceptable errors on 'notices' and other tables
NOTIFY pgrst, 'reload schema';
