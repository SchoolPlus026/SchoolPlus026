# old app supebase sql file 1


-- This is the final and corrected script.
-- FIX: Added UNIQUE constraints to the calendar_events and timetable tables
-- to match the ON CONFLICT rules in the INSERT statements. This resolves the error.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. TABLE DEFINITIONS (With UNIQUE constraints added)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text UNIQUE NOT NULL,
      password text NOT NULL,
        role text NOT NULL,
          name text,
            class text,
              contact text,
                qualification text,
                  aadhar_card text,
                    created_at timestamptz DEFAULT now()
                    );

                    CREATE TABLE IF NOT EXISTS public.calendar_events (
                      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        title text NOT NULL,
                          description text,
                            start_date date NOT NULL,
                              end_date date,
                                type text,
                                  created_at timestamptz DEFAULT now(),
                                    -- FIX: Added UNIQUE constraint to match the ON CONFLICT rule below
                                      CONSTRAINT unique_event_title_date UNIQUE (title, start_date)
                                      );

                                      CREATE TABLE IF NOT EXISTS public.notices (
                                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                          title text NOT NULL,
                                            content text,
                                              scope text DEFAULT 'all',
                                                created_by text,
                                                  date date,
                                                    created_at timestamptz DEFAULT now()
                                                    );

                                                    CREATE TABLE IF NOT EXISTS public.attendance (
                                                      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                        who text NOT NULL,
                                                          role text NOT NULL,
                                                            date date NOT NULL,
                                                              status text,
                                                                created_at timestamptz DEFAULT now()
                                                                );

                                                                CREATE TABLE IF NOT EXISTS public.fees (
                                                                  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                                    student_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
                                                                      year int NOT NULL,
                                                                        total numeric NOT NULL,
                                                                          created_at timestamptz DEFAULT now()
                                                                          );

                                                                          CREATE TABLE IF NOT EXISTS public.fees_payments (
                                                                            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                                              fee_id uuid REFERENCES public.fees(id) ON DELETE CASCADE,
                                                                                amount numeric NOT NULL,
                                                                                  payment_date date,
                                                                                    method text,
                                                                                      notes text,
                                                                                        created_at timestamptz DEFAULT now()
                                                                                        );

                                                                                        CREATE TABLE IF NOT EXISTS public.leaves (
                                                                                          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                                                            who text NOT NULL,
                                                                                              role text NOT NULL,
                                                                                                from_date date NOT NULL,
                                                                                                  to_date date NOT NULL,
                                                                                                    reason text,
                                                                                                      status text DEFAULT 'pending',
                                                                                                        attachment text,
                                                                                                          created_at timestamptz DEFAULT now()
                                                                                                          );

                                                                                                          CREATE TABLE IF NOT EXISTS public.gallery (
                                                                                                            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                                                                              title text,
                                                                                                                link text,
                                                                                                                  category text,
                                                                                                                    created_at timestamptz DEFAULT now()
                                                                                                                    );

                                                                                                                    CREATE TABLE IF NOT EXISTS public.timetable (
                                                                                                                      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                                                                                        class text NOT NULL,
                                                                                                                          day text NOT NULL,
                                                                                                                            day_order int,
                                                                                                                              period_order int,
                                                                                                                                period_label text,
                                                                                                                                  subject text,
                                                                                                                                    teacher text,
                                                                                                                                      created_at timestamptz DEFAULT now(),
                                                                                                                                        -- FIX: Added UNIQUE constraint to match the ON CONFLICT rule below
                                                                                                                                          CONSTRAINT unique_timetable_slot UNIQUE (class, day, period_order)
                                                                                                                                          );

                                                                                                                                          CREATE TABLE IF NOT EXISTS public.notifications (
                                                                                                                                            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                                                                                                              to_user text NOT NULL,
                                                                                                                                                message text,
                                                                                                                                                  link text,
                                                                                                                                                    is_read boolean DEFAULT false,
                                                                                                                                                      created_at timestamptz DEFAULT now()
                                                                                                                                                      );

                                                                                                                                                      -- =====================================================================
                                                                                                                                                      -- 2. SCHEMA CHANGES
                                                                                                                                                      -- =====================================================================

                                                                                                                                                      ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS photo_link TEXT;
                                                                                                                                                      ALTER TABLE public.fees ADD COLUMN IF NOT EXISTS last_year_pending NUMERIC DEFAULT 0;

                                                                                                                                                      -- =====================================================================
                                                                                                                                                      -- 3. ROW LEVEL SECURITY (RLS) POLICIES
                                                                                                                                                      -- =====================================================================

                                                                                                                                                      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view other users" ON public.users;
                                                                                                                                                      CREATE POLICY "All users can view other users" ON public.users FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins can manage users" ON public.users;
                                                                                                                                                      CREATE POLICY "Admins can manage users" ON public.users FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view events" ON public.calendar_events;
                                                                                                                                                      CREATE POLICY "All users can view events" ON public.calendar_events FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins and teachers can manage events" ON public.calendar_events;
                                                                                                                                                      CREATE POLICY "Admins and teachers can manage events" ON public.calendar_events FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view notices" ON public.notices;
                                                                                                                                                      CREATE POLICY "All users can view notices" ON public.notices FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins and teachers can manage notices" ON public.notices;
                                                                                                                                                      CREATE POLICY "Admins and teachers can manage notices" ON public.notices FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view attendance" ON public.attendance;
                                                                                                                                                      CREATE POLICY "All users can view attendance" ON public.attendance FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins and teachers can manage attendance" ON public.attendance;
                                                                                                                                                      CREATE POLICY "Admins and teachers can manage attendance" ON public.attendance FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view fees" ON public.fees;
                                                                                                                                                      CREATE POLICY "All users can view fees" ON public.fees FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins can manage fees" ON public.fees;
                                                                                                                                                      CREATE POLICY "Admins can manage fees" ON public.fees FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.fees_payments ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view payments" ON public.fees_payments;
                                                                                                                                                      CREATE POLICY "All users can view payments" ON public.fees_payments FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins can manage payments" ON public.fees_payments;
                                                                                                                                                      CREATE POLICY "Admins can manage payments" ON public.fees_payments FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view leaves" ON public.leaves;
                                                                                                                                                      CREATE POLICY "All users can view leaves" ON public.leaves FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins can manage all leaves" ON public.leaves;
                                                                                                                                                      CREATE POLICY "Admins can manage all leaves" ON public.leaves FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view gallery" ON public.gallery;
                                                                                                                                                      CREATE POLICY "All users can view gallery" ON public.gallery FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins can manage gallery" ON public.gallery;
                                                                                                                                                      CREATE POLICY "Admins can manage gallery" ON public.gallery FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view timetable" ON public.timetable;
                                                                                                                                                      CREATE POLICY "All users can view timetable" ON public.timetable FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins and teachers can manage timetable" ON public.timetable;
                                                                                                                                                      CREATE POLICY "Admins and teachers can manage timetable" ON public.timetable FOR ALL USING (true);

                                                                                                                                                      ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
                                                                                                                                                      DROP POLICY IF EXISTS "All users can view notifications" ON public.notifications;
                                                                                                                                                      CREATE POLICY "All users can view notifications" ON public.notifications FOR SELECT USING (true);
                                                                                                                                                      DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
                                                                                                                                                      CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL USING (true);

                                                                                                                                                      -- =====================================================================
                                                                                                                                                      -- 4. DATA MIGRATION
                                                                                                                                                      -- =====================================================================

                                                                                                                                                      UPDATE public.users SET class = '5th' WHERE class = '5A';
                                                                                                                                                      UPDATE public.timetable SET class = '5th' WHERE class = '5A';

                                                                                                                                                      -- =====================================================================
                                                                                                                                                      -- 5. SEED DATA
                                                                                                                                                      -- =====================================================================

                                                                                                                                                      INSERT INTO public.users (username, password, role, name, class, qualification, aadhar_card)
                                                                                                                                                      VALUES
                                                                                                                                                      ('admin', 'admin123', 'Admin', 'School Admin', null, null, null),
                                                                                                                                                      ('teacher_hajare', 'hajare123', 'Teacher', 'Hajare Shubham', '5th', 'M.Sc, B.Ed', null),
                                                                                                                                                      ('teacher_awhad', 'awhad123', 'Teacher', 'Awhad S.N.', null, 'B.A., B.Ed', null),
                                                                                                                                                      ('teacher_jagyatkar', 'jagyatkar123', 'Teacher', 'Jagyatkar B.N.', null, 'M.A., B.Ed', null),
                                                                                                                                                      ('teacher_paddwaina', 'paddwaina123', 'Teacher', 'Paddwaina S.G.', null, 'M.A., B.Ed', null),
                                                                                                                                                      ('teacher_atade', 'atade123', 'Teacher', 'Atade R.A.', null, 'B.Sc, D.Ed', null),
                                                                                                                                                      ('teacher_hatte', 'hatte123', 'Teacher', 'Hatte M.', null, 'B.Sc', null),
                                                                                                                                                      ('teacher_ujagare', 'ujagare123', 'Teacher', 'Ujagare D.D.', null, 'M.Sc', null),
                                                                                                                                                      ('teacher_chandane', 'chandane123', 'Teacher', 'Chandane S.P.', null, 'M.A., B.Ed', null),
                                                                                                                                                      ('teacher_kasabe', 'kasabe123', 'Teacher', 'Kasabe S.M.', null, 'B.Ed', null),
                                                                                                                                                      ('teacher_nagpure', 'nagpure123', 'Teacher', 'Nagpure D.P.', null, 'B.P.Ed', null),
                                                                                                                                                      ('teacher_shaikh', 'shaikh123', 'Teacher', 'Shaikh Naseem', null, 'M.A., B.Ed', null),
                                                                                                                                                      ('teacher_meharkar', 'meharkar123', 'Teacher', 'Meharkar M.V.', null, 'B.A.', null),
                                                                                                                                                      ('teacher_swarupa', 'swarupa123', 'Teacher', 'Swarupa Peddavana', null, 'M.A.', null),
                                                                                                                                                      ('teacher_radhika', 'radhika123', 'Teacher', 'Radhika Lokhande', null, 'B.A.', null),
                                                                                                                                                      ('teacher_shakuntala', 'shakuntala123', 'Teacher', 'Shakuntala Awad', null, 'B.A.', null),
                                                                                                                                                      ('stu_rija', 'student123', 'Student', 'Riya Sharma', '5th', null, '123456789012'),
                                                                                                                                                      ('stu_arjun', 'student123', 'Student', 'Arjun Verma', '5th', null, null),
                                                                                                                                                      ('stu_jawwad', 'just123', 'Student', 'Jawwad Khan', '5th', null, null)
                                                                          
                                                                             ('piadaal', 'Piada321', 'student', 'ALIM AJIJUL PIADA', '1st', NULL, NULL),
                                                                             ('bagwalela', 'Bagwale321', 'student', 'LAKSHA MANOJ BAGWALE', '1st', NULL, NULL),
                                                                             ('chavanma', 'Chavan321', 'student', 'MAYANK AKASH CHAVAN', '1st', NULL, NULL),
                                                                             ('sayyadum', 'Sayyad321', 'student', 'UMAR KATTU SAYYAD', '1st', NULL, NULL),

                                                                             -- Class 2nd
                                                                             ('shaikhda', 'Shaikh321', 'student', 'DANISH VAZEER SHAIKH', '2nd', NULL, NULL),
                                                                             ('popalghatdh', 'Popalghat321', 'student', 'DHRUV SHRIKANT POPALGHAT', '2nd', NULL, NULL),
                                                                             ('khanha', 'Khan321', 'student', 'HABIB KHAN HAIDAR KHAN', '2nd', NULL, NULL),
                                                                             ('yadavja', 'Yadav321', 'student', 'JANHVI RAJESH YADAV', '2nd', NULL, NULL),
                                                                             ('santoliyara', 'Santoliya321', 'student', 'RAJ ROHITASH SANTOLIYA', '2nd', NULL, NULL),
                                                                             ('santoliyara2', 'Santoliya321', 'student', 'RAJ SANTOLIYA', '2nd', NULL, NULL),

                                                                             -- Class 3rd
                                                                             ('aryaan', 'Arya321', 'student', 'ANUVED SATYENDRA ARYA', '3rd', NULL, NULL),
                                                                             ('sayyadfa', 'Sayyad321', 'student', 'FAIZ YUNUS SAYYAD', '3rd', NULL, NULL),
                                                                             ('shaikhmo', 'Shaikh321', 'student', 'MOHAMMADSAAD ZUBER SHAIKH', '3rd', NULL, NULL),
                                                                             ('awadna', 'Awad321', 'student', 'NARSIMHA NITIN AWAD', '3rd', NULL, NULL),
                                                                             ('balwantra', 'Balwant321', 'student', 'RAJVEER ANKUSH BALWANT', '3rd', NULL, NULL),
                                                                             ('ahemadsa', 'Ahemad321', 'student', 'SAYYED ABDUL RAHEEM AHEMAD', '3rd', NULL, NULL),

                                                                             -- Class 4th
                                                                             ('pathanja', 'Pathan321', 'student', 'JAVERIYA AMJAD PATHAN', '4th', NULL, NULL),
                                                                             ('shaikhmo2', 'Shaikh321', 'student', 'MOHAMMAD RAHIMODDIN SHAIKH', '4th', NULL, NULL),
                                                                             ('pradipsh', 'Pradip321', 'student', 'SHAIKH GAUS PRADIP', '4th', NULL, NULL),

                                                                             -- Class 5th
                                                                             ('devkaran', 'Devkar321', 'student', 'ANUSH BALAJI DEVKAR', '5th', NULL, NULL),
                                                                             ('palwadear', 'Palwade321', 'student', 'ARADHYA KHANDERAO PALWADE', '5th', NULL, NULL),
                                                                             ('shaikhar', 'Shaikh321', 'student', 'ARHAN MOHAMMAD FAYAZODDIN SHAIKH', '5th', NULL, NULL),
                                                                             ('khanga', 'Khan321', 'student', 'GAUS HAYAT KHAN', '5th', NULL, NULL),
                                                                             ('shaikhhu', 'Shaikh321', 'student', 'HUMERA SAMEER SHAIKH', '5th', NULL, NULL),
                                                                             ('shaikhja', 'Shaikh321', 'student', 'JAVVAD SAMAD SHAIKH', '5th', NULL, NULL),
                                                                             ('khansa', 'Khan321', 'student', 'SAADKHAN SAJED KHAN', '5th', NULL, NULL),

                                                                             -- Class 6th
                                                                             ('shaikhar2', 'Shaikh321', 'student', 'ARFAT LLLIYAS SHAIKH', '6th', NULL, NULL),
                                                                             ('mundliksa', 'Mundlik321', 'student', 'SAMARTH EKNATH MUNDLIK', '6th', NULL, NULL),

                                                                             -- Class 7th
                                                                             ('qureshiaf', 'Qureshi321', 'student', 'AFIFA ABDULLA QURESHI', '7th', NULL, NULL),
                                                                             ('shaikhaz', 'Shaikh321', 'student', 'AZHAN SAMEER SHAIKH', '7th', NULL, NULL),
                                                                             ('waghmaresu', 'Waghmare321', 'student', 'SUSHANT SUDHIR WAGHMARE', '7th', NULL, NULL),
                                                                             ('waghmareya', 'Waghmare321', 'student', 'YASH VILAS WAGHMARE', '7th', NULL, NULL),

                                                                             -- Class 8th
                                                                             ('shaikhay', 'Shaikh321', 'student', 'AYYAZ LLIYAS SHAIKH', '8th', NULL, NULL),
                                                                             ('phadka', 'Phad321', 'student', 'KARAN VISHNU PHAD', '8th', NULL, NULL),
                                                                             ('gayakwadpr', 'Gayakwad321', 'student', 'PRALHAD DASHRATH GAYAKWAD', '8th', NULL, NULL),
                                                                             ('eliyassa', 'Eliyas321', 'student', 'SABEER SHAIKH ELIYAS', '8th', NULL, NULL),
                                                                             ('jogdandtr', 'Jogdand321', 'student', 'TRISHARAN MANOHAR JOGDAND', '8th', NULL, NULL);

                                                                                                                                                      ON CONFLICT (username) DO NOTHING;

                                                                                                                                                      INSERT INTO public.calendar_events (title, start_date, end_date, type) VALUES
                                                                                                                                                      ('School Start, Jijau Punyathiti','2025-06-16','2025-06-16','event'),
                                                                                                                                                      ('Admission Period','2025-06-16','2025-06-30','period'),
                                                                                                                                                      ('Yoga Day Celebration and Parents Teacher Meeting','2025-06-21','2025-06-21','event'),
                                                                                                                                                      ('Staff Meeting (Half Day for Students)','2025-06-30','2025-06-30','event'),
                                                                                                                                                      ('Guru Poornima Speeches, Importance of Teachers PTM','2025-07-10','2025-07-10','event'),
                                                                                                                                                      ('Essay Writing (Nagpanchami)','2025-07-19','2025-07-19','event'),
                                                                                                                                                      ('Unit Test I','2025-07-28','2025-07-30','exam'),
                                                                                                                                                      ('Fees Collection month end Meet for Teachers','2025-07-31','2025-07-31','meeting'),
                                                                                                                                                      ('Rakshabandhan Importance Speeches & Songs','2025-08-09','2025-08-09','event'),
                                                                                                                                                      ('Speech Preparation on Independence Day','2025-08-10','2025-08-14','activity'),
                                                                                                                                                      ('Independence Day','2025-08-15','2025-08-15','holiday'),
                                                                                                                                                      ('Ganesh Chaturthi Holiday for School','2025-08-26','2025-08-26','holiday'),
                                                                                                                                                      ('PTM','2025-08-27','2025-08-27','event'),
                                                                                                                                                      ('Fees Collection month end Meet for Teachers','2025-08-30','2025-08-30','meeting'),
                                                                                                                                                      ('Holiday Eid-E-Milad','2025-09-05','2025-09-05','holiday'),
                                                                                                                                                      ('Teachers Day Speeches (Self Govt. Day Students will run the school)','2025-09-06','2025-09-06','event'),
                                                                                                                                                      ('Unit Test II','2025-09-08','2025-09-11','exam'),
                                                                                                                                                      ('PTM','2025-09-20','2025-09-20','event'),
                                                                                                                                                      ('Fees Collection month end Meet for Teachers','2025-09-30','2025-09-30','meeting'),
                                                                                                                                                      ('Gandhi Jayanti Holiday','2025-10-02','2025-10-02','holiday'),
                                                                                                                                                      ('Gandhi Jayanti Speeches','2025-10-03','2025-10-03','event'),
                                                                                                                                                      ('1st Term Exam & SSC Fees collection from compliance','2025-10-06','2025-10-11','exam'),
                                                                                                                                                      ('Result Preparation','2025-10-13','2025-10-15','work'),
                                                                                                                                                      ('Diwali Homework','2025-10-16','2025-10-18','activity'),
                                                                                                                                                      ('Diwali Holiday','2025-10-16','2025-11-01','holiday'),
                                                                                                                                                      ('School resumes after vacation','2025-11-02','2025-11-02','event'),
                                                                                                                                                      ('Holiday for Gurunanak Jayanti','2025-11-03','2025-11-03','holiday'),
                                                                                                                                                      ('SSC Form Filling','2025-11-05','2025-11-05','event'),
                                                                                                                                                      ('Childrens Day','2025-11-11','2025-11-11','event'),
                                                                                                                                                      ('PTM','2025-11-14','2025-11-14','event'),
                                                                                                                                                      ('Event day','2025-11-15','2025-11-15','event'),
                                                                                                                                                      ('Unit Test III','2025-11-28','2025-11-29','exam'),
                                                                                                                                                      ('PS-Trip','2025-12-02','2025-12-02','event'),
                                                                                                                                                      ('HS Trip','2025-12-04','2025-12-04','event'),
                                                                                                                                                      ('Speech on Christmas & Santaclaus drama','2025-12-24','2025-12-24','event'),
                                                                                                                                                      ('Fees Collection month end Meet for Teachers & Goodbye To year 2025','2025-12-31','2025-12-31','event'),
                                                                                                                                                      ('New Year Celebration by dress compilation','2026-01-01','2026-01-01','event'),
                                                                                                                                                      ('Savitribai Phule Jayanti Speeches','2026-01-03','2026-01-03','event'),
                                                                                                                                                      ('Hindi Day','2026-01-10','2026-01-10','event'),
                                                                                                                                                      ('Jijai & Vivekanand Jayanti Speeches','2026-01-12','2026-01-12','event'),
                                                                                                                                                      ('Makarsankranti & Geography Day','2026-01-14','2026-01-14','event'),
                                                                                                                                                      ('Republic Day & Gathering','2026-01-26','2026-01-26','event'),
                                                                                                                                                      ('Holiday','2026-01-27','2026-01-27','holiday'),
                                                                                                                                                      ('Unit Test IV','2026-01-28','2026-01-30','exam'),
                                                                                                                                                      ('SSC Pre-annual Exam','2026-02-01','2026-02-06','exam'),
                                                                                                                                                      ('SSC Pre-annual Exam Oral','2026-02-08','2026-02-20','exam'),
                                                                                                                                                      ('Fees Collection month end Meet for Teachers','2026-02-28','2026-02-28','meeting'),
                                                                                                                                                      ('Moring School Start 7:30 to 10:30 am','2026-03-01','2026-03-07','note'),
                                                                                                                                                      ('Annual exam Preparation Completing Syllabus + Revision','2026-03-01','2026-03-31','work'),
                                                                                                                                                      ('Annual Home Exam','2026-04-06','2026-04-14','exam'),
                                                                                                                                                      ('April Summer Class For All','2026-04-14','2026-04-30','activity'),
                                                                                                                                                      ('Maharashtra Day Result Declaration','2026-05-01','2026-05-01','event'),
                                                                                                                                                      ('Summer Classes & Admission Campaign','2026-05-01','2026-05-15','campaign'),
                                                                                                                                                      ('Survey by Teachers','2026-05-01','2026-05-15','survey'),
                                                                                                                                                      ('Holiday for teachers 16 May to 30 May, 1 Jun to 14 Jun Survey Repeat','2026-05-16','2026-05-30','holiday')
                                                                                                                                                      ON CONFLICT (title, start_date) DO NOTHING;

                                                                                                                                                      INSERT INTO public.timetable (class, day, day_order, period_order, period_label, subject, teacher) VALUES
                                                                                                                                                      ('5th','Monday',1,1,'9:00-9:40 AM','English','Hajare Shubham'),
                                                                                                                                                      ('5th','Monday',1,2,'9:40-10:15 AM','Hindi','Awhad S.N.'),
                                                                                                                                                      ('5th','Monday',1,3,'10:15-10:50 AM','Maths','Hatte M.'),
                                                                                                                                                      ('5th','Monday',1,4,'10:50-11:25 AM','Science','Ujagare D.D.'),
                                                                                                                                                      ('5th','Monday',1,5,'11:45-12:20 PM','PT','Nagpure D.P.'),
                                                                                                                                                      ('5th','Monday',1,6,'12:20-1:00 PM','History','Chandane S.P.')
                                                                                                                                                      ON CONFLICT (class, day, period_order) DO NOTHING;
                                                                                                                                                  
  # old app supebase sql file 2
  
  INSERT INTO public.users (username, password, role, name, class, qualification, aadhar_card)
