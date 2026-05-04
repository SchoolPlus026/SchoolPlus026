-- ==========================================
-- 1. Create subscription_plans Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  amount_paise integer NOT NULL, -- Stored in paise (₹100 = 10000)
  validity_days integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS for subscription_plans
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if running multiple times
DROP POLICY IF EXISTS "Schools can view active plans" ON public.subscription_plans;

-- Schools can only view active plans
CREATE POLICY "Schools can view active plans" 
  ON public.subscription_plans
  FOR SELECT 
  TO authenticated 
  USING (is_active = true);


-- ==========================================
-- 2. Create subscription_transactions Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.subscription_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  razorpay_order_id text UNIQUE NOT NULL, -- Ensures Webhook Idempotency
  razorpay_payment_id text UNIQUE,
  amount_paise integer NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED')) DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS for subscription_transactions
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if running multiple times
DROP POLICY IF EXISTS "Schools can view their own transactions" ON public.subscription_transactions;

-- Schools can only view their own transactions
CREATE POLICY "Schools can view their own transactions" 
  ON public.subscription_transactions
  FOR SELECT 
  TO authenticated 
  USING (
    school_id IN (
      SELECT school_id FROM public.users WHERE id = auth.uid() 
    )
  );

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_transaction_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_subscription_transactions_modtime ON public.subscription_transactions;

CREATE TRIGGER update_subscription_transactions_modtime
  BEFORE UPDATE ON public.subscription_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_modtime();


-- ==========================================
-- 3. Update Existing school_settings Table
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='school_settings' AND column_name='subscription_end_date') THEN
        ALTER TABLE public.school_settings ADD COLUMN subscription_end_date timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='school_settings' AND column_name='trial_end_date') THEN
        ALTER TABLE public.school_settings ADD COLUMN trial_end_date timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='school_settings' AND column_name='current_plan_id') THEN
        ALTER TABLE public.school_settings ADD COLUMN current_plan_id uuid REFERENCES public.subscription_plans(id);
    END IF;
END $$;

-- Drop existing policy if running multiple times
DROP POLICY IF EXISTS "Schools can view their own settings" ON public.school_settings;

-- Ensure RLS on school_settings
CREATE POLICY "Schools can view their own settings" 
  ON public.school_settings
  FOR SELECT 
  TO authenticated 
  USING (
    school_id IN (
      SELECT school_id FROM public.users WHERE id = auth.uid()
    )
  );
