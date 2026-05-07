-- v46: Add admin_password to school_registrations and pa_gdrive_config to platform_settings
-- Run this in Supabase SQL Editor

-- 1. Add admin_password column to school_registrations
ALTER TABLE public.school_registrations
  ADD COLUMN IF NOT EXISTS admin_password text;

-- 2. Add pa_gdrive_config column to platform_settings for Platform Admin GDrive
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS pa_gdrive_config jsonb DEFAULT '[]'::jsonb;
