-- Phase 28.3: Platform Legal & About Content

-- Alter platform_settings to include legal and about content
ALTER TABLE platform_settings 
ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
ADD COLUMN IF NOT EXISTS about_app TEXT;

-- Update the default row if it exists with some placeholder text
UPDATE platform_settings 
SET 
  terms_conditions = 'Default Terms and Conditions for SchoolOS+.',
  about_app = 'SchoolOS+ is a comprehensive multi-tenant school management SaaS platform.'
WHERE id IS NOT NULL;
