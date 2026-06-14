-- v88: Security Hardening and RLS Query Optimization
-- Optimizes RLS subqueries using STABLE database lookup helpers to resolve CPU spikes and Capacitor load delays.

-- 1. Create STABLE lookup helper functions (marked SECURITY DEFINER to bypass RLS and avoid infinite recursion)
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 2. Optimize public.support_tickets RLS policies
DROP POLICY IF EXISTS "School Admin read tickets" ON public.support_tickets;
CREATE POLICY "School Admin read tickets" ON public.support_tickets
    FOR SELECT TO authenticated
    USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "School Admin insert tickets" ON public.support_tickets;
CREATE POLICY "School Admin insert tickets" ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Platform Admin all tickets" ON public.support_tickets;
CREATE POLICY "Platform Admin all tickets" ON public.support_tickets
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'platform_admin');

-- 3. Optimize public.subscription_transactions RLS policies
DROP POLICY IF EXISTS "School admin: read own transactions" ON public.subscription_transactions;
CREATE POLICY "School admin: read own transactions"
    ON public.subscription_transactions
    FOR SELECT TO authenticated
    USING (
      school_id = public.get_my_school_id()
      AND public.get_my_role() = 'admin'
    );

-- 4. Optimize public.school_settings RLS policies
DROP POLICY IF EXISTS "Tenant: read own school settings" ON public.school_settings;
CREATE POLICY "Tenant: read own school settings"
    ON public.school_settings FOR SELECT TO authenticated
    USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Platform admin: read all school settings" ON public.school_settings;
CREATE POLICY "Platform admin: read all school settings"
    ON public.school_settings FOR SELECT TO authenticated
    USING (public.get_my_role() = 'platform_admin');

DROP POLICY IF EXISTS "Admin: update own school settings" ON public.school_settings;
CREATE POLICY "Admin: update own school settings"
    ON public.school_settings FOR UPDATE TO authenticated
    USING (
      school_id = public.get_my_school_id()
      AND public.get_my_role() = 'admin'
    );

DROP POLICY IF EXISTS "Platform admin: update any school settings" ON public.school_settings;
CREATE POLICY "Platform admin: update any school settings"
    ON public.school_settings FOR UPDATE TO authenticated
    USING (public.get_my_role() = 'platform_admin');

-- 5. Optimize public.payment_requests RLS policies
DROP POLICY IF EXISTS "School can manage own payment requests" ON public.payment_requests;
CREATE POLICY "School can manage own payment requests" ON public.payment_requests
    FOR ALL TO authenticated
    USING (school_id = public.get_my_school_id())
    WITH CHECK (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Platform Admin all payment requests" ON public.payment_requests;
CREATE POLICY "Platform Admin all payment requests" ON public.payment_requests
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'platform_admin');

-- 6. Optimize public.audit_logs RLS policies
DROP POLICY IF EXISTS "Platform admin: read all audit logs" ON public.audit_logs;
CREATE POLICY "Platform admin: read all audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.get_my_role() = 'platform_admin');

DROP POLICY IF EXISTS "Admin: read own school audit logs" ON public.audit_logs;
CREATE POLICY "Admin: read own school audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (
      school_id = public.get_my_school_id()
      AND public.get_my_role() = 'admin'
    );

DROP POLICY IF EXISTS "Authenticated: insert audit logs for own school" ON public.audit_logs;
CREATE POLICY "Authenticated: insert audit logs for own school"
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (school_id = public.get_my_school_id());

-- 7. Optimize public.notifications RLS policies
DROP POLICY IF EXISTS "Tenant: read own notifications" ON public.notifications;
CREATE POLICY "Tenant: read own notifications"
    ON public.notifications FOR SELECT TO authenticated
    USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Tenant: update own notifications" ON public.notifications;
CREATE POLICY "Tenant: update own notifications"
    ON public.notifications FOR UPDATE TO authenticated
    USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Admins and teachers can insert notifications" ON public.notifications;
CREATE POLICY "Admins and teachers can insert notifications"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (
      school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('admin', 'teacher')
    );

-- 8. Optimize public.complaint_box RLS policies (replaces old principals_desk)
DROP POLICY IF EXISTS "complaint_box_insert" ON public.complaint_box;
CREATE POLICY "complaint_box_insert" ON public.complaint_box
    FOR INSERT TO authenticated
    WITH CHECK (
      school_id = public.get_my_school_id()
      AND sender_id = auth.uid()
    );

DROP POLICY IF EXISTS "complaint_box_select_admin" ON public.complaint_box;
CREATE POLICY "complaint_box_select_admin" ON public.complaint_box
    FOR SELECT TO authenticated
    USING (
      public.get_my_role() IN ('platform_admin', 'app_manager')
      OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
    );

DROP POLICY IF EXISTS "complaint_box_update" ON public.complaint_box;
CREATE POLICY "complaint_box_update" ON public.complaint_box
    FOR UPDATE TO authenticated
    USING (
      recipient_id = auth.uid()
      OR public.get_my_role() IN ('platform_admin', 'app_manager')
      OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
    );

-- 9. Optimize public.syllabus_tracker RLS policies
DROP POLICY IF EXISTS "syllabus_tracker_select" ON public.syllabus_tracker;
CREATE POLICY "syllabus_tracker_select" ON public.syllabus_tracker
    FOR SELECT TO authenticated
    USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "syllabus_tracker_all" ON public.syllabus_tracker;
CREATE POLICY "syllabus_tracker_all" ON public.syllabus_tracker
    FOR ALL TO authenticated
    USING (
      school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('admin', 'platform_admin', 'teacher')
    );

-- 10. Optimize public.health_mood_notes RLS policies
DROP POLICY IF EXISTS "health_mood_notes_select" ON public.health_mood_notes;
CREATE POLICY "health_mood_notes_select" ON public.health_mood_notes
    FOR SELECT TO authenticated
    USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "health_mood_notes_all" ON public.health_mood_notes;
CREATE POLICY "health_mood_notes_all" ON public.health_mood_notes
    FOR ALL TO authenticated
    USING (
      school_id = public.get_my_school_id()
      AND public.get_my_role() IN ('admin', 'platform_admin', 'student', 'teacher')
    );

-- 11. Optimize public.gallery RLS policies
DROP POLICY IF EXISTS "Tenant: gallery access" ON public.gallery;
CREATE POLICY "Tenant: gallery access" ON public.gallery
    FOR ALL TO authenticated
    USING (school_id = public.get_my_school_id())
    WITH CHECK (school_id = public.get_my_school_id());

-- 12. Optimize public.notices RLS policies
DROP POLICY IF EXISTS "Tenant: notices access" ON public.notices;
CREATE POLICY "Tenant: notices access" ON public.notices
    FOR ALL TO authenticated
    USING (school_id = public.get_my_school_id())
    WITH CHECK (school_id = public.get_my_school_id());

-- 13. Reload schema
NOTIFY pgrst, 'reload schema';
