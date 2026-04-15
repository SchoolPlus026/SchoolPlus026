DO $$ 
DECLARE
  v_user_id uuid;
  v_school_id uuid;
BEGIN
  -- 1. Grab the generated UUID of the newly created admin user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'admin@school.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Error: User "admin@school.com" not found. Please create them first in the Supabase Auth Dashboard.';
  END IF;

  -- 2. Create the mock Tenant (School) record
  INSERT INTO public.school_settings (name, subscription_status)
  VALUES ('My First SaaS School', 'Paid')
  RETURNING school_id INTO v_school_id;

  -- 3. Insert the user into public.users with the admin role and required fields
  INSERT INTO public.users (id, school_id, role, username, name)
  VALUES (v_user_id, v_school_id, 'admin', 'admin', 'System Admin')
  ON CONFLICT (id) DO UPDATE
  SET 
    role = 'admin', 
    school_id = v_school_id;

  -- 4. Embed the critical role and school_id metadata into auth.users 
  -- so JWTs will contain this data for Row Level Security (RLS)
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
    'role', 'admin',
    'school_id', v_school_id
  ) || COALESCE(raw_user_meta_data, '{}'::jsonb)
  WHERE id = v_user_id;

END $$;
