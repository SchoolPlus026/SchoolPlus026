-- ==========================================
-- Fix RLS Policies for subscription_plans
-- Changing from 'app_manager' in JWT to 'platform_admin' in users table
-- ==========================================

-- Allow Admins to INSERT new plans
DROP POLICY IF EXISTS "Admins can insert plans" ON public.subscription_plans;
CREATE POLICY "Admins can insert plans" 
  ON public.subscription_plans
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'platform_admin'
    )
  );

-- Allow Admins to UPDATE existing plans
DROP POLICY IF EXISTS "Admins can update plans" ON public.subscription_plans;
CREATE POLICY "Admins can update plans" 
  ON public.subscription_plans
  FOR UPDATE 
  TO authenticated 
  USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'platform_admin'
    )
  );

-- Allow Admins to DELETE plans
DROP POLICY IF EXISTS "Admins can delete plans" ON public.subscription_plans;
CREATE POLICY "Admins can delete plans" 
  ON public.subscription_plans
  FOR DELETE 
  TO authenticated 
  USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'platform_admin'
    )
  );

-- Allow Admins to SELECT all plans (including inactive ones)
DROP POLICY IF EXISTS "Admins can view all plans" ON public.subscription_plans;
CREATE POLICY "Admins can view all plans" 
  ON public.subscription_plans
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role = 'platform_admin'
    )
  );