VALUES
-- Class 1st
('oplead', 'Ople321', 'Student', 'ADHIRAJ AMOL OPLE', '1st', NULL, NULL),
('piadaal', 'Piada321', 'Student', 'ALIM AJIJUL PIADA', '1st', NULL, NULL),
('bagwalela', 'Bagwale321', 'Student', 'LAKSHA MANOJ BAGWALE', '1st', NULL, NULL),
('chavanma', 'Chavan321', 'Student', 'MAYANK AKASH CHAVAN', '1st', NULL, NULL),
('sayyadum', 'Sayyad321', 'Student', 'UMAR KATTU SAYYAD', '1st', NULL, NULL),

-- Class 2nd
('shaikhda', 'Shaikh321', 'Student', 'DANISH VAZEER SHAIKH', '2nd', NULL, NULL),
('popalghatdh', 'Popalghat321', 'Student', 'DHRUV SHRIKANT POPALGHAT', '2nd', NULL, NULL),
('khanha', 'Khan321', 'Student', 'HABIB KHAN HAIDAR KHAN', '2nd', NULL, NULL),
('yadavja', 'Yadav321', 'Student', 'JANHVI RAJESH YADAV', '2nd', NULL, NULL),
('santoliyara', 'Santoliya321', 'Student', 'RAJ ROHITASH SANTOLIYA', '2nd', NULL, NULL),
('santoliyara2', 'Santoliya321', 'Student', 'RAJ SANTOLIYA', '2nd', NULL, NULL),

