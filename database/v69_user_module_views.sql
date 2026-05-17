-- Create user_module_views table
CREATE TABLE IF NOT EXISTS public.user_module_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  last_viewed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Index for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_module_views_unique ON public.user_module_views (user_id, module_name);

-- RLS policies
ALTER TABLE public.user_module_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own module views"
  ON public.user_module_views FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own module views"
  ON public.user_module_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own module views"
  ON public.user_module_views FOR UPDATE
  USING (auth.uid() = user_id);

-- Add to publications if necessary
-- ALTER PUBLICATION supabase_realtime ADD TABLE user_module_views;
