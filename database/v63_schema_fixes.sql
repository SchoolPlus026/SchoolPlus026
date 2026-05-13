-- Fix RLS policy for lost_and_found to allow all authenticated users (including drivers) to insert
DROP POLICY IF EXISTS "Lost & Found: Insert Access" ON public.lost_and_found;

CREATE POLICY "Lost & Found: Insert Access"
    ON public.lost_and_found FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND auth.uid() = reported_by
    );

CREATE POLICY "Lost & Found: Delete Access"
    ON public.lost_and_found FOR DELETE
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid 
        AND (auth.uid() = reported_by OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'platform_admin'))
    );

-- Fix app_notifications_queue missing recipient_id error
ALTER TABLE public.app_notifications_queue ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.users(id);

-- Add target_module to kb_articles
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS target_module text;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
