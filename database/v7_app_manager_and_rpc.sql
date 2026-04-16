-- ==========================================
-- V7: SUPER ADMIN (APP MANAGER), TICKETING & RPC
-- ==========================================

-- 0. Update User Role Constraint to allow 'app_manager'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'student', 'app_manager'));

-- 1. App Configuration Table (Global Platform Level)
CREATE TABLE IF NOT EXISTS public.app_config (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    key_name text UNIQUE NOT NULL,
    value_content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

-- Seed Initial "About This Application" text
INSERT INTO public.app_config (key_name, value_content)
VALUES (
  'about_text', 
  'The Little Flower School Web Application has been designed to modernize and simplify school management through a fully digital platform. This system ensures that the administration, teachers, students, and parents can collaborate effectively and stay informed at all times.'
) ON CONFLICT (key_name) DO NOTHING;

-- 2. Upgrading School Settings
-- Add modules tracking for App Manager toggling features
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS modules_active jsonb DEFAULT '["timetable", "attendance", "fees", "leaves", "notices", "gallery", "calendar", "reports", "contact", "settings"]'::jsonb;

-- 3. Support Tickets System
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    admin_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    manager_reply text,
    created_at timestamp with time zone DEFAULT now()
);

-- RLS for Support Tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- App Manager can read/write everything. Admins see their own tickets.
DO $$ 
BEGIN
    CREATE POLICY "Ticket Isolation" ON public.support_tickets FOR ALL 
    USING (
       (auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager' OR 
       school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Everyone can read config, only app_manager can write config
DO $$ 
BEGIN
    CREATE POLICY "Global Read Config" ON public.app_config FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ 
BEGIN
    CREATE POLICY "Manager Write Config" ON public.app_config FOR ALL 
    USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'app_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. SECURE USER CREATION RPC (Solves the Admin Logout Limitation)
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email text,
  p_password text,
  p_role text,
  p_name text,
  p_username text,
  p_school_id uuid,
  p_class text DEFAULT NULL,
  p_contact text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  new_uid uuid;
  caller_role text;
  caller_school uuid;
BEGIN
  -- Verify caller is an admin OR an app_manager
  caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
  caller_school := (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid;

  IF caller_role NOT IN ('admin', 'app_manager') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins or managers can create authentic accounts.';
  END IF;

  -- Ensure admins can only create accounts for their own school
  IF caller_role = 'admin' AND caller_school != p_school_id THEN
    RAISE EXCEPTION 'Unauthorized: Admins can only create users for their own organization.';
  END IF;

  -- Avoid duplicate usernames
  IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username) THEN
    RAISE EXCEPTION 'Username "%" is already taken.', p_username;
  END IF;
  
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Email "%" is already registered.', p_email;
  END IF;

  -- Validate Role
  IF p_role NOT IN ('admin', 'teacher', 'student') THEN
    RAISE EXCEPTION 'Invalid role selection.';
  END IF;

  -- Generate new user UUID
  new_uid := gen_random_uuid();

  -- Insert into Supabase auth.users explicitly securely via Database trigger
  INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
      '00000000-0000-0000-0000-000000000000', new_uid, 'authenticated', 'authenticated', 
      p_email, crypt(p_password, gen_salt('bf')), timezone('utc'::text, now()), 
      '{"provider": "email", "providers": ["email"]}', 
      jsonb_build_object('school_id', p_school_id, 'role', p_role),
      timezone('utc'::text, now()), timezone('utc'::text, now()), '', '', '', ''
  );

  -- Log profile in public schema safely bypassing client restrictions
  INSERT INTO public.users (id, school_id, role, username, name, class, contact)
  VALUES (new_uid, p_school_id, p_role, p_username, p_name, p_class, p_contact);

  RETURN new_uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Seed App Manager Demo Account
DO $$
DECLARE
    manager_uuid uuid;
BEGIN
    SELECT id INTO manager_uuid FROM auth.users WHERE email = 'manager@demo.com';
    IF manager_uuid IS NULL THEN
        manager_uuid := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', manager_uuid, 'authenticated', 'authenticated', 
            'manager@demo.com', crypt('123456', gen_salt('bf')), timezone('utc'::text, now()), 
            '{"provider": "email", "providers": ["email"]}', 
            '{"role": "app_manager"}',
            timezone('utc'::text, now()), timezone('utc'::text, now()), '', '', '', ''
        );

        INSERT INTO public.users (id, role, username, name)
        VALUES (manager_uuid, 'app_manager', 'manager', 'Platform Manager');
    END IF;
END $$;
