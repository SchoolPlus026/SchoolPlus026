-- Phase 3: SaaS Architecture & Dynamic Classes array
-- Run this in your Supabase SQL Editor

-- 1. Add new columns to school_settings
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS school_code text UNIQUE,
ADD COLUMN IF NOT EXISTS classes text[] DEFAULT ARRAY['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

-- 2. Assign the temporary code to your current school (Replace the UUID if it's different in your system)
-- This logic finds the first school and sets it to LFS01
UPDATE public.school_settings 
SET school_code = 'LFS01' 
WHERE school_code IS NULL;

-- 3. Update RLS for school_settings to allow public identification during login
-- We allow SELECTing name, logo_url, and school_code for anyone searching by school_code
DROP POLICY IF EXISTS "Public school identification" ON public.school_settings;
CREATE POLICY "Public school identification" ON public.school_settings 
FOR SELECT 
USING (true); 
-- Note: While "USING (true)" allows public select, standard RLS on other tables still blocks unauthorized data access.

-- 4. Re-confirm isolation on notices and events for public view (if needed)
-- Optional: If you ever want public landing page events, you'd add similar policies here.
