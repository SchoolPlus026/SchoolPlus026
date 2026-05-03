-- ==============================================================================
-- v34: Teardown Google Drive & Revert Strict RLS
-- ==============================================================================

-- 1. Wipe out any existing Google Drive configs to prevent data leaks since we are reverting RLS
UPDATE public.school_settings SET gdrive_config = NULL;

-- 2. Drop the restrictive policies from v33
DROP POLICY IF EXISTS "Public: read safe school columns by code" ON public.school_settings;
DROP POLICY IF EXISTS "Tenant: read own school settings" ON public.school_settings;
DROP POLICY IF EXISTS "Platform admin: read all school settings" ON public.school_settings;
DROP POLICY IF EXISTS "Admin: update own school settings" ON public.school_settings;
DROP POLICY IF EXISTS "Platform admin: update any school settings" ON public.school_settings;

-- 3. Revert to the original open/working policies for school_settings to unblock UI
CREATE POLICY "Public: read school by code"
    ON public.school_settings FOR SELECT
    USING (true);

CREATE POLICY "Manager: full school settings access"
    ON public.school_settings FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
