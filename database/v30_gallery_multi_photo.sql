-- ============================================================
-- v30: Add photo_urls column to gallery for multi-photo events
-- ============================================================
-- GalleryManager now uploads multiple photos per event.
-- cover_link = first photo (thumbnail on the card)
-- photo_urls = JSONB array of ALL uploaded photo public URLs

ALTER TABLE public.gallery
  ADD COLUMN IF NOT EXISTS photo_urls jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.gallery.photo_urls IS
  'Array of Supabase Storage public URLs for all photos in this event. First item mirrors cover_link.';
