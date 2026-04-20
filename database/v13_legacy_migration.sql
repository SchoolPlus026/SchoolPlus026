-- ============================================================
-- V13: LEGACY DATA MIGRATION (School 120)
-- ============================================================

DO $$
DECLARE
    v_school_id  uuid := gen_random_uuid();
    v_admin_id   uuid := gen_random_uuid();
    -- Raw inputs for teachers and students
    u record;
    new_uid uuid;
BEGIN
    -- 1. Create the new school structure
    INSERT INTO public.school_settings (school_id, name, school_code, subscription_status)
    VALUES (v_school_id, 'Legacy School Data', '120', 'Paid');

    -- 2. Create the standalone admin (admin120)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_admin_id, 'authenticated', 'authenticated', 'admin120@school.com',
        crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('role', 'admin', 'school_id', v_school_id::text),
        now(), now()
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_admin_id, 'admin120@school.com',
        jsonb_build_object('sub', v_admin_id::text, 'email', 'admin120@school.com'),
        'email', now(), now()
    );

    INSERT INTO public.users (id, school_id, role, username, name)
    VALUES (v_admin_id, v_school_id, 'admin', 'admin120', 'School Admin 120');

    -- 3. Loop over legacy user data and insert for teachers & students
    FOR u IN (
        SELECT username, role, name, class, qualification, aadhar_card 
        FROM (VALUES 
            ('teacher_hajare', 'teacher', 'Hajare Shubham', '5th', 'M.Sc, B.Ed', null),
            ('teacher_awhad', 'teacher', 'Awhad S.N.', null, 'B.A., B.Ed', null),
            ('teacher_jagyatkar', 'teacher', 'Jagyatkar B.N.', null, 'M.A., B.Ed', null),
            ('teacher_paddwaina', 'teacher', 'Paddwaina S.G.', null, 'M.A., B.Ed', null),
            ('teacher_atade', 'teacher', 'Atade R.A.', null, 'B.Sc, D.Ed', null),
            ('teacher_hatte', 'teacher', 'Hatte M.', null, 'B.Sc', null),
            ('teacher_ujagare', 'teacher', 'Ujagare D.D.', null, 'M.Sc', null),
            ('teacher_chandane', 'teacher', 'Chandane S.P.', null, 'M.A., B.Ed', null),
            ('teacher_kasabe', 'teacher', 'Kasabe S.M.', null, 'B.Ed', null),
            ('teacher_nagpure', 'teacher', 'Nagpure D.P.', null, 'B.P.Ed', null),
            ('teacher_shaikh', 'teacher', 'Shaikh Naseem', null, 'M.A., B.Ed', null),
            ('teacher_meharkar', 'teacher', 'Meharkar M.V.', null, 'B.A.', null),
            ('teacher_swarupa', 'teacher', 'Swarupa Peddavana', null, 'M.A.', null),
            ('teacher_radhika', 'teacher', 'Radhika Lokhande', null, 'B.A.', null),
            ('teacher_shakuntala', 'teacher', 'Shakuntala Awad', null, 'B.A.', null),
            ('stu_rija', 'student', 'Riya Sharma', '5th', null, '123456789012'),
            ('stu_arjun', 'student', 'Arjun Verma', '5th', null, null),
            ('stu_jawwad', 'student', 'Jawwad Khan', '5th', null, null),
            ('oplead', 'student', 'ADHIRAJ AMOL OPLE', '1st', NULL, NULL),
            ('piadaal', 'student', 'ALIM AJIJUL PIADA', '1st', NULL, NULL),
            ('bagwalela', 'student', 'LAKSHA MANOJ BAGWALE', '1st', NULL, NULL),
            ('chavanma', 'student', 'MAYANK AKASH CHAVAN', '1st', NULL, NULL),
            ('sayyadum', 'student', 'UMAR KATTU SAYYAD', '1st', NULL, NULL),
            ('shaikhda', 'student', 'DANISH VAZEER SHAIKH', '2nd', NULL, NULL),
            ('popalghatdh', 'student', 'DHRUV SHRIKANT POPALGHAT', '2nd', NULL, NULL),
            ('khanha', 'student', 'HABIB KHAN HAIDAR KHAN', '2nd', NULL, NULL),
            ('yadavja', 'student', 'JANHVI RAJESH YADAV', '2nd', NULL, NULL),
            ('santoliyara', 'student', 'RAJ ROHITASH SANTOLIYA', '2nd', NULL, NULL),
            ('santoliyara2', 'student', 'RAJ SANTOLIYA', '2nd', NULL, NULL),
            ('aryaan', 'student', 'ANUVED SATYENDRA ARYA', '3rd', NULL, NULL),
            ('sayyadfa', 'student', 'FAIZ YUNUS SAYYAD', '3rd', NULL, NULL),
            ('shaikhmo', 'student', 'MOHAMMADSAAD ZUBER SHAIKH', '3rd', NULL, NULL),
            ('awadna', 'student', 'NARSIMHA NITIN AWAD', '3rd', NULL, NULL),
            ('balwantra', 'student', 'RAJVEER ANKUSH BALWANT', '3rd', NULL, NULL),
            ('ahemadsa', 'student', 'SAYYED ABDUL RAHEEM AHEMAD', '3rd', NULL, NULL),
            ('pathanja', 'student', 'JAVERIYA AMJAD PATHAN', '4th', NULL, NULL),
            ('shaikhmo2', 'student', 'MOHAMMAD RAHIMODDIN SHAIKH', '4th', NULL, NULL),
            ('pradipsh', 'student', 'SHAIKH GAUS PRADIP', '4th', NULL, NULL),
            ('devkaran', 'student', 'ANUSH BALAJI DEVKAR', '5th', NULL, NULL),
            ('palwadear', 'student', 'ARADHYA KHANDERAO PALWADE', '5th', NULL, NULL),
            ('shaikhar', 'student', 'ARHAN MOHAMMAD FAYAZODDIN SHAIKH', '5th', NULL, NULL),
            ('khanga', 'student', 'GAUS HAYAT KHAN', '5th', NULL, NULL),
            ('shaikhhu', 'student', 'HUMERA SAMEER SHAIKH', '5th', NULL, NULL),
            ('shaikhja', 'student', 'JAVVAD SAMAD SHAIKH', '5th', NULL, NULL),
            ('khansa', 'student', 'SAADKHAN SAJED KHAN', '5th', NULL, NULL),
            ('shaikhar2', 'student', 'ARFAT LLLIYAS SHAIKH', '6th', NULL, NULL),
            ('mundliksa', 'student', 'SAMARTH EKNATH MUNDLIK', '6th', NULL, NULL),
            ('qureshiaf', 'student', 'AFIFA ABDULLA QURESHI', '7th', NULL, NULL),
            ('shaikhaz', 'student', 'AZHAN SAMEER SHAIKH', '7th', NULL, NULL),
            ('waghmaresu', 'student', 'SUSHANT SUDHIR WAGHMARE', '7th', NULL, NULL),
            ('waghmareya', 'student', 'YASH VILAS WAGHMARE', '7th', NULL, NULL),
            ('shaikhay', 'student', 'AYYAZ LLIYAS SHAIKH', '8th', NULL, NULL),
            ('phadka', 'student', 'KARAN VISHNU PHAD', '8th', NULL, NULL),
            ('gayakwadpr', 'student', 'PRALHAD DASHRATH GAYAKWAD', '8th', NULL, NULL),
            ('eliyassa', 'student', 'SABEER SHAIKH ELIYAS', '8th', NULL, NULL),
            ('jogdandtr', 'student', 'TRISHARAN MANOHAR JOGDAND', '8th', NULL, NULL)
        ) AS t(username, role, name, class, qualification, aadhar_card)
    ) LOOP
        new_uid := gen_random_uuid();
        
        -- Default email based on username mapped
        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            new_uid, 'authenticated', 'authenticated', u.username || '@school.com',
            crypt('123456', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('role', u.role, 'school_id', v_school_id::text),
            now(), now()
        );

        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), new_uid, u.username || '@school.com',
            jsonb_build_object('sub', new_uid::text, 'email', u.username || '@school.com'),
            'email', now(), now()
        );

        INSERT INTO public.users (id, school_id, role, username, name, class, qualification, aadhar_card)
        VALUES (new_uid, v_school_id, u.role, u.username, u.name, u.class, u.qualification, u.aadhar_card);
    END LOOP;

    -- 4. Calendar Events Migration
    INSERT INTO public.calendar_events (school_id, title, start_date, end_date, type)
    SELECT v_school_id, title, start_date, end_date, 'activity'
    FROM (VALUES
        ('School Start, Jijau Punyathiti','2025-06-16'::date,'2025-06-16'::date),
        ('Admission Period','2025-06-16','2025-06-30'),
        ('Yoga Day Celebration and Parents Teacher Meeting','2025-06-21','2025-06-21'),
        ('Staff Meeting (Half Day for Students)','2025-06-30','2025-06-30'),
        ('Guru Poornima Speeches, Importance of Teachers PTM','2025-07-10','2025-07-10'),
        ('Independence Day','2025-08-15','2025-08-15')
    ) AS cv(title, start_date, end_date);

    -- 5. Timetable Migration
    INSERT INTO public.timetable (school_id, class, day, period_order, period_label, subject, teacher)
    SELECT v_school_id, class, day, period_order, period_label, subject, teacher
    FROM (VALUES
        ('5th','Monday',1,'9:00-9:40 AM','English','Hajare Shubham'),
        ('5th','Monday',2,'9:40-10:15 AM','Hindi','Awhad S.N.'),
        ('5th','Monday',3,'10:15-10:50 AM','Maths','Hatte M.'),
        ('5th','Monday',4,'10:50-11:25 AM','Science','Ujagare D.D.'),
        ('5th','Monday',5,'11:45-12:20 PM','PT','Nagpure D.P.'),
        ('5th','Monday',6,'12:20-1:00 PM','History','Chandane S.P.')
    ) AS tv(class, day, period_order, period_label, subject, teacher);

END $$;