-- Class 3rd
('aryaan', 'Arya321', 'Student', 'ANUVED SATYENDRA ARYA', '3rd', NULL, NULL),
('sayyadfa', 'Sayyad321', 'Student', 'FAIZ YUNUS SAYYAD', '3rd', NULL, NULL),
('shaikhmo', 'Shaikh321', 'Student', 'MOHAMMADSAAD ZUBER SHAIKH', '3rd', NULL, NULL),
('awadna', 'Awad321', 'Student', 'NARSIMHA NITIN AWAD', '3rd', NULL, NULL),
('balwantra', 'Balwant321', 'Student', 'RAJVEER ANKUSH BALWANT', '3rd', NULL, NULL),
('ahemadsa', 'Ahemad321', 'Student', 'SAYYED ABDUL RAHEEM AHEMAD', '3rd', NULL, NULL),

-- Class 4th
('pathanja', 'Pathan321', 'Student', 'JAVERIYA AMJAD PATHAN', '4th', NULL, NULL),
('shaikhmo2', 'Shaikh321', 'Student', 'MOHAMMAD RAHIMODDIN SHAIKH', '4th', NULL, NULL),
('pradipsh', 'Pradip321', 'Student', 'SHAIKH GAUS PRADIP', '4th', NULL, NULL),

