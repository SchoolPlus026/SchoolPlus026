-- Migration: Add avatar_url and avatar_file_id to users table for Google Drive Profile Pictures

-- Add columns to public.users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS avatar_file_id text;

-- Add comment to explain columns
COMMENT ON COLUMN public.users.avatar_url IS 'Google Drive CDN thumbnail URL for the user profile picture';
COMMENT ON COLUMN public.users.avatar_file_id IS 'Google Drive File ID for deletion and cleanup purposes';
