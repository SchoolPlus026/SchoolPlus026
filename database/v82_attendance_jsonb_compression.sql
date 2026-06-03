-- ═══════════════════════════════════════════════════════════════════════════
-- v82_attendance_jsonb_compression.sql
-- Optimization Step 2: Attendance JSONB Monthly Rollup Compression
--
-- WHY THIS MIGRATION EXISTS:
--   The `attendance` table stores monthly JSONB attendance records in the format:
--     { "2026-05-01": "Present", "2026-05-02": "Absent", ... }
--   This is highly redundant. The parent row already has a `month_year` column
--   (e.g., "2026-05") so storing the full "YYYY-MM" prefix in every JSONB key
--   is wasted storage. Similarly, full status words like "Present", "Absent",
--   "Late", "Half_day", "Leave" can each be replaced with single characters.
--
--   Unoptimized:  {"2026-05-30": "Present", "2026-05-31": "Absent"}  — 49 chars
--   Compressed:   {"30": "P", "31": "A"}                             — 21 chars
--   Savings: ~57% per JSONB entry. At scale (20 schools × 1000 students × 10 months),
--   this reclaims approximately 30–35 MB of the 500 MB free tier.
--
-- COMPRESSION CODEC:
--   Keys:   "YYYY-MM-DD" → strip month prefix → use day integer as string
--           "2026-05-01" → "1"   (leading zeros removed for maximum compression)
--           "2026-05-31" → "31"
--   Values: "Present"  → "P"
--           "Absent"   → "A"
--           "Late"     → "L"
--           "Half_day" → "H"
--           "Leave"    → "V"  (V = Vacation, avoids conflict with "L" for Late)
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates a helper function `compress_historical_attendance()`.
--   2. Runs the function to convert ALL existing rows in-place.
--   3. Drops the function after use (no permanent footprint).
--
-- SAFETY GUARANTEES:
--   ✅ Zero Data Loss: Only reformats values — nothing is deleted.
--   ✅ Idempotent: If a key is already compressed (e.g., "30": "P"), the
--      function detects it and passes it through unchanged.
--   ✅ No Schema Changes: Same table, same columns — only JSONB content changes.
--   ✅ Rollback Path: The original values are decodable — the codec is reversible.
--
-- FRONTEND NOTE:
--   After running this migration, ALL frontend files that read `attendance_data`
--   MUST be updated to use the decode/encode helpers. See:
--   - src/features/attendance/MarkAttendance.jsx
--   - src/features/attendance/StudentAttendanceChart.jsx
--   - src/features/attendance/TeacherAttendanceView.jsx
--   - src/features/attendance/PendingAttendanceWidget.jsx
--   - src/features/off-classes/OffClasses.jsx
--   The frontend changes are in the same commit as this migration.
--
-- HOW TO RUN:
--   Paste entire file into Supabase Dashboard → SQL Editor → Run.
--
-- WRITTEN: 2026-06-01
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create the compression helper function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compress_historical_attendance()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r           RECORD;
  compressed  JSONB;
  k           TEXT;
  v           TEXT;
  day_key     TEXT;
  comp_val    TEXT;
BEGIN
  RAISE NOTICE 'Starting attendance JSONB compression migration...';

  FOR r IN SELECT id, attendance_data FROM public.attendance LOOP

    compressed := '{}'::jsonb;

    FOR k, v IN SELECT * FROM jsonb_each_text(r.attendance_data) LOOP

      -- ── Key compression ──────────────────────────────────────────────────
      -- Keys arrive in two possible formats:
      --   A) Full date string:  "2026-05-01" (10 chars, YYYY-MM-DD pattern)
      --   B) Already compressed: "1", "31" etc. (1–2 digit day string)
      --
      -- We detect format A by checking the LIKE pattern '____-__-__'.
      -- If already compressed, we pass the key through unchanged.

      IF k LIKE '____-__-__' THEN
        -- Extract the day portion and cast to integer to strip leading zeros.
        -- e.g. "2026-05-01" → split on '-', take part 3 = "01" → int "1" → text "1"
        day_key := split_part(k, '-', 3)::integer::text;
      ELSE
        -- Already compressed, pass through
        day_key := k;
      END IF;

      -- ── Value compression ─────────────────────────────────────────────────
      -- Map full status words to single-character codes.
      -- Already-compressed single chars pass through via the ELSE clause.

      CASE v
        WHEN 'Present'  THEN comp_val := 'P';
        WHEN 'Absent'   THEN comp_val := 'A';
        WHEN 'Late'     THEN comp_val := 'L';
        WHEN 'Half_day' THEN comp_val := 'H';
        WHEN 'Leave'    THEN comp_val := 'V';
        ELSE comp_val := v;  -- Pass through if already 'P','A','L','H','V' or unknown
      END CASE;

      compressed := compressed || jsonb_build_object(day_key, comp_val);

    END LOOP;

    -- Only update the row if the compressed data actually differs
    -- (avoids unnecessary write amplification on already-compressed rows)
    IF compressed IS DISTINCT FROM r.attendance_data THEN
      UPDATE public.attendance
      SET attendance_data = compressed,
          updated_at      = NOW()
      WHERE id = r.id;
    END IF;

  END LOOP;

  RAISE NOTICE 'Attendance JSONB compression completed successfully.';
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Execute the compression on all existing rows
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.compress_historical_attendance();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Drop the one-time helper function (keeps schema clean)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.compress_historical_attendance();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Verification Query
-- Run this SELECT after execution to confirm the format has changed.
-- Expected result: keys like "1", "30" and values like "P", "A" instead of
-- "2026-05-01" / "Present".
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  user_id,
  month_year,
  attendance_data
FROM public.attendance
LIMIT 5;
