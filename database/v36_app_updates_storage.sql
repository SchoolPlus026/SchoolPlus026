-- Create a public bucket for app updates
insert into storage.buckets (id, name, public)
values ('app-updates', 'app-updates', true)
on conflict (id) do nothing;

-- Allow public access to read the updates
create policy "Public Access to App Updates"
on storage.objects for select
using ( bucket_id = 'app-updates' );

-- Allow service role to upload (CI/CD)
create policy "Service Role Upload Access"
on storage.objects for insert
with check ( bucket_id = 'app-updates' );
