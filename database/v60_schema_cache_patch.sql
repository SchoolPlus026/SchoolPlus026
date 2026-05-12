-- Patch to add missing columns to emergency_alerts and lost_and_found if v59 was run before the updates
ALTER TABLE public.emergency_alerts 
ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS target_users uuid[];

ALTER TABLE public.lost_and_found
ADD COLUMN IF NOT EXISTS target_class text;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
