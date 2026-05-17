-- ═══════════════════════════════════════════════════════════════════════════
-- v70_biometric_passkeys.sql
-- WebAuthn / Passkeys — Biometric Login Support
--
-- Creates:
--   1. public.user_passkeys        — Stores public keys per enrolled device
--   2. public.webauthn_challenges  — Short-lived challenge store (ephemeral)
--
-- Storage impact: ~512 bytes per passkey row.
-- No biometric data is stored. Private keys live in device Secure Enclave.
-- Challenges auto-expire after 5 minutes via a cleanup function + cron.
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE 1: user_passkeys
-- One row per registered device per user.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Credential ID returned by the authenticator (device-unique handle)
  credential_id    text NOT NULL,
  -- ECDSA P-256 public key in COSE format (Base64URL encoded). NOT biometric data.
  public_key       text NOT NULL,
  -- Counter incremented on each assertion — detects cloned authenticators
  sign_count       bigint NOT NULL DEFAULT 0,
  -- 'platform' = device biometric (phone/laptop), 'cross-platform' = hardware key
  device_type      text NOT NULL DEFAULT 'platform',
  -- Whether this credential is synced via iCloud Keychain / Google Password Manager
  backed_up        boolean NOT NULL DEFAULT false,
  -- JSON array of transport hints e.g. ["internal","hybrid"]
  transports       text[] DEFAULT '{}',
  -- User-friendly label shown in the manage devices UI
  friendly_name    text NOT NULL DEFAULT 'My Device',
  created_at       timestamp with time zone DEFAULT now(),
  last_used_at     timestamp with time zone DEFAULT now(),

  -- Enforce uniqueness: same device cannot be registered twice for the same user
  CONSTRAINT uq_user_credential UNIQUE (user_id, credential_id)
);

-- Index for fast credential lookup by credential_id (used on every login)
CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON public.user_passkeys (credential_id);
-- Index for listing a user's enrolled devices
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON public.user_passkeys (user_id);

-- ── RLS: user_passkeys ───────────────────────────────────────────────────────
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

-- Users can read their own passkeys (for Manage Devices UI)
CREATE POLICY "passkeys: owner select"
  ON public.user_passkeys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete their own passkeys (remove a device)
CREATE POLICY "passkeys: owner delete"
  ON public.user_passkeys FOR DELETE
  USING (auth.uid() = user_id);

-- Only the Edge Function (service role) can INSERT / UPDATE passkeys
-- The frontend never directly writes credential data — all inserts go through
-- the webauthn-verify Edge Function which runs as service_role.
-- No INSERT or UPDATE policy is created for authenticated users intentionally.

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE 2: webauthn_challenges
-- Ephemeral challenge store. Rows are deleted after 5 minutes.
-- This table will typically hold < 20 rows at any given moment.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Can be a user_id (for authentication) or a temp session ID (for registration)
  -- Using TEXT to support both UUID user IDs and temporary anonymous identifiers
  owner_key  text NOT NULL,
  challenge  text NOT NULL,
  -- 'registration' or 'authentication'
  type       text NOT NULL DEFAULT 'authentication',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamp with time zone DEFAULT now()
);

-- Index for fast challenge lookup
CREATE INDEX IF NOT EXISTS idx_challenges_owner_key ON public.webauthn_challenges (owner_key);
-- Index for cleanup function
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON public.webauthn_challenges (expires_at);

-- ── RLS: webauthn_challenges ─────────────────────────────────────────────────
-- The challenges table is ONLY accessed by Edge Functions (service_role).
-- No authenticated user should ever directly read or write challenges.
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated users — all access is via service_role in Edge Functions.

-- ────────────────────────────────────────────────────────────────────────────
-- CLEANUP FUNCTION: Purge expired challenges
-- Called by pg_cron every 5 minutes to keep the challenges table near-empty.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_webauthn_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE expires_at < now();
END;
$$;

-- ── Schedule cleanup via pg_cron (if extension is enabled) ──────────────────
-- Supabase Pro has pg_cron. On Free tier, the Edge Function cleanup is the
-- fallback (the webauthn-start function also deletes expired challenges inline).
-- Uncomment the block below if pg_cron is available on your plan:
--
-- SELECT cron.schedule(
--   'cleanup-webauthn-challenges',
--   '*/5 * * * *',   -- every 5 minutes
--   $$ SELECT public.cleanup_expired_webauthn_challenges(); $$
-- );
