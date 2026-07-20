-- Migration: Add Multi-Role support to Knowledge Base Articles
-- Target: jbjtvosvwufimjcvvwcg (India - Mumbai)

ALTER TABLE public.kb_articles 
ADD COLUMN IF NOT EXISTS target_roles text[] DEFAULT ARRAY['admin', 'teacher', 'student', 'staff', 'driver']::text[];

-- Create an index to optimize array element matches
CREATE INDEX IF NOT EXISTS idx_kb_articles_target_roles ON public.kb_articles USING gin (target_roles);

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
