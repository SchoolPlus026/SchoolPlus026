-- Phase 31: Monetization & Feature Gating

-- 1. Add billing columns to school_settings
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'Free' CHECK (subscription_tier IN ('Free', 'Premium')),
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- 2. Migrate existing Paid/Trial statuses to Premium/Free (Optional, but safe)
UPDATE public.school_settings 
SET subscription_tier = 'Premium' 
WHERE subscription_status = 'Paid';

UPDATE public.school_settings 
SET subscription_tier = 'Free' 
WHERE subscription_status IN ('Trial', 'Expired');
