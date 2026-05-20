-- ==============================================================================
-- V73: SAAS MONETIZATION CONTROLS (TIER & ACCESS CONTROL)
-- ==============================================================================
-- Add columns to platform_settings (for global defaults) and school_settings
-- (for school-specific overrides) to manage locked features dynamically on the Free plan.

-- 1. Add free_tier_locked_modules to platform_settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='free_tier_locked_modules') THEN
        ALTER TABLE public.platform_settings ADD COLUMN free_tier_locked_modules JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- 2. Add locked_modules to school_settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='school_settings' AND column_name='locked_modules') THEN
        ALTER TABLE public.school_settings ADD COLUMN locked_modules JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- 3. Ensure Platform admin has a robust update policy on school_settings
DROP POLICY IF EXISTS "Platform admin: update any school settings" ON public.school_settings;
CREATE POLICY "Platform admin: update any school settings"
  ON public.school_settings
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  )
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );

-- 4. Ensure Platform admin has a robust update policy on platform_settings
DROP POLICY IF EXISTS "Platform admin: update platform settings" ON public.platform_settings;
CREATE POLICY "Platform admin: update platform settings"
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  )
  WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'platform_admin'
  );

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';
