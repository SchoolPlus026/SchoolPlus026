-- ═══════════════════════════════════════════════════════════════════════════
-- v74_hybrid_recovery_system.sql
-- Hybrid Recovery System — Schema & Policies
--
-- Creates:
--   1. public.recovery_profiles            — User PIN, biometrics status & preset questions
--   2. public.recovery_ephemeral_sessions  — Dynamic recovery state tracker
--   3. public.login_brute_force_logs       — Traditional brute force login tracking
--   4. public.cleanup_expired_recovery_sessions() — Ephemeral cleaner
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. RECOVERY PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.recovery_profiles (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  school_id               uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
  pin_hash                text,
  security_question_1     text,
  security_answer_1_hash  text,
  security_question_2     text,
  security_answer_2_hash  text,
  setup_completed         boolean DEFAULT false NOT NULL,
  recovery_locked_until   timestamp with time zone, -- 24hr recovery lockout
  created_at              timestamp with time zone DEFAULT now(),
  updated_at              timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_profiles_user_id ON public.recovery_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_profiles_school_id ON public.recovery_profiles (school_id);
CREATE INDEX IF NOT EXISTS idx_recovery_profiles_locked ON public.recovery_profiles (recovery_locked_until);

ALTER TABLE public.recovery_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: owner select" ON public.recovery_profiles;
CREATE POLICY "profiles: owner select"
  ON public.recovery_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles: owner insert" ON public.recovery_profiles;
CREATE POLICY "profiles: owner insert"
  ON public.recovery_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles: owner update" ON public.recovery_profiles;
CREATE POLICY "profiles: owner update"
  ON public.recovery_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. EPHEMERAL RECOVERY SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.recovery_ephemeral_sessions (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id           uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
  current_step        integer DEFAULT 1 NOT NULL,
  saved_answers       jsonb DEFAULT '{}'::jsonb,
  attempt_count       integer DEFAULT 0 NOT NULL,
  locked_until        timestamp with time zone,
  qr_token            text UNIQUE,
  qr_verified         boolean DEFAULT false NOT NULL,
  created_at          timestamp with time zone DEFAULT now(),
  expires_at          timestamp with time zone NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_recovery_sessions_user_id ON public.recovery_ephemeral_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_qr_token ON public.recovery_ephemeral_sessions (qr_token);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_expires_at ON public.recovery_ephemeral_sessions (expires_at);

ALTER TABLE public.recovery_ephemeral_sessions ENABLE ROW LEVEL SECURITY;

-- Note: No standard RLS policies for anonymous recovery sessions.
-- Operations on this table are carried out securely via Edge Functions (Service Role Client).

-- 3. BRUTE FORCE LOGS TABLE
CREATE TABLE IF NOT EXISTS public.login_brute_force_logs (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username            text NOT NULL UNIQUE,
  failed_attempts     integer DEFAULT 0 NOT NULL,
  locked_until        timestamp with time zone,
  last_attempt_at     timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brute_force_username ON public.login_brute_force_logs (username);
CREATE INDEX IF NOT EXISTS idx_brute_force_locked_until ON public.login_brute_force_logs (locked_until);

ALTER TABLE public.login_brute_force_logs ENABLE ROW LEVEL SECURITY;

-- Note: Same as above. No client direct writes. Handled by brute-force hook / login function.

-- 4. CLEANUP HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.recovery_ephemeral_sessions
  WHERE expires_at < now();
END;
$$;
