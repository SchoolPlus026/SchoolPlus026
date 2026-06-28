-- SchoolOS+ Demo Data Seeding Script (Staging Sandbox)
-- Target Project: jbjtvosvwufimjcvvwcg
-- Region: India (Mumbai)
-- Password for all accounts: 654321

BEGIN;

-- 1. Create Staging Subscription Plan if not exists
INSERT INTO public.subscription_plans (id, name, amount_paise, validity_days, created_at)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'Premium Staging Plan',
  99900,
  365,
  now()
) ON CONFLICT (id) DO NOTHING;

-- 2. Setup demo testing school
INSERT INTO public.school_settings (
  school_id, name, school_code, subscription_status, classes, modules_active, subscription_tier, plan_type, current_plan_id
) VALUES (
  'd0000000-0000-0000-0000-000000000100',
  'demo testing school',
  '100',
  'Paid',
  ARRAY['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'],
  '["attendance", "fees", "calendar", "notices", "gallery", "timetable", "off_classes", "leaves", "reports", "users", "contact", "billing", "knowledge_base"]'::jsonb,
  'Premium',
  'premium',
  'c0000000-0000-0000-0000-000000000001'
) ON CONFLICT (school_id) DO NOTHING;

-- Helper function to register a user
-- Usage: SELECT seed_user(id, school_id, email, password, role, name, username, class);
CREATE OR REPLACE FUNCTION pg_temp.seed_user(
  p_id uuid,
  p_school_id uuid,
  p_email text,
  p_password text,
  p_role text,
  p_name text,
  p_username text,
  p_class text
) RETURNS void AS $$
BEGIN
  -- Insert to auth.users if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = LOWER(p_email) OR id = p_id) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      p_id, 'authenticated', 'authenticated', LOWER(p_email),
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('school_id', p_school_id, 'role', p_role),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_id, LOWER(p_email),
      jsonb_build_object('sub', p_id::text, 'email', LOWER(p_email)),
      'email', now(), now(), now()
    );
  END IF;

  -- Insert to public.users if not exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_id) THEN
    INSERT INTO public.users (id, school_id, role, username, name, class, contact, email)
    VALUES (p_id, p_school_id, p_role, p_username, p_name, p_class, '9999999999', LOWER(p_email));
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Seed Platform Administrator
SELECT pg_temp.seed_user(
  'a0000000-0000-0000-0000-000000000001',
  NULL,
  'admin@schoolos.plus',
  '654321',
  'platform_admin',
  'Platform Admin',
  'admin',
  NULL
);

-- 4. Seed School Administrator (HM / Principal)
SELECT pg_temp.seed_user(
  'b0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000100',
  'hm@schoolos.plus',
  '654321',
  'admin',
  'Principal HM',
  'HM',
  NULL
);

-- 5. Seed Teachers
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000100',
  'shubham@schoolos.plus',
  '654321',
  'teacher',
  'Shubham Hajare',
  'shubham',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000100',
  'amit2@schoolos.plus',
  '654321',
  'teacher',
  'Amit Kumar',
  'amit2',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000100',
  'raj3@schoolos.plus',
  '654321',
  'teacher',
  'Raj Singh',
  'raj3',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000004',
  'd0000000-0000-0000-0000-000000000100',
  'vijay4@schoolos.plus',
  '654321',
  'teacher',
  'Vijay Patel',
  'vijay4',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000005',
  'd0000000-0000-0000-0000-000000000100',
  'deepak5@schoolos.plus',
  '654321',
  'teacher',
  'Deepak Sharma',
  'deepak5',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000006',
  'd0000000-0000-0000-0000-000000000100',
  'sanjay6@schoolos.plus',
  '654321',
  'teacher',
  'Sanjay Verma',
  'sanjay6',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000007',
  'd0000000-0000-0000-0000-000000000100',
  'anil7@schoolos.plus',
  '654321',
  'teacher',
  'Anil Gupta',
  'anil7',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000008',
  'd0000000-0000-0000-0000-000000000100',
  'sunil8@schoolos.plus',
  '654321',
  'teacher',
  'Sunil Rao',
  'sunil8',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000009',
  'd0000000-0000-0000-0000-000000000100',
  'pankaj9@schoolos.plus',
  '654321',
  'teacher',
  'Pankaj Joshi',
  'pankaj9',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'e0000000-0000-0000-0000-000000000010',
  'd0000000-0000-0000-0000-000000000100',
  'vikas10@schoolos.plus',
  '654321',
  'teacher',
  'Vikas Mehta',
  'vikas10',
  'Class 10'
);

