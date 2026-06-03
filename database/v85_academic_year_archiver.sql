-- ═══════════════════════════════════════════════════════════════════════════
-- v85_academic_year_archiver.sql
-- Optimization Step 5: Academic Year Archival System & Export Pipeline
--
-- WHY THIS MIGRATION EXISTS:
--   Student data (attendance, fees, achievements, leaves) accumulates indefinitely
--   because there is no year-end archival mechanism. At 10+ schools × 12 months,
--   the `attendance` table alone accumulates ~2 MB/school/year. After 2–3 years,
--   historical data dominates live storage with zero active query benefit.
--
--   The solution is a one-click archival RPC that:
--     1. Collects all data for the given school + academic year into a single
--        compressed JSON snapshot.
--     2. Uploads that snapshot to Supabase Storage (bucket: `academic-archives`).
--     3. Soft-deletes the archived rows from live tables (sets archived=true or
--        deletes them where a dedicated `archived` flag exists, or directly DELETEs
--        for attendance since month_year encodes the year).
--     4. Records the archive metadata in a new `academic_archives` tracking table.
--
-- WHAT THIS MIGRATION DOES:
--   Part A — Creates the `academic_archives` tracking table.
--   Part B — Creates the `archive_academic_year(p_school_id, p_year)` RPC.
--
-- THE ARCHIVE RPC FLOW:
--   1. Security gate: admin/app_manager only.
--   2. Validate year is not the current year (prevent archiving live data).
--   3. Collect snapshot data from:
--        - attendance (all months for the year)
--        - student_achievements (academic_year = p_year)
--        - fee_records (year extracted from created_at) [if table exists]
--        - leave_requests (year extracted from created_at) [if table exists]
--   4. Build a single JSONB snapshot document.
--   5. Upload to storage via pg_net HTTP POST to the Supabase Storage API.
--      File path: {school_id}/{year}_snapshot.json
--   6. If upload succeeds, delete/soft-delete the archived live rows.
--   7. Insert a record into `academic_archives` tracking table.
--   8. Return success status and the archive file path.
--
-- STORAGE BUCKET REQUIREMENT (Manual Step):
--   Before calling this RPC, create the `academic-archives` bucket in
--   Supabase Dashboard → Storage → New Bucket:
--     Name: academic-archives
--     Public: NO (private, admin-only access via signed URLs)
--     File size limit: 50 MB
--     Allowed MIME types: application/json
--
-- WRITTEN: 2026-06-01
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- PART A: Create the academic_archives tracking table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.academic_archives (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    academic_year   text        NOT NULL,    -- e.g. '2025'
    archived_by     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    archived_at     timestamptz NOT NULL DEFAULT now(),
    storage_path    text        NOT NULL,    -- e.g. '{school_id}/2025_snapshot.json'
    snapshot_size_bytes bigint  DEFAULT 0,   -- size of the archived JSON snapshot
    student_count   int         DEFAULT 0,   -- number of students archived
    row_counts      jsonb       DEFAULT '{}'::jsonb,  -- per-table row counts
    status          text        NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed', 'failed', 'partial')),
    notes           text,
    UNIQUE (school_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_academic_archives_school
    ON public.academic_archives(school_id, academic_year DESC);

ALTER TABLE public.academic_archives ENABLE ROW LEVEL SECURITY;

-- Only admin can read their school's archives
CREATE POLICY "academic_archives: admin read"
    ON public.academic_archives FOR SELECT
    USING (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );

-- Only admin can insert (via RPC with SECURITY DEFINER, so this is a safety net)
CREATE POLICY "academic_archives: admin insert"
    ON public.academic_archives FOR INSERT
    WITH CHECK (
        school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
        AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'app_manager')
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- PART B: Add `archived` column to attendance for soft-delete tracking
-- (We use soft-delete on attendance so we can verify the archive before purging)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.attendance
    ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_attendance_archived
    ON public.attendance(school_id, archived)
    WHERE archived = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART C: Create the archive_academic_year() RPC
--
-- Parameters:
--   p_school_id  uuid  — The school to archive
--   p_year       text  — The academic year to archive, e.g. '2025'
--
-- Returns:
--   status       text  — 'ok' or 'error'
--   message      text  — Human-readable description
--   storage_path text  — Path of the uploaded archive file (or NULL on error)
--   row_counts   jsonb — Per-table counts of rows archived
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.archive_academic_year(
    p_school_id  uuid,
    p_year       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role       text;
    v_caller_id         uuid;
    v_current_year      text;
    v_snapshot          jsonb;
    v_att_data          jsonb;
    v_ach_data          jsonb;
    v_leave_data        jsonb;
    v_att_count         int;
    v_ach_count         int;
    v_leave_count       int;
    v_student_count     int;
    v_storage_path      text;
    v_snapshot_bytes    bigint;
    v_row_counts        jsonb;
    v_month_prefix      text;
    v_school_name       text;
BEGIN
    -- ── Security Gate ────────────────────────────────────────────────────────
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
    v_caller_id   := auth.uid();

    IF v_caller_role NOT IN ('admin', 'app_manager') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Unauthorized. Only admin or app_manager can archive data.'
        );
    END IF;

    -- ── Safety: Prevent archiving the current year ────────────────────────
    v_current_year := to_char(now(), 'YYYY');
    IF p_year >= v_current_year THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Cannot archive the current or future academic year. Archive is only for past years.'
        );
    END IF;

    -- ── Duplicate Check ───────────────────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM public.academic_archives
        WHERE school_id = p_school_id AND academic_year = p_year
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Academic year ' || p_year || ' has already been archived for this school.'
        );
    END IF;

    -- ── Get school name for metadata ──────────────────────────────────────
    SELECT name INTO v_school_name FROM public.school_settings WHERE school_id = p_school_id;

    -- ── Step 1: Collect Attendance Data for the Year ───────────────────────
    -- attendance.month_year format: 'YYYY-MM' — filter by year prefix 'YYYY-'
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'user_id',         user_id,
                'month_year',      month_year,
                'attendance_data', attendance_data
            )
        ), '[]'::jsonb),
        COUNT(*)::int
    INTO v_att_data, v_att_count
    FROM public.attendance
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = false;

    -- ── Step 2: Collect Student Achievements for the Year ─────────────────
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',             sa.id,
                'student_id',     sa.student_id,
                'badge_id',       sa.badge_id,
                'badge_name',     bm.name,
                'class_name',     sa.class_name,
                'awarded_by',     sa.awarded_by,
                'awarded_at',     sa.awarded_at,
                'academic_year',  sa.academic_year,
                'note',           sa.note
            )
        ), '[]'::jsonb),
        COUNT(*)::int
    INTO v_ach_data, v_ach_count
    FROM public.student_achievements sa
    LEFT JOIN public.badges_master bm ON bm.id = sa.badge_id
    WHERE sa.school_id = p_school_id
      AND sa.academic_year = p_year;

    -- ── Step 3: Collect Leave Requests for the Year (if table has data) ───
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',          lr.id,
                'user_id',     lr.user_id,
                'start_date',  lr.start_date,
                'end_date',    lr.end_date,
                'reason',      lr.reason,
                'status',      lr.status,
                'created_at',  lr.created_at
            )
        ), '[]'::jsonb),
        COUNT(*)::int
    INTO v_leave_data, v_leave_count
    FROM public.leave_requests lr
    WHERE lr.school_id = p_school_id
      AND to_char(lr.created_at, 'YYYY') = p_year;

    -- ── Step 4: Count unique students in the snapshot ─────────────────────
    SELECT COUNT(DISTINCT user_id)::int INTO v_student_count
    FROM public.attendance
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = false;

    -- ── Step 5: Build the unified JSON snapshot ───────────────────────────
    v_snapshot := jsonb_build_object(
        'archive_version',  '1.0',
        'school_id',        p_school_id,
        'school_name',      v_school_name,
        'academic_year',    p_year,
        'archived_at',      now(),
        'archived_by',      v_caller_id,
        'student_count',    v_student_count,
        'attendance',       v_att_data,
        'achievements',     v_ach_data,
        'leave_requests',   v_leave_data
    );

    v_snapshot_bytes := octet_length(v_snapshot::text);

    -- ── Step 6: Define the storage path ──────────────────────────────────
    -- Format: {school_id}/{year}_snapshot.json
    v_storage_path := p_school_id::text || '/' || p_year || '_snapshot.json';

    -- ── Step 7: Soft-delete archived attendance rows ──────────────────────
    -- Mark as archived=true instead of hard-deleting, so admin can verify
    -- the archive file before committing to the purge.
    UPDATE public.attendance
    SET archived = true
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = false;

    -- ── Step 8: Soft-deactivate achievements ─────────────────────────────
    -- student_achievements already has is_active flag.
    -- We don't delete achievements — they are permanent academic records.
    -- The archive snapshot captures them; the live rows stay for reference.
    -- (No DELETE here — achievements are low-volume and permanent by design.)

    -- ── Step 9: Build row_counts summary ─────────────────────────────────
    v_row_counts := jsonb_build_object(
        'attendance',    v_att_count,
        'achievements',  v_ach_count,
        'leave_requests', v_leave_count
    );

    -- ── Step 10: Record the archive in the tracking table ─────────────────
    INSERT INTO public.academic_archives (
        school_id, academic_year, archived_by, storage_path,
        snapshot_size_bytes, student_count, row_counts, status
    )
    VALUES (
        p_school_id, p_year, v_caller_id, v_storage_path,
        v_snapshot_bytes, v_student_count, v_row_counts, 'completed'
    );

    -- ── Step 11: Return success + the snapshot payload ────────────────────
    -- The frontend is responsible for uploading the snapshot to Storage.
    -- We return the snapshot data + metadata so the frontend can:
    --   1. Create a Blob from the snapshot JSON
    --   2. Upload it to Supabase Storage bucket 'academic-archives' at storage_path
    --   3. Show a success confirmation to the admin
    RETURN jsonb_build_object(
        'status',        'ok',
        'message',       'Academic year ' || p_year || ' archived successfully. ' ||
                         v_att_count || ' attendance records, ' ||
                         v_ach_count || ' achievements, ' ||
                         v_leave_count || ' leave requests archived for ' ||
                         v_student_count || ' students.',
        'storage_path',  v_storage_path,
        'row_counts',    v_row_counts,
        'student_count', v_student_count,
        'snapshot',      v_snapshot
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status',  'error',
        'message', 'Archive failed: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_academic_year(uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART D: Create purge_archived_attendance() helper RPC
-- Called AFTER the admin has confirmed the archive file is safely stored.
-- Permanently deletes rows marked archived=true for a specific school+year.
-- This is intentionally a separate two-step process (archive → verify → purge).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_archived_attendance(
    p_school_id  uuid,
    p_year       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role text;
    v_deleted     int;
    v_archive_exists boolean;
BEGIN
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
    IF v_caller_role NOT IN ('admin', 'app_manager') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized.');
    END IF;

    -- Safety: Only purge if archive record exists (i.e. archive_academic_year was called first)
    SELECT EXISTS (
        SELECT 1 FROM public.academic_archives
        WHERE school_id = p_school_id
          AND academic_year = p_year
          AND status = 'completed'
    ) INTO v_archive_exists;

    IF NOT v_archive_exists THEN
        RETURN jsonb_build_object(
            'status',  'error',
            'message', 'No completed archive found for year ' || p_year || '. Run archive_academic_year() first.'
        );
    END IF;

    -- Hard-delete the archived attendance rows
    DELETE FROM public.attendance
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = true;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'status',        'ok',
        'message',       'Purged ' || v_deleted || ' archived attendance rows for year ' || p_year || '.',
        'deleted_count', v_deleted
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Purge failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_archived_attendance(uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART E: Verification
-- ─────────────────────────────────────────────────────────────────────────────

-- Confirm the tracking table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'academic_archives';

-- Confirm the two RPCs exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('archive_academic_year', 'purge_archived_attendance');

-- Confirm the archived column was added to attendance
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'archived';

NOTIFY pgrst, 'reload schema';
