-- Phase 41: Platform Policies and Support Email

ALTER TABLE platform_settings 
ADD COLUMN IF NOT EXISTS refund_policy TEXT,
ADD COLUMN IF NOT EXISTS privacy_policy TEXT,
ADD COLUMN IF NOT EXISTS support_email TEXT;

UPDATE platform_settings 
SET 
  refund_policy = 'Default Refund Policy for SchoolOS+.',
  privacy_policy = 'Default Privacy Policy for SchoolOS+.',
  support_email = 'schoolpro026@gmail.com'
WHERE id IS NOT NULL;