-- Class 5th
('devkaran', 'Devkar321', 'Student', 'ANUSH BALAJI DEVKAR', '5th', NULL, NULL),
('palwadear', 'Palwade321', 'Student', 'ARADHYA KHANDERAO PALWADE', '5th', NULL, NULL),
('shaikhar', 'Shaikh321', 'Student', 'ARHAN MOHAMMAD FAYAZODDIN SHAIKH', '5th', NULL, NULL),
('khanga', 'Khan321', 'Student', 'GAUS HAYAT KHAN', '5th', NULL, NULL),
('shaikhhu', 'Shaikh321', 'Student', 'HUMERA SAMEER SHAIKH', '5th', NULL, NULL),
('shaikhja', 'Shaikh321', 'Student', 'JAVVAD SAMAD SHAIKH', '5th', NULL, NULL),
('khansa', 'Khan321', 'Student', 'SAADKHAN SAJED KHAN', '5th', NULL, NULL),

-- Class 6th
('shaikhar2', 'Shaikh321', 'Student', 'ARFAT LLLIYAS SHAIKH', '6th', NULL, NULL),
('mundliksa', 'Mundlik321', 'Student', 'SAMARTH EKNATH MUNDLIK', '6th', NULL, NULL),

-- Class 7th
('qureshiaf', 'Qureshi321', 'Student', 'AFIFA ABDULLA QURESHI', '7th', NULL, NULL),
('shaikhaz', 'Shaikh321', 'Student', 'AZHAN SAMEER SHAIKH', '7th', NULL, NULL),
('waghmaresu', 'Waghmare321', 'Student', 'SUSHANT SUDHIR WAGHMARE', '7th', NULL, NULL),
('waghmareya', 'Waghmare321', 'Student', 'YASH VILAS WAGHMARE', '7th', NULL, NULL),

