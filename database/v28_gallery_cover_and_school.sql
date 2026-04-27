-- Phase 28: Gallery Cover Photo and Platform Add School

-- 1. Add cover_link to gallery
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS cover_link text;

-- 2. Create gallery bucket for cover photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Storage Policies
DROP POLICY IF EXISTS "Allow authenticated uploads to gallery" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to gallery"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Allow public read of gallery" ON storage.objects;
CREATE POLICY "Allow public read of gallery"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'gallery');
