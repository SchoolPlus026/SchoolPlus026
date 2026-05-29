-- MULTI-TENANT SAAS SCHEMA - MASTER SCRIPT

-- ==========================================
-- 1. TABLES SETUP
-- ==========================================

-- School Settings Table (Tenant Master)
CREATE TABLE public.school_settings (
    school_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    logo_url text,
    subscription_status text DEFAULT 'Trial' CHECK (subscription_status IN ('Trial', 'Paid', 'Expired')),
    created_at timestamp with time zone DEFAULT now()
);

-- Users Table (Extends Supabase Auth)
CREATE TABLE public.users (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    role text CHECK (role IN ('admin', 'teacher', 'student', 'app_manager')),
    username text UNIQUE NOT NULL,
    name text NOT NULL,
    class text, -- For students or allocated class for teachers
    contact text,
    qualification text,
    aadhar_card text,
    avatar_url text, -- Google Drive CDN thumbnail URL for user profile picture
    avatar_file_id text, -- Google Drive File ID for cleanup
    created_at timestamp with time zone DEFAULT now()
);

-- Attendance Table
CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    date date NOT NULL,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    role text, -- Denormalized for quick querying efficiency
    status text CHECK (status IN ('Present', 'Absent', 'Late', 'Half_day', 'Leave')),
    marked_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- Fees Table
CREATE TABLE public.fees (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    student_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    year integer NOT NULL,
    total numeric DEFAULT 0,
    last_year_pending numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- Fees Payments Table
CREATE TABLE public.fees_payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    fee_id uuid REFERENCES public.fees(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    method text CHECK (method IN ('Cash', 'Online', 'Cheque', 'UPI')),
    transaction_id text,
    payment_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Timetable Table
CREATE TABLE public.timetable (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    day text NOT NULL,
    period_order integer NOT NULL,
    period_label text,
    subject text,
    class text,
    teacher text,
    created_at timestamp with time zone DEFAULT now()
);

-- Notices/Events Table
CREATE TABLE public.notices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title text NOT NULL,
    content text NOT NULL,
    date date NOT NULL,
    scope text CHECK (scope IN ('all', 'students', 'teachers')),
    photo_url text,
    created_at timestamp with time zone DEFAULT now()
);

-- Leaves Table
CREATE TABLE public.leaves (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    role text,
    from_date date NOT NULL,
    to_date date NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamp with time zone DEFAULT now()
);

-- Calendar Events Table
CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    start_date date NOT NULL,
    end_date date,
    type text CHECK (type IN ('holiday', 'exam', 'event')),
    created_at timestamp with time zone DEFAULT now()
);

-- Gallery Table
CREATE TABLE public.gallery (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    title text NOT NULL,
    link text NOT NULL,
    category text,
    created_at timestamp with time zone DEFAULT now()
);

-- ==========================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ==========================================
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. STRICT MULTI-TENANCY RLS POLICIES
-- ==========================================
-- Requirement: Your JWT claims MUST contain app_metadata or user_metadata with the school_id!

-- School Settings: You can only SELECT your own school settings
CREATE POLICY "Tenant isolation for school_settings (Select)" ON public.school_settings FOR SELECT 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

-- Users: Admins can do all across their tenant, others can only Select across their tenant
CREATE POLICY "Tenant isolation for users (Select)" ON public.users FOR SELECT 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for users (Modify)" ON public.users FOR ALL 
USING (
  school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid AND 
  ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' OR id = auth.uid())
);

-- Helper to quickly apply the same generic policy to standard operations tables
CREATE POLICY "Tenant isolation for attendance" ON public.attendance FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for fees" ON public.fees FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for fees_payments" ON public.fees_payments FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for timetable" ON public.timetable FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for notices" ON public.notices FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for leaves" ON public.leaves FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for calendar_events" ON public.calendar_events FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);

CREATE POLICY "Tenant isolation for gallery" ON public.gallery FOR ALL 
USING (school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid);
