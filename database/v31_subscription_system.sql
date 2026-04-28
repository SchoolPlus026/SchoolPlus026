-- ============================================================
-- v31: SaaS Subscription System
-- 1. Extend school_settings with full billing fields
-- 2. Add get_effective_plan() auto-downgrade function
-- 3. Add platform_delete_school() secure cascade function
-- ============================================================

-- ── 1. Drop old constraint and add new plan values ─────────────────────────────
ALTER TABLE public.school_settings
  DROP CONSTRAINT IF EXISTS school_settings_subscription_tier_check;

ALTER TABLE public.school_settings
  ADD CONSTRAINT school_settings_subscription_tier_check
  CHECK (subscription_tier IN ('Free', 'Trial', 'Premium'));

-- ── 2. Add new subscription columns ───────────────────────────────────────────
--   plan_type        : canonical plan key used in React feature gating
--   billing_cycle    : monthly (28 days) or yearly (365 days)
--   trial_start_date : set when plan = 'trial' is assigned
--   subscription_end_date : set for Premium plans; used for expiry display

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free'
    CHECK (plan_type IN ('free', 'trial', 'premium')),
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT NULL
    CHECK (billing_cycle IN ('monthly', 'yearly', NULL)),
  ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ DEFAULT NULL;

-- Backfill existing rows: map subscription_tier → plan_type
UPDATE public.school_settings
  SET plan_type = CASE
    WHEN subscription_tier = 'Premium'    THEN 'premium'
    WHEN subscription_tier = 'Trial'      THEN 'trial'
    ELSE 'free'
  END
WHERE plan_type IS NULL OR plan_type = 'free';

-- ── 3. get_effective_plan() — auto-downgrade trials on first read ──────────────
-- Called on login to ensure expired trials become 'free' automatically.
-- No cron needed — the downgrade fires the first time the school logs in after expiry.

CREATE OR REPLACE FUNCTION public.get_effective_plan(p_school_id uuid)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan_type      TEXT;
  v_trial_start    TIMESTAMPTZ;
  v_trial_end      TIMESTAMPTZ;
  v_sub_end        TIMESTAMPTZ;
BEGIN
  SELECT plan_type, trial_start_date, subscription_end_date
  INTO   v_plan_type, v_trial_start, v_sub_end
  FROM   public.school_settings
  WHERE  school_id = p_school_id;

  -- Trial auto-downgrade: 28-day window expired → revert to free
  IF v_plan_type = 'trial' THEN
    v_trial_end := v_trial_start + INTERVAL '28 days';
    IF v_trial_end < now() THEN
      UPDATE public.school_settings
        SET plan_type        = 'free',
            subscription_tier = 'Free',
            billing_cycle    = NULL,
            trial_start_date = NULL
        WHERE school_id = p_school_id;
      RETURN 'free';
    END IF;
  END IF;

  -- Premium expiry check (if subscription_end_date is set and passed)
  IF v_plan_type = 'premium' AND v_sub_end IS NOT NULL AND v_sub_end < now() THEN
    UPDATE public.school_settings
      SET plan_type        = 'free',
          subscription_tier = 'Free',
          billing_cycle    = NULL,
          subscription_end_date = NULL
      WHERE school_id = p_school_id;
    RETURN 'free';
  END IF;

  RETURN COALESCE(v_plan_type, 'free');
END;
$$;

-- ── 4. platform_delete_school() — secure cascade delete (SECURITY DEFINER) ─────
-- Called only by the platform-delete-school Edge Function (service role).
-- Deletes all school data in safe dependency order.
-- Auth users are deleted separately by the Edge Function via Admin API.

CREATE OR REPLACE FUNCTION public.platform_delete_school(p_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Leaf tables first (those with FKs pointing up)
  DELETE FROM public.fees_payments
    WHERE fees_id IN (SELECT id FROM public.fees WHERE school_id = p_school_id);
  DELETE FROM public.fees                    WHERE school_id = p_school_id;
  DELETE FROM public.attendance              WHERE school_id = p_school_id;
  DELETE FROM public.gallery                 WHERE school_id = p_school_id;
  DELETE FROM public.notices                 WHERE school_id = p_school_id;
  DELETE FROM public.calendar_events         WHERE school_id = p_school_id;
  DELETE FROM public.timetable               WHERE school_id = p_school_id;
  DELETE FROM public.leaves                  WHERE school_id = p_school_id;
  DELETE FROM public.app_notifications_queue WHERE school_id = p_school_id;
  DELETE FROM public.user_device_tokens      WHERE user_id IN (SELECT id FROM public.users WHERE school_id = p_school_id);
  DELETE FROM public.payment_requests        WHERE school_id = p_school_id;
  DELETE FROM public.support_tickets         WHERE school_id = p_school_id;
  -- Users profile row must be deleted before school_settings (FK)
  DELETE FROM public.users                   WHERE school_id = p_school_id;
  DELETE FROM public.school_settings         WHERE school_id = p_school_id;
END;
$$;

-- Grant execute only to service_role (Edge Functions use service_role key)
REVOKE ALL ON FUNCTION public.platform_delete_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_delete_school(uuid) TO service_role;
