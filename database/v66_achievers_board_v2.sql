-- ==============================================================================
-- V66: Achievers Board v2 — Schema Amendments
-- Adds: pinned_badges to badge_visibility_cache
--       teacher-scoped custom badges in badges_master
--       mega_star rollover RPC
--       updated RLS for teacher badge create
-- ==============================================================================

-- ── 1. badge_visibility_cache: Add pinned_badges column ──────────────────────
-- Stores exactly 2 badge objects that the student wants shown inline next to
-- their name. NULL = no pin (falls back to auto-display logic).
-- e.g. [{"icon_key":"trophy","icon_color":"#F59E0B","badge_name":"School Topper"}]
ALTER TABLE public.badge_visibility_cache
  ADD COLUMN IF NOT EXISTS pinned_badges jsonb DEFAULT NULL;

-- Student can update their own cache row (only pinned_badges column)
-- We enforce this via a SECURITY DEFINER RPC instead of direct RLS UPDATE.

-- ── 2. badges_master: Teacher custom badge support ───────────────────────────
-- custom_scope_class: if set, this badge was created by a teacher and is ONLY
-- visible within that class. NULL = school-wide badge (created by admin).
ALTER TABLE public.badges_master
  ADD COLUMN IF NOT EXISTS custom_scope_class text DEFAULT NULL;

-- Index for fast class-scoped badge lookup
CREATE INDEX IF NOT EXISTS idx_badges_master_scope_class
  ON public.badges_master(school_id, custom_scope_class)
  WHERE custom_scope_class IS NOT NULL;

-- RLS: Allow teachers to INSERT custom badges scoped to their own class
-- (Teachers can never touch school-wide badges)
CREATE POLICY "badges_master: teacher create custom"
  ON public.badges_master FOR INSERT
  WITH CHECK (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
    AND custom_scope_class = (SELECT class FROM public.users WHERE id = auth.uid())
    AND tier = 'class_star'
  );

