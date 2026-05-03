-- ==============================================================================
-- v35: Rebuild Google Drive Schema
-- ==============================================================================

-- 1. Ensure gdrive_config is a JSONB array, fallback to empty array if null
ALTER TABLE public.school_settings
ALTER COLUMN gdrive_config TYPE JSONB USING COALESCE(gdrive_config, '[]'::jsonb);

-- 2. Set default to empty array to prevent null issues in Edge Functions
ALTER TABLE public.school_settings
ALTER COLUMN gdrive_config SET DEFAULT '[]'::jsonb;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
