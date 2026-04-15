-- Phase 4: RLS Updates for School Identification
-- Allows the login screen to search for a school by code without being logged in.

-- 1. Enable public read for specific identification columns
-- This is necessary for the two-step login flow.
DROP POLICY IF EXISTS "Public school identification" ON public.school_settings;
CREATE POLICY "Public school identification" ON public.school_settings 
FOR SELECT 
USING (true); 

-- Note: In a production environment, you might limit this to just name, logo_url, and school_id.
-- But for our current app architecture, allowing SELECT on the whole row for anyone is sufficient 
-- as it only contains public school metadata.