-- RLS: Allow teachers to UPDATE/DELETE their OWN custom badges only
CREATE POLICY "badges_master: teacher manage own custom"
  ON public.badges_master FOR UPDATE
  USING (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
    AND custom_scope_class = (SELECT class FROM public.users WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "badges_master: teacher delete own custom"
  ON public.badges_master FOR DELETE
  USING (
    school_id = (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
    AND custom_scope_class = (SELECT class FROM public.users WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- ── 3. RPC: pin_student_badges ────────────────────────────────────────────────
-- Called by the student when they select which 2 badges to pin.
-- Takes an array of up to 2 achievement IDs, reads badge metadata,
-- writes to badge_visibility_cache.pinned_badges for that student.
CREATE OR REPLACE FUNCTION public.pin_student_badges(
  p_student_id   uuid,
  p_badge_ids    uuid[]   -- array of 0, 1, or 2 badges_master IDs to pin
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_school_id   uuid;
  v_pinned      jsonb;
BEGIN
  -- Security: only the student themselves can pin badges
  IF v_caller_id != p_student_id THEN
    RAISE EXCEPTION 'Unauthorized: only the student can pin their own badges.';
  END IF;

  -- Enforce max 2 badges
  IF array_length(p_badge_ids, 1) > 2 THEN
    RAISE EXCEPTION 'Maximum 2 badges can be pinned.';
  END IF;

  -- Get school_id
  SELECT school_id INTO v_school_id FROM public.users WHERE id = p_student_id;

  -- Build the pinned JSONB array from badges_master metadata
  -- Only pin badges the student has actually earned
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'badge_id',   bm.id,
      'icon_key',   bm.icon_key,
      'icon_color', bm.icon_color,
      'badge_name', bm.name,
      'tier',       bm.tier
    )
    ORDER BY array_position(p_badge_ids, bm.id)
  ), NULL)
  INTO v_pinned
  FROM public.badges_master bm
  JOIN public.student_achievements sa ON sa.badge_id = bm.id
  WHERE bm.id = ANY(p_badge_ids)
    AND sa.student_id = p_student_id
    AND sa.is_active = true;

  -- Upsert the cache row
  INSERT INTO public.badge_visibility_cache
    (student_id, school_id, pinned_badges, last_updated)
  VALUES
    (p_student_id, v_school_id, v_pinned, now())
  ON CONFLICT (student_id)
  DO UPDATE SET
    pinned_badges = EXCLUDED.pinned_badges,
    last_updated  = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.pin_student_badges(uuid, uuid[]) TO authenticated;


-- ── 4. RPC: rollover_year_end_badges ─────────────────────────────────────────
-- Called ONCE by Admin at the end of each academic year.
-- For each student with ≥1 active class_star in the closing year:
--   1. Creates / finds a school-specific "Mega Star" badge in badges_master.
--   2. Awards the Mega Star as a permanent class_star (carries forward).
--   3. Soft-deactivates all individual class_star achievements for that year.
--   4. Rebuilds the badge cache for each affected student.
-- Admin triggers this from the Admin Achievers Panel UI.
CREATE OR REPLACE FUNCTION public.rollover_year_end_badges(
  p_school_id    uuid,
  p_closing_year text   -- e.g. '2025'
)
RETURNS int   -- count of students who received a Mega Star
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role   text;
  v_mega_badge_id uuid;
  v_student       RECORD;
  v_star_count    int;
  v_idempotency   text;
  v_awarded_count int := 0;
BEGIN
  -- Security gate
  v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
  IF v_caller_role NOT IN ('admin', 'app_manager') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Step 1: Ensure the Mega Star badge exists for this school/year
  SELECT id INTO v_mega_badge_id
  FROM public.badges_master
  WHERE school_id = p_school_id
    AND name = p_closing_year || ' Attendance Champion'
    AND tier = 'class_star'
  LIMIT 1;

  IF v_mega_badge_id IS NULL THEN
    INSERT INTO public.badges_master
      (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
      (
        p_school_id,
        p_closing_year || ' Attendance Champion',
        'Awarded for earning multiple Class Stars during the ' || p_closing_year || ' academic year.',
        'sparkles', '#F59E0B', 'class_star', 'automated', auth.uid()
      )
    RETURNING id INTO v_mega_badge_id;
  END IF;

  -- Step 2: Loop students with ≥1 class_star in closing year
  FOR v_student IN
    SELECT sa.student_id, u.class, COUNT(sa.id) AS star_count
    FROM public.student_achievements sa
    JOIN public.badges_master bm ON bm.id = sa.badge_id
    JOIN public.users u ON u.id = sa.student_id
    WHERE sa.school_id = p_school_id
      AND sa.academic_year = p_closing_year
      AND sa.is_active = true
      AND bm.tier = 'class_star'
      AND bm.name != (p_closing_year || ' Attendance Champion')  -- skip existing mega stars
    GROUP BY sa.student_id, u.class
    HAVING COUNT(sa.id) >= 1
  LOOP
    v_idempotency := v_student.student_id::text || '_megastar_' || p_closing_year;

    -- Award Mega Star (idempotent)
    INSERT INTO public.student_achievements
      (school_id, student_id, badge_id, class_name, awarded_by,
       academic_year, note, idempotency_key)
    VALUES (
      p_school_id,
      v_student.student_id,
      v_mega_badge_id,
      v_student.class,
      auth.uid(),
      p_closing_year,
      'Year-end rollover: earned ' || v_student.star_count || ' Class Stars in ' || p_closing_year || '.',
      v_idempotency
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF FOUND THEN
      -- Soft-deactivate individual class stars for this student/year
      -- (Mega Star replaces them in the cache; raw records preserved for audit)
      UPDATE public.student_achievements
      SET is_active = false
      WHERE student_id = v_student.student_id
        AND school_id  = p_school_id
        AND academic_year = p_closing_year
        AND is_active = true
        AND badge_id != v_mega_badge_id
        AND badge_id IN (
          SELECT id FROM public.badges_master WHERE tier = 'class_star'
        );

      PERFORM public.rebuild_badge_cache(v_student.student_id);
      v_awarded_count := v_awarded_count + 1;
    END IF;
  END LOOP;

  RETURN v_awarded_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rollover_year_end_badges(uuid, text) TO authenticated;


-- ── 5. Updated rebuild_badge_cache to include pinned_badges read-through ─────
-- The existing rebuild_badge_cache already handles active_class_stars &
-- active_champion. This version also preserves the existing pinned_badges
-- so a cache rebuild never wipes a student's pin selection.
CREATE OR REPLACE FUNCTION public.rebuild_badge_cache(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id      uuid;
  v_class_stars    jsonb;
  v_champion       jsonb;
  v_existing_pins  jsonb;
BEGIN
  SELECT school_id INTO v_school_id FROM public.users WHERE id = p_student_id;

  -- Preserve existing pinned_badges (don't wipe on cache rebuild)
  SELECT pinned_badges INTO v_existing_pins
  FROM public.badge_visibility_cache
  WHERE student_id = p_student_id;

  -- Aggregate active Tier 1 badges (current year)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'icon_key',   bm.icon_key,
      'icon_color', bm.icon_color,
      'badge_name', bm.name,
      'badge_id',   bm.id,
      'awarded_at', sa.awarded_at
    ) ORDER BY sa.awarded_at DESC
  ), '[]'::jsonb)
  INTO v_class_stars
  FROM public.student_achievements sa
  JOIN public.badges_master bm ON bm.id = sa.badge_id
  WHERE sa.student_id = p_student_id
    AND sa.is_active = true
    AND bm.tier = 'class_star'
    AND sa.academic_year = to_char(now(), 'YYYY');

  -- Most recent active Tier 2 badge (permanent, crosses years)
  SELECT jsonb_build_object(
    'icon_key',   bm.icon_key,
    'icon_color', bm.icon_color,
    'badge_name', bm.name,
    'badge_id',   bm.id,
    'awarded_at', sa.awarded_at
  )
  INTO v_champion
  FROM public.student_achievements sa
  JOIN public.badges_master bm ON bm.id = sa.badge_id
  WHERE sa.student_id = p_student_id
    AND sa.is_active = true
    AND bm.tier = 'school_champion'
  ORDER BY sa.awarded_at DESC
  LIMIT 1;

  -- Upsert, preserving pinned_badges
  INSERT INTO public.badge_visibility_cache
    (student_id, school_id, active_class_stars, active_champion, pinned_badges, last_updated)
  VALUES
    (p_student_id, v_school_id, v_class_stars, v_champion, v_existing_pins, now())
  ON CONFLICT (student_id)
  DO UPDATE SET
    active_class_stars = EXCLUDED.active_class_stars,
    active_champion    = EXCLUDED.active_champion,
    -- IMPORTANT: do NOT overwrite pinned_badges here — student controls it
    last_updated       = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_badge_cache(uuid) TO authenticated;


-- ── 6. RPC: get_my_pinnable_badges ───────────────────────────────────────────
-- Returns all active badges a student has earned, formatted for the pin UI.
-- Student can pick any 2 from this list.
CREATE OR REPLACE FUNCTION public.get_my_pinnable_badges(p_student_id uuid)
RETURNS TABLE (
  badge_id     uuid,
  badge_name   text,
  icon_key     text,
  icon_color   text,
  tier         text,
  awarded_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the student themselves may call this
  IF auth.uid() != p_student_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (bm.id)
    bm.id,
    bm.name,
    bm.icon_key,
    bm.icon_color,
    bm.tier,
    sa.awarded_at
  FROM public.student_achievements sa
  JOIN public.badges_master bm ON bm.id = sa.badge_id
  WHERE sa.student_id = p_student_id
    AND sa.is_active = true
  ORDER BY bm.id, sa.awarded_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_pinnable_badges(uuid) TO authenticated;


-- ── 7. Reload PostgREST schema cache ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- POST-MIGRATION NOTES:
-- 1. Run this entire file in Supabase SQL Editor.
-- 2. After running, the badge_visibility_cache table has a new `pinned_badges`
--    column and badges_master has `custom_scope_class`.
-- 3. The rebuilt rebuild_badge_cache RPC is backward-compatible (same signature).
-- 4. New RPCs: pin_student_badges, rollover_year_end_badges, get_my_pinnable_badges
-- ==============================================================================