-- 6. Seed Students
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000100',
  'ravi@schoolos.plus',
  '654321',
  'student',
  'Ravi Kumar',
  'ravi',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000100',
  'aadhyakumar2@schoolos.plus',
  '654321',
  'student',
  'Aadhya Kumar',
  'aadhyakumar2',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000100',
  'poojasen3@schoolos.plus',
  '654321',
  'student',
  'Pooja Sen',
  'poojasen3',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000004',
  'd0000000-0000-0000-0000-000000000100',
  'kabirpillai4@schoolos.plus',
  '654321',
  'student',
  'Kabir Pillai',
  'kabirpillai4',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000005',
  'd0000000-0000-0000-0000-000000000100',
  'sanjayrao5@schoolos.plus',
  '654321',
  'student',
  'Sanjay Rao',
  'sanjayrao5',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000006',
  'd0000000-0000-0000-0000-000000000100',
  'priyasharma6@schoolos.plus',
  '654321',
  'student',
  'Priya Sharma',
  'priyasharma6',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000007',
  'd0000000-0000-0000-0000-000000000100',
  'pankajpillai7@schoolos.plus',
  '654321',
  'student',
  'Pankaj Pillai',
  'pankajpillai7',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000008',
  'd0000000-0000-0000-0000-000000000100',
  'shauryapatel8@schoolos.plus',
  '654321',
  'student',
  'Shaurya Patel',
  'shauryapatel8',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000009',
  'd0000000-0000-0000-0000-000000000100',
  'arjunmishra9@schoolos.plus',
  '654321',
  'student',
  'Arjun Mishra',
  'arjunmishra9',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000010',
  'd0000000-0000-0000-0000-000000000100',
  'adityakumar10@schoolos.plus',
  '654321',
  'student',
  'Aditya Kumar',
  'adityakumar10',
  'Class 1'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000011',
  'd0000000-0000-0000-0000-000000000100',
  'amitchoudhury11@schoolos.plus',
  '654321',
  'student',
  'Amit Choudhury',
  'amitchoudhury11',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000012',
  'd0000000-0000-0000-0000-000000000100',
  'jyotichoudhury12@schoolos.plus',
  '654321',
  'student',
  'Jyoti Choudhury',
  'jyotichoudhury12',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000013',
  'd0000000-0000-0000-0000-000000000100',
  'ishaanyadav13@schoolos.plus',
  '654321',
  'student',
  'Ishaan Yadav',
  'ishaanyadav13',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000014',
  'd0000000-0000-0000-0000-000000000100',
  'riyapandey14@schoolos.plus',
  '654321',
  'student',
  'Riya Pandey',
  'riyapandey14',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000015',
  'd0000000-0000-0000-0000-000000000100',
  'diyamishra15@schoolos.plus',
  '654321',
  'student',
  'Diya Mishra',
  'diyamishra15',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000016',
  'd0000000-0000-0000-0000-000000000100',
  'riyareddy16@schoolos.plus',
  '654321',
  'student',
  'Riya Reddy',
  'riyareddy16',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000017',
  'd0000000-0000-0000-0000-000000000100',
  'anilpandey17@schoolos.plus',
  '654321',
  'student',
  'Anil Pandey',
  'anilpandey17',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000018',
  'd0000000-0000-0000-0000-000000000100',
  'amitmishra18@schoolos.plus',
  '654321',
  'student',
  'Amit Mishra',
  'amitmishra18',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000019',
  'd0000000-0000-0000-0000-000000000100',
  'kirangupta19@schoolos.plus',
  '654321',
  'student',
  'Kiran Gupta',
  'kirangupta19',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000020',
  'd0000000-0000-0000-0000-000000000100',
  'amitpillai20@schoolos.plus',
  '654321',
  'student',
  'Amit Pillai',
  'amitpillai20',
  'Class 2'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000021',
  'd0000000-0000-0000-0000-000000000100',
  'ishaanreddy21@schoolos.plus',
  '654321',
  'student',
  'Ishaan Reddy',
  'ishaanreddy21',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000022',
  'd0000000-0000-0000-0000-000000000100',
  'ishaangupta22@schoolos.plus',
  '654321',
  'student',
  'Ishaan Gupta',
  'ishaangupta22',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000023',
  'd0000000-0000-0000-0000-000000000100',
  'adityashah23@schoolos.plus',
  '654321',
  'student',
  'Aditya Shah',
  'adityashah23',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000024',
  'd0000000-0000-0000-0000-000000000100',
  'ananyareddy24@schoolos.plus',
  '654321',
  'student',
  'Ananya Reddy',
  'ananyareddy24',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000025',
  'd0000000-0000-0000-0000-000000000100',
  'krishnapillai25@schoolos.plus',
  '654321',
  'student',
  'Krishna Pillai',
  'krishnapillai25',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000026',
  'd0000000-0000-0000-0000-000000000100',
  'arjunsen26@schoolos.plus',
  '654321',
  'student',
  'Arjun Sen',
  'arjunsen26',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000027',
  'd0000000-0000-0000-0000-000000000100',
  'rahulgupta27@schoolos.plus',
  '654321',
  'student',
  'Rahul Gupta',
  'rahulgupta27',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000028',
  'd0000000-0000-0000-0000-000000000100',
  'kabirsharma28@schoolos.plus',
  '654321',
  'student',
  'Kabir Sharma',
  'kabirsharma28',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000029',
  'd0000000-0000-0000-0000-000000000100',
  'soniareddy29@schoolos.plus',
  '654321',
  'student',
  'Sonia Reddy',
  'soniareddy29',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000030',
  'd0000000-0000-0000-0000-000000000100',
  'kabiryadav30@schoolos.plus',
  '654321',
  'student',
  'Kabir Yadav',
  'kabiryadav30',
  'Class 3'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000031',
  'd0000000-0000-0000-0000-000000000100',
  'pranavpandey31@schoolos.plus',
  '654321',
  'student',
  'Pranav Pandey',
  'pranavpandey31',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000032',
  'd0000000-0000-0000-0000-000000000100',
  'aadhyapandey32@schoolos.plus',
  '654321',
  'student',
  'Aadhya Pandey',
  'aadhyapandey32',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000033',
  'd0000000-0000-0000-0000-000000000100',
  'shauryadas33@schoolos.plus',
  '654321',
  'student',
  'Shaurya Das',
  'shauryadas33',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000034',
  'd0000000-0000-0000-0000-000000000100',
  'jyotisingh34@schoolos.plus',
  '654321',
  'student',
  'Jyoti Singh',
  'jyotisingh34',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000035',
  'd0000000-0000-0000-0000-000000000100',
  'aaravdas35@schoolos.plus',
  '654321',
  'student',
  'Aarav Das',
  'aaravdas35',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000036',
  'd0000000-0000-0000-0000-000000000100',
  'ishaantrivedi36@schoolos.plus',
  '654321',
  'student',
  'Ishaan Trivedi',
  'ishaantrivedi36',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000037',
  'd0000000-0000-0000-0000-000000000100',
  'ritupatel37@schoolos.plus',
  '654321',
  'student',
  'Ritu Patel',
  'ritupatel37',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000038',
  'd0000000-0000-0000-0000-000000000100',
  'anjalimehta38@schoolos.plus',
  '654321',
  'student',
  'Anjali Mehta',
  'anjalimehta38',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000039',
  'd0000000-0000-0000-0000-000000000100',
  'riyayadav39@schoolos.plus',
  '654321',
  'student',
  'Riya Yadav',
  'riyayadav39',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000040',
  'd0000000-0000-0000-0000-000000000100',
  'aanyareddy40@schoolos.plus',
  '654321',
  'student',
  'Aanya Reddy',
  'aanyareddy40',
  'Class 4'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000041',
  'd0000000-0000-0000-0000-000000000100',
  'diyashah41@schoolos.plus',
  '654321',
  'student',
  'Diya Shah',
  'diyashah41',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000042',
  'd0000000-0000-0000-0000-000000000100',
  'riyatrivedi42@schoolos.plus',
  '654321',
  'student',
  'Riya Trivedi',
  'riyatrivedi42',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000043',
  'd0000000-0000-0000-0000-000000000100',
  'rohansingh43@schoolos.plus',
  '654321',
  'student',
  'Rohan Singh',
  'rohansingh43',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000044',
  'd0000000-0000-0000-0000-000000000100',
  'poojayadav44@schoolos.plus',
  '654321',
  'student',
  'Pooja Yadav',
  'poojayadav44',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000045',
  'd0000000-0000-0000-0000-000000000100',
  'ishaverma45@schoolos.plus',
  '654321',
  'student',
  'Isha Verma',
  'ishaverma45',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000046',
  'd0000000-0000-0000-0000-000000000100',
  'sunilnair46@schoolos.plus',
  '654321',
  'student',
  'Sunil Nair',
  'sunilnair46',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000047',
  'd0000000-0000-0000-0000-000000000100',
  'aanyasharma47@schoolos.plus',
  '654321',
  'student',
  'Aanya Sharma',
  'aanyasharma47',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000048',
  'd0000000-0000-0000-0000-000000000100',
  'ananyajoshi48@schoolos.plus',
  '654321',
  'student',
  'Ananya Joshi',
  'ananyajoshi48',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000049',
  'd0000000-0000-0000-0000-000000000100',
  'aanyayadav49@schoolos.plus',
  '654321',
  'student',
  'Aanya Yadav',
  'aanyayadav49',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000050',
  'd0000000-0000-0000-0000-000000000100',
  'ritutrivedi50@schoolos.plus',
  '654321',
  'student',
  'Ritu Trivedi',
  'ritutrivedi50',
  'Class 5'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000051',
  'd0000000-0000-0000-0000-000000000100',
  'saikumar51@schoolos.plus',
  '654321',
  'student',
  'Sai Kumar',
  'saikumar51',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000052',
  'd0000000-0000-0000-0000-000000000100',
  'meeramishra52@schoolos.plus',
  '654321',
  'student',
  'Meera Mishra',
  'meeramishra52',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000053',
  'd0000000-0000-0000-0000-000000000100',
  'shauryanair53@schoolos.plus',
  '654321',
  'student',
  'Shaurya Nair',
  'shauryanair53',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000054',
  'd0000000-0000-0000-0000-000000000100',
  'anushkasharma54@schoolos.plus',
  '654321',
  'student',
  'Anushka Sharma',
  'anushkasharma54',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000055',
  'd0000000-0000-0000-0000-000000000100',
  'divyagupta55@schoolos.plus',
  '654321',
  'student',
  'Divya Gupta',
  'divyagupta55',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000056',
  'd0000000-0000-0000-0000-000000000100',
  'sanjaymishra56@schoolos.plus',
  '654321',
  'student',
  'Sanjay Mishra',
  'sanjaymishra56',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000057',
  'd0000000-0000-0000-0000-000000000100',
  'ishachoudhury57@schoolos.plus',
  '654321',
  'student',
  'Isha Choudhury',
  'ishachoudhury57',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000058',
  'd0000000-0000-0000-0000-000000000100',
  'shauryamishra58@schoolos.plus',
  '654321',
  'student',
  'Shaurya Mishra',
  'shauryamishra58',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000059',
  'd0000000-0000-0000-0000-000000000100',
  'priyanair59@schoolos.plus',
  '654321',
  'student',
  'Priya Nair',
  'priyanair59',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000060',
  'd0000000-0000-0000-0000-000000000100',
  'priyakumar60@schoolos.plus',
  '654321',
  'student',
  'Priya Kumar',
  'priyakumar60',
  'Class 6'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000061',
  'd0000000-0000-0000-0000-000000000100',
  'amitpandey61@schoolos.plus',
  '654321',
  'student',
  'Amit Pandey',
  'amitpandey61',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000062',
  'd0000000-0000-0000-0000-000000000100',
  'anushkadas62@schoolos.plus',
  '654321',
  'student',
  'Anushka Das',
  'anushkadas62',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000063',
  'd0000000-0000-0000-0000-000000000100',
  'vihaannair63@schoolos.plus',
  '654321',
  'student',
  'Vihaan Nair',
  'vihaannair63',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000064',
  'd0000000-0000-0000-0000-000000000100',
  'amitreddy64@schoolos.plus',
  '654321',
  'student',
  'Amit Reddy',
  'amitreddy64',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000065',
  'd0000000-0000-0000-0000-000000000100',
  'saimishra65@schoolos.plus',
  '654321',
  'student',
  'Sai Mishra',
  'saimishra65',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000066',
  'd0000000-0000-0000-0000-000000000100',
  'meerarao66@schoolos.plus',
  '654321',
  'student',
  'Meera Rao',
  'meerarao66',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000067',
  'd0000000-0000-0000-0000-000000000100',
  'vihaanpandey67@schoolos.plus',
  '654321',
  'student',
  'Vihaan Pandey',
  'vihaanpandey67',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000068',
  'd0000000-0000-0000-0000-000000000100',
  'ishaanshah68@schoolos.plus',
  '654321',
  'student',
  'Ishaan Shah',
  'ishaanshah68',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000069',
  'd0000000-0000-0000-0000-000000000100',
  'shauryasharma69@schoolos.plus',
  '654321',
  'student',
  'Shaurya Sharma',
  'shauryasharma69',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000070',
  'd0000000-0000-0000-0000-000000000100',
  'diyasharma70@schoolos.plus',
  '654321',
  'student',
  'Diya Sharma',
  'diyasharma70',
  'Class 7'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000071',
  'd0000000-0000-0000-0000-000000000100',
  'priyareddy71@schoolos.plus',
  '654321',
  'student',
  'Priya Reddy',
  'priyareddy71',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000072',
  'd0000000-0000-0000-0000-000000000100',
  'aadhyareddy72@schoolos.plus',
  '654321',
  'student',
  'Aadhya Reddy',
  'aadhyareddy72',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000073',
  'd0000000-0000-0000-0000-000000000100',
  'adityaverma73@schoolos.plus',
  '654321',
  'student',
  'Aditya Verma',
  'adityaverma73',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000074',
  'd0000000-0000-0000-0000-000000000100',
  'kiransen74@schoolos.plus',
  '654321',
  'student',
  'Kiran Sen',
  'kiransen74',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000075',
  'd0000000-0000-0000-0000-000000000100',
  'anjalimishra75@schoolos.plus',
  '654321',
  'student',
  'Anjali Mishra',
  'anjalimishra75',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000076',
  'd0000000-0000-0000-0000-000000000100',
  'aadhyatrivedi76@schoolos.plus',
  '654321',
  'student',
  'Aadhya Trivedi',
  'aadhyatrivedi76',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000077',
  'd0000000-0000-0000-0000-000000000100',
  'vikaspandey77@schoolos.plus',
  '654321',
  'student',
  'Vikas Pandey',
  'vikaspandey77',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000078',
  'd0000000-0000-0000-0000-000000000100',
  'ritugupta78@schoolos.plus',
  '654321',
  'student',
  'Ritu Gupta',
  'ritugupta78',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000079',
  'd0000000-0000-0000-0000-000000000100',
  'diyarao79@schoolos.plus',
  '654321',
  'student',
  'Diya Rao',
  'diyarao79',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000080',
  'd0000000-0000-0000-0000-000000000100',
  'ishaanmehta80@schoolos.plus',
  '654321',
  'student',
  'Ishaan Mehta',
  'ishaanmehta80',
  'Class 8'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000081',
  'd0000000-0000-0000-0000-000000000100',
  'rohanchoudhury81@schoolos.plus',
  '654321',
  'student',
  'Rohan Choudhury',
  'rohanchoudhury81',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000082',
  'd0000000-0000-0000-0000-000000000100',
  'arjunyadav82@schoolos.plus',
  '654321',
  'student',
  'Arjun Yadav',
  'arjunyadav82',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000083',
  'd0000000-0000-0000-0000-000000000100',
  'vihaantrivedi83@schoolos.plus',
  '654321',
  'student',
  'Vihaan Trivedi',
  'vihaantrivedi83',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000084',
  'd0000000-0000-0000-0000-000000000100',
  'saigupta84@schoolos.plus',
  '654321',
  'student',
  'Sai Gupta',
  'saigupta84',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000085',
  'd0000000-0000-0000-0000-000000000100',
  'soniagupta85@schoolos.plus',
  '654321',
  'student',
  'Sonia Gupta',
  'soniagupta85',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000086',
  'd0000000-0000-0000-0000-000000000100',
  'snehasingh86@schoolos.plus',
  '654321',
  'student',
  'Sneha Singh',
  'snehasingh86',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000087',
  'd0000000-0000-0000-0000-000000000100',
  'anushkakumar87@schoolos.plus',
  '654321',
  'student',
  'Anushka Kumar',
  'anushkakumar87',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000088',
  'd0000000-0000-0000-0000-000000000100',
  'amitsen88@schoolos.plus',
  '654321',
  'student',
  'Amit Sen',
  'amitsen88',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000089',
  'd0000000-0000-0000-0000-000000000100',
  'aanyanair89@schoolos.plus',
  '654321',
  'student',
  'Aanya Nair',
  'aanyanair89',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000090',
  'd0000000-0000-0000-0000-000000000100',
  'deepaksharma90@schoolos.plus',
  '654321',
  'student',
  'Deepak Sharma',
  'deepaksharma90',
  'Class 9'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000091',
  'd0000000-0000-0000-0000-000000000100',
  'kiransingh91@schoolos.plus',
  '654321',
  'student',
  'Kiran Singh',
  'kiransingh91',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000092',
  'd0000000-0000-0000-0000-000000000100',
  'deepakmehta92@schoolos.plus',
  '654321',
  'student',
  'Deepak Mehta',
  'deepakmehta92',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000093',
  'd0000000-0000-0000-0000-000000000100',
  'shauryasingh93@schoolos.plus',
  '654321',
  'student',
  'Shaurya Singh',
  'shauryasingh93',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000094',
  'd0000000-0000-0000-0000-000000000100',
  'poojatrivedi94@schoolos.plus',
  '654321',
  'student',
  'Pooja Trivedi',
  'poojatrivedi94',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000095',
  'd0000000-0000-0000-0000-000000000100',
  'tanvichoudhury95@schoolos.plus',
  '654321',
  'student',
  'Tanvi Choudhury',
  'tanvichoudhury95',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000096',
  'd0000000-0000-0000-0000-000000000100',
  'adityajoshi96@schoolos.plus',
  '654321',
  'student',
  'Aditya Joshi',
  'adityajoshi96',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000097',
  'd0000000-0000-0000-0000-000000000100',
  'aanyagupta97@schoolos.plus',
  '654321',
  'student',
  'Aanya Gupta',
  'aanyagupta97',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000098',
  'd0000000-0000-0000-0000-000000000100',
  'pankajverma98@schoolos.plus',
  '654321',
  'student',
  'Pankaj Verma',
  'pankajverma98',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000099',
  'd0000000-0000-0000-0000-000000000100',
  'vijayyadav99@schoolos.plus',
  '654321',
  'student',
  'Vijay Yadav',
  'vijayyadav99',
  'Class 10'
);
SELECT pg_temp.seed_user(
  'f0000000-0000-0000-0000-000000000100',
  'd0000000-0000-0000-0000-000000000100',
  'vikasnair100@schoolos.plus',
  '654321',
  'student',
  'Vikas Nair',
  'vikasnair100',
  'Class 10'
);

COMMIT;
