-- Drop WebAuthn / Biometric tables
DROP TABLE IF EXISTS public.user_passkeys CASCADE;
DROP TABLE IF EXISTS public.webauthn_challenges CASCADE;

-- Drop the unused cleanup function
DROP FUNCTION IF EXISTS public.cleanup_expired_webauthn_challenges();