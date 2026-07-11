-- v94: Notification System Repairs & Subscription Sync
-- 1. Fix the RPC type mismatch in claim_pending_notifications (uuid vs bigint)
-- 2. Maintain plan_type <-> subscription_tier synchronization automatically on school_settings
-- 3. Run a one-time synchronization on all existing schools
-- 4. Reschedule pg_cron to trigger 24/7 every 15 minutes to prevent UTC timezone mismatches

-- ── 1. FIX TYPE MISMATCH IN CLAIM_PENDING_NOTIFICATIONS ──────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_pending_notifications(p_limit int)
RETURNS SETOF public.app_notifications_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids uuid[]; -- FIX: Changed from bigint[] to uuid[] to match the primary key type of public.app_notifications_queue
BEGIN
  -- Select and lock the rows
  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id
    FROM public.app_notifications_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) t;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    -- Update and return the rows
    RETURN QUERY
    UPDATE public.app_notifications_queue
    SET status = 'processing'
    WHERE id = any(v_ids)
    RETURNING *;
  END IF;
END;
$$;


-- ── 2. AUTO-SYNC TRIGGER FOR SCHOOL SUBSCRIPTION TIERS ──────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sync_school_subscription_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If subscription_tier was changed but plan_type was not:
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier AND (NEW.plan_type IS NOT DISTINCT FROM OLD.plan_type OR NEW.plan_type IS NULL) THEN
    NEW.plan_type := CASE NEW.subscription_tier
      WHEN 'Premium' THEN 'premium'
      WHEN 'Trial'   THEN 'trial'
      ELSE 'free'
    END;
  -- If plan_type was changed but subscription_tier was not:
  ELSIF NEW.plan_type IS DISTINCT FROM OLD.plan_type AND (NEW.subscription_tier IS NOT DISTINCT FROM OLD.subscription_tier OR NEW.subscription_tier IS NULL) THEN
    NEW.subscription_tier := CASE NEW.plan_type
      WHEN 'premium' THEN 'Premium'
      WHEN 'trial'   THEN 'Trial'
      ELSE 'Free'
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_school_subscription_columns ON public.school_settings;
CREATE TRIGGER trg_sync_school_subscription_columns
  BEFORE INSERT OR UPDATE ON public.school_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_school_subscription_columns();


-- ── 3. ONE-TIME SYNCHRONIZATION FOR EXISTING DATA ────────────────────────────────────
UPDATE public.school_settings
SET plan_type = CASE
  WHEN subscription_tier = 'Premium' THEN 'premium'
  WHEN subscription_tier = 'Trial'   THEN 'trial'
  ELSE 'free'
END;


-- ── 4. RESCHEDULE CRON TO RUN 24/7 EVERY 15 MINUTES ─────────────────────────────────
-- Avoids UTC vs IST daylight timezone mismatches.
-- If no notifications are pending, it exits in <5ms with zero limit impact.
SELECT cron.unschedule('notification-batch-processor-free-tier')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'notification-batch-processor-free-tier'
);

SELECT cron.schedule(
  'notification-batch-processor-free-tier',
  '*/10 * * * *', -- 24/7, every 10 minutes
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
