-- ==============================================================================
-- V92: NOTIFICATION SWEOPER TUNING FOR FREE TIER DATABASE STORAGE
-- ==============================================================================
-- Reduces the retention period of notifications in the DB to control DB size.
-- Read notifications: reduced from 14 days -> 3 days.
-- All notifications: reduced from 30 days -> 7 days.

-- 1. Unschedule the old sweeper job if it exists
SELECT cron.unschedule('notification-smart-sweeper')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'notification-smart-sweeper'
);

-- 2. Reschedule with the optimized retention periods
SELECT cron.schedule(
  'notification-smart-sweeper',
  '30 2 * * *',  -- Daily at 02:30 AM UTC
  $$
  -- 2a. Clear processed push queue rows (sent or failed) older than 3 days
  DELETE FROM public.app_notifications_queue
  WHERE status IN ('sent', 'failed')
    AND created_at < NOW() - INTERVAL '3 days';

  -- 2b. Clear STUCK pending rows older than 1 day
  DELETE FROM public.app_notifications_queue
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '1 day';

  -- 2c. Clear read in-app notifications older than 3 days (reduced from 14 days)
  DELETE FROM public.notifications
  WHERE is_read = true
    AND created_at < NOW() - INTERVAL '3 days';

  -- 2d. Clear ALL in-app notifications (safety net) older than 7 days (reduced from 30 days)
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);
