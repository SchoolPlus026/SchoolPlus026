-- Migration: Gallery Module Expansion
-- Adds granular scope visibility to the gallery module for Teachers

ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS visibility_scope text DEFAULT 'Entire School';
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS target_class text;

-- (Optional) Make sure the existing rows default to 'Entire School'
UPDATE public.gallery SET visibility_scope = 'Entire School' WHERE visibility_scope IS NULL;
