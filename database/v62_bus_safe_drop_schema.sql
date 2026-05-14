-- =============================================================================
-- v62_bus_safe_drop_schema.sql
-- Bus Safe Drop — Live Tracking System: Database Schema
-- =============================================================================
-- This migration creates the static assignment table that powers the
-- "App as Bridge" architecture. The Driver's app reads from this table
-- on login to know: "I am driving Bus 4 for School_101."
-- Live location data goes to Firebase RTDB, NOT Supabase.
-- =============================================================================

-- ─── 1. bus_assignments table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bus_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
  bus_number    TEXT NOT NULL,               -- e.g. "4", "Bus-A", "Route 7"
  driver_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  driver_name   TEXT,                        -- Denormalized for quick Firebase payload
  route_name    TEXT,                        -- e.g. "Morning Route — Ramdaspeth"
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate bus numbers within the same school
  UNIQUE (school_id, bus_number)
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_bus_assignments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bus_assignments_updated_at ON public.bus_assignments;
CREATE TRIGGER trg_bus_assignments_updated_at
  BEFORE UPDATE ON public.bus_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_bus_assignments_updated_at();

-- ─── 2. Indexes for fast lookups ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bus_assignments_school_id ON public.bus_assignments(school_id);
CREATE INDEX IF NOT EXISTS idx_bus_assignments_driver_id ON public.bus_assignments(driver_id);

-- ─── 3. Enable RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.bus_assignments ENABLE ROW LEVEL SECURITY;

-- ─── 4. RLS Policies ─────────────────────────────────────────────────────────

-- Admin: Full CRUD on their own school's bus assignments
CREATE POLICY "Bus Assignments: Admin Full Access"
  ON public.bus_assignments
  FOR ALL
  USING (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Driver: Can only READ their own assignment (to get bus_number context on login)
CREATE POLICY "Bus Assignments: Driver Read Own"
  ON public.bus_assignments
  FOR SELECT
  USING (
    driver_id = auth.uid()
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'driver'
  );

-- Teacher / Staff: Can READ all bus assignments for their school (to show parent the bus list)
CREATE POLICY "Bus Assignments: Teacher/Staff Read School"
  ON public.bus_assignments
  FOR SELECT
  USING (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('teacher', 'staff', 'student')
  );

-- ─── 5. Reload PostgREST schema cache ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- IMPORTANT: After running this migration, you must also:
--   1. Add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
--      VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID,
--      VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
--      VITE_FIREBASE_APP_ID to your .env and GitHub Actions Secrets.
--   2. Set FIREBASE_RTDB_URL in Firebase Console → Realtime Database.
--   3. Deploy Firebase Security Rules (see database/firebase_rtdb_rules.json).
-- =============================================================================
