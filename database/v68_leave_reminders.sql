-- v68_leave_reminders.sql
ALTER TABLE public.leaves 
ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;
