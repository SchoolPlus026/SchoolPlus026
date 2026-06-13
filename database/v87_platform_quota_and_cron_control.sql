-- v87: Platform Quota and Cron Control Panel Migrations
-- Implements live quota self-tracking, dynamic cron rescheduling, and database-level push toggles.

-- 1. Create edge_function_usage log table
CREATE TABLE IF NOT EXISTS public.edge_function_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL,
    called_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INT
);

-- Enable RLS and setup permissive policies for logging
ALTER TABLE public.edge_function_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert on edge_function_usage" ON public.edge_function_usage;
CREATE POLICY "Allow public insert on edge_function_usage" 
    ON public.edge_function_usage FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated select on edge_function_usage" ON public.edge_function_usage;
CREATE POLICY "Allow authenticated select on edge_function_usage" 
    ON public.edge_function_usage FOR SELECT 
    USING (true);

-- 2. Add control settings to platform_settings
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS free_tier_cron_minutes INT DEFAULT 15;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS disabled_notification_modules TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Ensure default values are populated in the platform settings row
UPDATE public.platform_settings 
SET free_tier_cron_minutes = COALESCE(free_tier_cron_minutes, 15),
    disabled_notification_modules = COALESCE(disabled_notification_modules, ARRAY[]::TEXT[])
WHERE id IS NOT NULL;

-- 3. Create module delivery toggle database trigger
CREATE OR REPLACE FUNCTION public.trg_check_notification_delivery_toggles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_disabled_modules TEXT[];
BEGIN
  -- Get disabled modules from platform_settings
  SELECT disabled_notification_modules INTO v_disabled_modules
  FROM public.platform_settings
  LIMIT 1;

  IF v_disabled_modules IS NOT NULL THEN
    -- Attendance
    IF NEW.route LIKE '%attendance%' AND 'attendance' = ANY(v_disabled_modules) THEN
      RETURN NULL; -- Block insert silently
    END IF;
    
    -- Leaves
    IF (NEW.route LIKE '%leave%' OR NEW.route LIKE '%leaves%') AND 'leaves' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;

    -- Complaints / Principal's Desk
    IF (NEW.route LIKE '%complaint%' OR NEW.route LIKE '%principals_desk%') AND 'complaints' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;

    -- Achievers
    IF (NEW.route LIKE '%achiever%' OR NEW.route LIKE '%achievement%') AND 'achievers' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;

    -- Lost & Found
    IF NEW.route LIKE '%lost_found%' AND 'lost_found' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_notification_delivery_toggles ON public.app_notifications_queue;
CREATE TRIGGER trg_check_notification_delivery_toggles
  BEFORE INSERT ON public.app_notifications_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_notification_delivery_toggles();

-- 4. Create dynamic cron rescheduled RPC
CREATE OR REPLACE FUNCTION public.update_cron_schedule(p_minutes INT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cron_expr TEXT;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid interval. Must be between 1 and 60 minutes.');
  END IF;

  -- Update settings row
  UPDATE public.platform_settings 
  SET free_tier_cron_minutes = p_minutes;

  -- Construct standard cron schedule (run every X minutes during school hours 8 AM - 6 PM)
  v_cron_expr := '*/' || p_minutes || ' 8-18 * * *';

  -- Re-register pg_cron schedule
  PERFORM cron.unschedule('notification-batch-processor-free-tier');
  PERFORM cron.schedule(
    'notification-batch-processor-free-tier',
    v_cron_expr,
    $$
    SELECT net.http_post(
      url     := 'https://nnaqayemfogpfehiaifw.supabase.co/functions/v1/process-notification-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8'
      ),
      body    := '{}'::jsonb
    );
    $$
  );

  RETURN jsonb_build_object('success', true, 'minutes', p_minutes, 'schedule', v_cron_expr);
END;
$$;

-- 5. Create dynamic auto-throttle utility RPC
CREATE OR REPLACE FUNCTION public.get_auto_throttle_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_mode text;
  v_limit integer := 500000;
  v_disabled_modules TEXT[];
  v_cron_minutes INT;
BEGIN
  -- Count total edge function usage executions in current calendar month
  SELECT COUNT(*) INTO v_count 
  FROM public.edge_function_usage 
  WHERE called_at > DATE_TRUNC('month', NOW());

  -- Determine throttling threshold mode
  IF v_count < 350000 THEN
    v_mode := 'Normal';
  ELSIF v_count < 450000 THEN
    v_mode := 'Economy';
  ELSE
    v_mode := 'Critical';
  END IF;

  -- Load toggles and current cron configurations
  SELECT disabled_notification_modules, free_tier_cron_minutes 
  INTO v_disabled_modules, v_cron_minutes
  FROM public.platform_settings
  LIMIT 1;

  RETURN jsonb_build_object(
    'call_count', v_count,
    'limit', v_limit,
    'mode', v_mode,
    'cron_minutes', COALESCE(v_cron_minutes, 15),
    'disabled_modules', COALESCE(v_disabled_modules, ARRAY[]::TEXT[])
  );
END;
$$;
