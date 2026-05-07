-- ============================================================
-- MIGRATION: v45_phase3_school_registrations.sql
-- Description:
--   1. Create public school_registrations table
--   2. RLS: anon can INSERT (self-register), platform_admin can SELECT/UPDATE
--   3. Index for status-based filtering in the PA inbox
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.school_registrations (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- School info
  school_name        text NOT NULL,
  school_code        text NOT NULL,
  city               text,
  state              text,
  board              text,                              -- e.g. CBSE, ICSE, State
  school_type        text DEFAULT 'private',            -- private | government | aided
  student_strength   integer,                          -- approx number of students

  -- Admin contact
  admin_name         text NOT NULL,
  admin_email        text NOT NULL,
  admin_phone        text,
  admin_username     text NOT NULL,

  -- Plan preference
  plan_type          text NOT NULL DEFAULT 'trial',    -- trial | free | premium

  -- Status tracking
  status             text NOT NULL DEFAULT 'pending'   -- pending | approved | rejected
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason   text,
  reviewed_at        timestamptz,
  reviewed_by        uuid REFERENCES public.users(id),

  -- Legal
  terms_accepted     boolean NOT NULL DEFAULT false,

  -- Timestamps
  created_at         timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.school_registrations ENABLE ROW LEVEL SECURITY;

-- 3. Anonymous users can submit a registration (INSERT only, no SELECT)
CREATE POLICY "Anyone can submit a school registration"
  ON public.school_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (terms_accepted = true);

-- 4. Platform admin can read and manage ALL registrations
CREATE POLICY "Platform admin manages registrations"
  ON public.school_registrations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- 5. Prevent spam: one pending registration per school_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_registrations_code_pending
  ON public.school_registrations (LOWER(school_code))
  WHERE status = 'pending';

-- 6. Index for the PA inbox query (order by newest pending)
CREATE INDEX IF NOT EXISTS idx_school_registrations_status
  ON public.school_registrations (status, created_at DESC);

COMMENT ON TABLE public.school_registrations IS 
  'Self-service school registration requests. Platform Admin reviews and approves to provision the tenant.';
