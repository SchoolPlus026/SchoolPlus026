-- ==========================================
-- v40: RLS Fixes for subscription_transactions
-- ==========================================

-- Enable RLS
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Drop any potentially permissive existing policies
DROP POLICY IF EXISTS "Users can view all transactions" ON public.subscription_transactions;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.subscription_transactions;
DROP POLICY IF EXISTS "School admins can view own transactions" ON public.subscription_transactions;
DROP POLICY IF EXISTS "App managers can view all transactions" ON public.subscription_transactions;
DROP POLICY IF EXISTS "Anyone can view transactions" ON public.subscription_transactions;

-- 1. School Admins can strictly only view their own school's transactions
CREATE POLICY "School admins can view own transactions"
  ON public.subscription_transactions
  FOR SELECT
  TO authenticated
  USING (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 2. Platform Admins (app_manager) can view all transactions across the system
CREATE POLICY "App managers can view all transactions"
  ON public.subscription_transactions
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager'
  );

-- Note: INSERT / UPDATE are handled exclusively by secure Supabase Edge Functions 
-- using the service_role key, so no frontend mutating policies are required.
