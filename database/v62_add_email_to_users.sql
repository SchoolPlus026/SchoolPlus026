-- Add 'email' column to public.users to match the admin_create_user RPC payload
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;

-- Sync existing emails from auth.users to public.users
UPDATE public.users u
SET email = a.email
FROM auth.users a
WHERE u.id = a.id AND u.email IS NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
