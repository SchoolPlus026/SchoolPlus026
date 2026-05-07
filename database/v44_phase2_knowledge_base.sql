-- ============================================================
-- MIGRATION: v44_phase2_knowledge_base.sql
-- Description:
--   1. Create kb_categories table (P.A. managed)
--   2. Create kb_articles table (P.A. managed, per-category)
--   3. RLS: all authenticated users can read; only platform_admin can write
-- ============================================================

-- 1. Knowledge Base Categories
CREATE TABLE IF NOT EXISTS public.kb_categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text,
  icon        text DEFAULT 'BookOpen',
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 2. Knowledge Base Articles
CREATE TABLE IF NOT EXISTS public.kb_articles (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id   uuid REFERENCES public.kb_categories(id) ON DELETE CASCADE NOT NULL,
  title         text NOT NULL,
  description   text,
  video_type    text CHECK (video_type IN ('youtube', 'gdrive')) NOT NULL,
  video_url     text NOT NULL,
  thumbnail_url text,
  sort_order    integer DEFAULT 0,
  is_published  boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles   ENABLE ROW LEVEL SECURITY;

-- 4. Read policies — all authenticated users can browse the Knowledge Base
CREATE POLICY "Authenticated users can read kb_categories"
  ON public.kb_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read published kb_articles"
  ON public.kb_articles FOR SELECT TO authenticated USING (is_published = true);

-- 5. Write policies — only platform_admin can manage KB content
CREATE POLICY "Platform admin manages kb_categories"
  ON public.kb_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'platform_admin'));

CREATE POLICY "Platform admin manages kb_articles"
  ON public.kb_articles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'platform_admin'));

-- 6. Performance indexes
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON public.kb_articles (category_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON public.kb_articles (is_published);

-- 7. Seed a default category to get started
INSERT INTO public.kb_categories (name, description, icon, sort_order)
VALUES
  ('Getting Started',  'Basic setup and first steps',        'Rocket',    1),
  ('For School Admin', 'Admin dashboard tutorials',          'Shield',    2),
  ('For Teachers',     'Attendance, notices, and reports',   'BookOpen',  3),
  ('For Students',     'How to use the student app',         'GraduationCap', 4)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE public.kb_categories IS 'Platform-managed tutorial categories for the Knowledge Base.';
COMMENT ON TABLE public.kb_articles   IS 'Video tutorials linked to categories. Supports YouTube and Google Drive.';
