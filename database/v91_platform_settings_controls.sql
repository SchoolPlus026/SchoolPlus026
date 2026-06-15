-- ==============================================================================
-- V91: PLATFORM OPTIMIZATION AND NIGHT-MODE CONTROLS
-- ==============================================================================
-- Adds dynamic configuration parameters to platform_settings for client-side caching,
-- refresh button throttling, and night-time shutdown hour customization.

-- 1. Add columns to public.platform_settings if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='night_mode_enabled') THEN
        ALTER TABLE public.platform_settings ADD COLUMN night_mode_enabled BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='night_start_time') THEN
        ALTER TABLE public.platform_settings ADD COLUMN night_start_time TEXT DEFAULT '23:00';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='night_end_time') THEN
        ALTER TABLE public.platform_settings ADD COLUMN night_end_time TEXT DEFAULT '05:30';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='free_tier_refresh_cooldown') THEN
        ALTER TABLE public.platform_settings ADD COLUMN free_tier_refresh_cooldown INT DEFAULT 30;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='premium_tier_refresh_cooldown') THEN
        ALTER TABLE public.platform_settings ADD COLUMN premium_tier_refresh_cooldown INT DEFAULT 10;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='free_tier_cache_hours') THEN
        ALTER TABLE public.platform_settings ADD COLUMN free_tier_cache_hours INT DEFAULT 6;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='platform_settings' AND column_name='premium_tier_cache_hours') THEN
        ALTER TABLE public.platform_settings ADD COLUMN premium_tier_cache_hours INT DEFAULT 1;
    END IF;
END $$;

-- 2. Populate default values for existing rows
UPDATE public.platform_settings
SET night_mode_enabled = COALESCE(night_mode_enabled, TRUE),
    night_start_time = COALESCE(night_start_time, '23:00'),
    night_end_time = COALESCE(night_end_time, '05:30'),
    free_tier_refresh_cooldown = COALESCE(free_tier_refresh_cooldown, 30),
    premium_tier_refresh_cooldown = COALESCE(premium_tier_refresh_cooldown, 10),
    free_tier_cache_hours = COALESCE(free_tier_cache_hours, 6),
    premium_tier_cache_hours = COALESCE(premium_tier_cache_hours, 1)
WHERE id IS NOT NULL OR id = '00000000-0000-0000-0000-000000000000';

-- 3. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
