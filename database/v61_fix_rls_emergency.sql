-- Fix RLS policy for emergency_alerts to allow all authorized staff/teachers/drivers to send alerts
DROP POLICY IF EXISTS "Emergency Alerts: Admin Insert" ON public.emergency_alerts;

CREATE POLICY "Emergency Alerts: Authorized Insert"
    ON public.emergency_alerts FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.jwt() -> 'user_metadata' ->> 'role') != 'student'
        AND sender_id = auth.uid()
    );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
