-- ─────────────────────────────────────────────────────────────────────────────
-- v36: Create public Supabase Storage bucket for APK hosting
-- This replaces the GitHub Releases approach which fails on private repos.
-- The native Android Filesystem downloader needs a public, unauthenticated URL.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the public bucket (safe to re-run)
insert into storage.buckets (id, name, public)
values ('app-updates', 'app-updates', true)
on conflict (id) do update set public = true;

-- 2. Public READ: anyone (anon or authenticated) can download the APK
drop policy if exists "Public Access to App Updates" on storage.objects;
create policy "Public Access to App Updates"
on storage.objects for select
to anon, authenticated
using ( bucket_id = 'app-updates' );

-- 3. Service role WRITE: only the CI/CD pipeline (service_role key) can upload
-- The service_role bypasses RLS entirely so no insert policy is required,
-- but we add it explicitly for clarity and auditability.
drop policy if exists "Service Role Upload Access" on storage.objects;
create policy "Service Role Upload Access"
on storage.objects for insert
to service_role
with check ( bucket_id = 'app-updates' );

-- 4. Service role UPDATE (for x-upsert re-uploads of the same tag)
drop policy if exists "Service Role Update Access" on storage.objects;
create policy "Service Role Update Access"
on storage.objects for update
to service_role
using ( bucket_id = 'app-updates' );
