-- Migration: Add student privacy toggle and fix RLS policies for self-update

-- 1. Add hide_avatar_from_class column to public.users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS hide_avatar_from_class boolean DEFAULT false;

-- Add comment to explain columns
COMMENT ON COLUMN public.users.hide_avatar_from_class IS 'Flag for students to hide their avatar from other classmates';

-- 2. Add RLS policy to allow users to update their own profile columns (avatar_url, avatar_file_id, hide_avatar_from_class)
-- Supabase automatically merges policies for UPDATE via OR.
CREATE POLICY "users: self update own row"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Add comments for clarity
COMMENT ON POLICY "users: self update own row" ON public.users IS 'Allows any user to update their own avatar or privacy toggles';
