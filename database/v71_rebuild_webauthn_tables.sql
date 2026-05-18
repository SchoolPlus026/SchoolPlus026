-- ═══════════════════════════════════════════════════════════════════════════
-- v71_rebuild_webauthn_tables.sql
-- WebAuthn / Passkeys — Biometric Login Support (Rebuilt)
--
-- Creates:
--   1. public.user_passkeys        — Stores public keys per enrolled device
--   2. public.webauthn_challenges  — Short-lived challenge store (ephemeral)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id    text NOT NULL,
  public_key       text NOT NULL,
  sign_count       bigint NOT NULL DEFAULT 0,
  device_type      text NOT NULL DEFAULT 'platform',
  backed_up        boolean NOT NULL DEFAULT false,
  transports       text[] DEFAULT '{}',
  friendly_name    text NOT NULL DEFAULT 'My Device',
  created_at       timestamp with time zone DEFAULT now(),
  last_used_at     timestamp with time zone DEFAULT now(),
  CONSTRAINT uq_user_credential UNIQUE (user_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON public.user_passkeys (credential_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON public.user_passkeys (user_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passkeys: owner select"
  ON public.user_passkeys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "passkeys: owner delete"
  ON public.user_passkeys FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_key  text NOT NULL,
  challenge  text NOT NULL,
  type       text NOT NULL DEFAULT 'authentication',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_owner_key ON public.webauthn_challenges (owner_key);
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON public.webauthn_challenges (expires_at);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

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
