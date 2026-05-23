-- ═══════════════════════════════════════════════════════════════════════════
-- v76_fix_recovery_schema.sql
-- Critical Fix: Allow NULL user_id in recovery_ephemeral_sessions for QR sessions
-- Background: The qr-generate action creates an anonymous session before any user
--             has scanned. The previous schema had user_id as NOT NULL with a FK
--             constraint to auth.users, causing a FK violation crash.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Drop the NOT NULL constraint on user_id in recovery_ephemeral_sessions
--    so that QR-init sessions can exist without a real user_id yet.
ALTER TABLE public.recovery_ephemeral_sessions
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Drop old FK constraint (we will re-add it as deferrable / nullable-safe)
ALTER TABLE public.recovery_ephemeral_sessions
  DROP CONSTRAINT IF EXISTS recovery_ephemeral_sessions_user_id_fkey;

-- 3. Re-add FK but only for non-null rows (partial FK not supported in PG,
--    so we just allow NULL and keep ON DELETE CASCADE for non-null values)
ALTER TABLE public.recovery_ephemeral_sessions
  ADD CONSTRAINT recovery_ephemeral_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- 4. Ensure the cleanup function also handles NULL user_id rows (no change needed,
--    it deletes by expires_at which is fine)

-- 5. Grant cleanup function execution to service_role (already SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.cleanup_expired_recovery_sessions() TO service_role;

-- 6. Add an index on qr_token for fast lookup (if not already present)
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_qr_token_v2 ON public.recovery_ephemeral_sessions (qr_token) WHERE qr_token IS NOT NULL;
