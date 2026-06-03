-- ═══════════════════════════════════════════════════════════════
-- ONE-TIME SETUP: App Database Settings
-- Run this ONCE. It sets the secrets the batch processor cron
-- needs to call the Edge Function for push notifications.
--
-- HOW TO FIND YOUR VALUES:
--   supabase_url  → Supabase Dashboard → Project Settings → API
--                   → "Project URL" (e.g. https://abcxyz.supabase.co)
--
--   service_role_key → Same page → "service_role" key (secret key)
-- ═══════════════════════════════════════════════════════════════

ALTER DATABASE postgres
    SET app.supabase_url = 'https://nnaqayemfogpfehiaifw.supabase.co';

ALTER DATABASE postgres
    SET app.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';
