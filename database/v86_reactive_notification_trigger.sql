-- v86: Reactive Trigger-Based Notification Scheduler
-- Replaces the blind 5-minute cron with a reactive statement-level database trigger for Paid/Premium schools,
-- and schedules a throttled 15-minute cron during school hours (8 AM - 6 PM) for Free tier schools.

-- 1. Unschedule the old blind 5-minute cron job
SELECT cron.unschedule('notification-batch-processor');

-- 2. Create the reactive statement-level trigger function
CREATE OR REPLACE FUNCTION public.trg_reactive_notification_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_premium_pending boolean;
BEGIN
  -- Check if there are any pending notifications in the queue belonging to a Paid (premium/trial) school.
  -- This prevents duplicate triggers if multiple rows are inserted in a single transaction.
  SELECT EXISTS (
    SELECT 1 
    FROM public.app_notifications_queue q
    JOIN public.school_settings s ON q.school_id = s.school_id
    WHERE q.status = 'pending' AND (s.plan_type = 'premium' OR s.plan_type = 'trial')
  ) INTO v_has_premium_pending;

  IF v_has_premium_pending THEN
    PERFORM net.http_post(
      url     := 'https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8'
      ),
      body    := '{}'::jsonb
    );
  END IF;

  RETURN NULL; -- For AFTER statement-level triggers, return value is ignored
END;
$$;

-- 3. Create the AFTER statement trigger on app_notifications_queue
DROP TRIGGER IF EXISTS trg_reactive_notification_delivery ON public.app_notifications_queue;
CREATE TRIGGER trg_reactive_notification_delivery
  AFTER INSERT ON public.app_notifications_queue
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_reactive_notification_delivery();

-- 4. Schedule the throttled 15-minute cron job for Free tier notifications (School Hours only: 8 AM to 6 PM)
-- Cron expression '*/15 8-18 * * *' triggers every 15 minutes between 8:00 AM and 6:45 PM.
SELECT cron.schedule(
  'notification-batch-processor-free-tier',
  '*/15 8-18 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8'
    ),
    body    := '{}'::jsonb
  );
  $$
);