-- Class 8th
('shaikhay', 'Shaikh321', 'Student', 'AYYAZ LLIYAS SHAIKH', '8th', NULL, NULL),
('phadka', 'Phad321', 'Student', 'KARAN VISHNU PHAD', '8th', NULL, NULL),
('gayakwadpr', 'Gayakwad321', 'Student', 'PRALHAD DASHRATH GAYAKWAD', '8th', NULL, NULL),
('eliyassa', 'Eliyas321', 'Student', 'SABEER SHAIKH ELIYAS', '8th', NULL, NULL),
('jogdandtr', 'Jogdand321', 'Student', 'TRISHARAN MANOHAR JOGDAND', '8th', NULL, NULL);



# old app supebase sql file 3

INSERT INTO "public"."timetable" (
      "id", "class", "day", "day_order", "period_order", "period_label", "subject", "teacher", "created_at"
      )
      SELECT 
          gen_random_uuid(),       -- नई ID जनरेट होगी
              t."class",
                  d.new_day,               -- नया दिन
                      t."day_order",
                          t."period_order",
                              t."period_label",
                                  t."subject",
                                      t."teacher",
                                          NOW()
                                          FROM "public"."timetable" t
                                          CROSS JOIN (
                                              VALUES 
                                                    ('Tuesday'), 
                                                          ('Wednesday'), 
                                                                ('Thursday'), 
                                                                      ('Friday'), 
                                                                            ('Saturday')
                                                                            ) AS d(new_day)
                                                                            WHERE t."day" = 'Monday'
                                                                            ON CONFLICT ON CONSTRAINT "unique_timetable_slot" DO NOTHING;
                                                                            
)