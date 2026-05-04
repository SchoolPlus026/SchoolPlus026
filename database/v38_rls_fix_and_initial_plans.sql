-- ==========================================
-- 1. RLS Fixes for subscription_plans
-- (Only Platform Admins can INSERT/UPDATE/DELETE)
-- ==========================================

-- Allow Admins to INSERT new plans
DROP POLICY IF EXISTS "Admins can insert plans" ON public.subscription_plans;
CREATE POLICY "Admins can insert plans" 
  ON public.subscription_plans
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager'
  );

-- Allow Admins to UPDATE existing plans
DROP POLICY IF EXISTS "Admins can update plans" ON public.subscription_plans;
CREATE POLICY "Admins can update plans" 
  ON public.subscription_plans
  FOR UPDATE 
  TO authenticated 
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager'
  );

-- Allow Admins to DELETE plans
DROP POLICY IF EXISTS "Admins can delete plans" ON public.subscription_plans;
CREATE POLICY "Admins can delete plans" 
  ON public.subscription_plans
  FOR DELETE 
  TO authenticated 
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager'
  );

-- Allow Admins to SELECT all plans (including inactive ones)
DROP POLICY IF EXISTS "Admins can view all plans" ON public.subscription_plans;
CREATE POLICY "Admins can view all plans" 
  ON public.subscription_plans
  FOR SELECT 
  TO authenticated 
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager'
  );


-- ==========================================
-- 2. Insert Initial Default Subscription Plans
-- ==========================================

-- Monthly Plan: ₹500 for 28 days
INSERT INTO public.subscription_plans (name, amount_paise, validity_days, is_active)
VALUES ('Premium Monthly', 50000, 28, true);

-- Annual Plan: ₹5000 for 365 days (Best Value)
INSERT INTO public.subscription_plans (name, amount_paise, validity_days, is_active)
VALUES ('Premium Annual', 500000, 365, true);
