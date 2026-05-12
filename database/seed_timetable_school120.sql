-- ============================================================
-- Dummy Timetable — School Code 120 | Classes 1 to 10
-- Teachers: Actual list from school roster (uses UUIDs)
-- Periods: 6/day | Days: Mon–Fri | Total rows: 300
-- ============================================================
DO $$
DECLARE
  v_school_id uuid;
  v_days text[]    := ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'];
  v_day  text;
  d      int;
  p      int;
  v_teacher_name text;
  v_teacher_uuid text;
  -- class_data: class_name | sub1..6 | teacher1..6
  type_row RECORD;
BEGIN
  -- Use exact school_id provided by user
  v_school_id := 'eb2bec0c-475f-4840-8671-f628e8bf8580';
  DELETE FROM public.timetable WHERE school_id = v_school_id;

  FOR type_row IN (
    SELECT * FROM (VALUES
      -- class,  s1,            t1,                s2,              t2,                s3,            t3,              s4,             t4,               s5,              t5,               s6,            t6
      ('1st',  'English',      'Paddwaina S.G.',   'Hindi',         'Meharkar M.V.',   'Mathematics', 'Kasabe S.M.',   'EVS',          'Shakuntala Awad','Drawing',       'Radhika Lokhande','PT',          'Nagpure D.P.'),
      ('2nd',  'English',      'Paddwaina S.G.',   'Hindi',         'Meharkar M.V.',   'Mathematics', 'Kasabe S.M.',   'EVS',          'Shakuntala Awad','Drawing',       'Radhika Lokhande','PT',          'Nagpure D.P.'),
      ('3rd',  'English',      'Paddwaina S.G.',   'Hindi',         'Meharkar M.V.',   'Mathematics', 'Kasabe S.M.',   'EVS',          'Hatte M.',       'Marathi',       'Shakuntala Awad', 'PT',          'Nagpure D.P.'),
      ('4th',  'English',      'Paddwaina S.G.',   'Hindi',         'Meharkar M.V.',   'Mathematics', 'Kasabe S.M.',   'EVS',          'Hatte M.',       'Marathi',       'Shakuntala Awad', 'PT',          'Nagpure D.P.'),
      ('5th',  'English',      'Chandane S.P.',    'Hindi',         'Radhika Lokhande','Mathematics', 'Atade R.A.',    'Science',      'Hatte M.',       'Social Studies','Awhad S.N.',      'Marathi',     'Shaikh Naseem'),
      ('6th',  'English',      'Chandane S.P.',    'Hindi',         'Radhika Lokhande','Mathematics', 'Atade R.A.',    'Science',      'Hatte M.',       'Social Studies','Awhad S.N.',      'Marathi',     'Shaikh Naseem'),
      ('7th',  'English',      'Jagyatkar B.N.',   'Hindi',         'Chandane S.P.',   'Mathematics', 'Hajare Shubham','Science',      'Atade R.A.',     'History',       'Awhad S.N.',      'Geography',   'Swarupa Peddavana'),
      ('8th',  'English',      'Jagyatkar B.N.',   'Hindi',         'Chandane S.P.',   'Mathematics', 'Hajare Shubham','Physics',      'Ujagare D.D.',   'Chemistry',     'Atade R.A.',      'Biology',     'Hatte M.'),
      ('9th',  'English',      'Jagyatkar B.N.',   'Hindi',         'Chandane S.P.',   'Mathematics', 'Hajare Shubham','Physics',      'Ujagare D.D.',   'Chemistry',     'Atade R.A.',      'Biology',     'Hatte M.'),
      ('10th', 'English',      'Paddwaina S.G.',   'Hindi',         'Chandane S.P.',   'Mathematics', 'Ujagare D.D.',  'Physics',      'Hajare Shubham', 'Chemistry',     'Atade R.A.',      'Biology',     'Hatte M.')
    ) AS t(cls,s1,t1,s2,t2,s3,t3,s4,t4,s5,t5,s6,t6)
  ) LOOP
    FOR d IN 1..5 LOOP
      v_day := v_days[d];
      FOR p IN 1..6 LOOP
        
        -- Determine teacher name for this period
        v_teacher_name := CASE ((p + d - 2) % 6)
            WHEN 0 THEN type_row.t1
            WHEN 1 THEN type_row.t2
            WHEN 2 THEN type_row.t3
            WHEN 3 THEN type_row.t4
            WHEN 4 THEN type_row.t5
            ELSE        type_row.t6
        END;

        -- Resolve UUID from users table
        SELECT id::text INTO v_teacher_uuid 
        FROM public.users 
        WHERE name = v_teacher_name 
          AND role = 'teacher' 
          AND school_id = v_school_id 
        LIMIT 1;

        -- Fallback to name if not found (though it should be)
        IF v_teacher_uuid IS NULL THEN
          v_teacher_uuid := v_teacher_name;
        END IF;

        INSERT INTO public.timetable(school_id,day,period_order,period_label,subject,class,teacher)
        VALUES (
          v_school_id,
          v_day,
          p,
          'Period ' || p,
          CASE ((p + d - 2) % 6)
            WHEN 0 THEN type_row.s1
            WHEN 1 THEN type_row.s2
            WHEN 2 THEN type_row.s3
            WHEN 3 THEN type_row.s4
            WHEN 4 THEN type_row.s5
            ELSE        type_row.s6
          END,
          type_row.cls,
          v_teacher_uuid
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Done: 300 timetable rows seeded with UUIDs for school_code 120 (school_id: %)', v_school_id;
END;
$$;
