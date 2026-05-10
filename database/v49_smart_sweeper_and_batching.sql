-- ==============================================================================
-- Phase 1, Step 2: Notification Batching & Smart Sweeper
-- Objective: Eradicate Webhook rate limits and clear stale ephemeral queue rows
-- ==============================================================================

-- 1. Add the classification flag to the queue table
ALTER TABLE public.app_notifications_queue 
ADD COLUMN IF NOT EXISTS is_ephemeral boolean DEFAULT true;

-- Ensure extensions are active
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Setup the Smart Sweeper (Runs daily at 3:00 AM)
-- Only deletes processed notifications that are flagged as ephemeral and older than 7 days
SELECT cron.schedule(
    'notification-smart-sweeper', 
    '0 3 * * *', 
    $$
    DELETE FROM public.app_notifications_queue 
    WHERE status IN ('sent', 'failed') 
      AND is_ephemeral = true 
      AND created_at < NOW() - INTERVAL '7 days';
    $$
);

-- 3. Safely neutralize the dangerous Row-Level Webhook Trigger
-- (This prevents the Edge Function from firing 50 times when you bulk-update 50 students)
DO $$
DECLARE
    tg RECORD;
BEGIN
    FOR tg IN
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'public.app_notifications_queue'::regclass 
          AND tgname LIKE '%webhook%'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.app_notifications_queue', tg.tgname);
        RAISE NOTICE 'Dropped webhook trigger: %', tg.tgname;
    END LOOP;
END $$;

-- 4. Create the Batching Pipeline Trigger (Runs every minute)
-- Note: Replace '<YOUR_SUPABASE_URL>' and '<YOUR_ANON_KEY>' before running this block,
-- or configure it manually via the Supabase Dashboard -> Database -> Cron.
/*
SELECT cron.schedule(
    'notification-batch-processor', 
    '* * * * *', 
    $$
    SELECT net.http_post(
        url := '<YOUR_SUPABASE_URL>/functions/v1/process-notification-queue',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <YOUR_ANON_KEY>'
        )
    );
    $$
);
*/
