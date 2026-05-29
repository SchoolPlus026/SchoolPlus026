-- v78: Add platform contact columns to platform_settings
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS developer_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_address TEXT DEFAULT 'Parli Vaijnath, Maharashtra';
