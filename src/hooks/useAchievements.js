/**
 * useAchievements.js  — v2 (Achievers Board complete)
 *
 * Exports:
 *   useBadgeCache(studentId)           — badge_visibility_cache row for one student
 *   useSchoolBadgeCache(schoolId)      — entire school's cache (for global name rendering)
 *   useStudentAchievements(id)         — full achievement list via RPC
 *   useBadgesMaster(schoolId, tier?)   — catalog; teacher sees own-class customs too
 *   useClassAchievements(schoolId, class) — teacher's class achievement feed
 *   useSchoolChampions(schoolId)       — Tier 2 awards for admin leaderboard
 *   usePinnableBadges(studentId)       — badges available for the student pin-picker
 *   triggerStreakCheck(...)            — called after attendance save
 *   awardBadge(...)                    — manual badge award
 *   revokeBadge(...)                   — admin soft-delete
 *   seedDefaultBadges(...)             — school onboarding
 *   pinBadges(studentId, badgeIds)     — student pins up to 2 badges
 *   rolloverYearEnd(schoolId, year)    — admin year-end Mega Star rollover
 *   createCustomBadge(...)             — teacher creates ad-hoc class badge
 *   deleteCustomBadge(badgeId)         — teacher deletes their own custom badge
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';

// ── Badge Visibility Cache — single student ───────────────────────────────────
export function useBadgeCache(studentId) {
  return useQuery({
    queryKey: ['badge-cache', studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase
        .from('badge_visibility_cache')
        .select('active_class_stars, active_champion, pinned_badges')
        .eq('student_id', studentId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data ?? { active_class_stars: [], active_champion: null, pinned_badges: null };
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ── Badge Visibility Cache — full school (for global name-badge rendering) ────
export function useSchoolBadgeCache(schoolId) {
  return useQuery({
    queryKey: ['school-badge-cache', schoolId],
    queryFn: async () => {
      if (!schoolId) return {};
      const { data, error } = await supabase
        .from('badge_visibility_cache')
        .select('student_id, active_class_stars, active_champion, pinned_badges')
        .eq('school_id', schoolId);
      if (error) throw error;
      // Return as a map: { [student_id]: cacheRow }
      const map = {};
      (data ?? []).forEach(row => { map[row.student_id] = row; });
      return map;
    },
    enabled: !!schoolId,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ── Full Achievement List for Student Profile ─────────────────────────────────
export function useStudentAchievements(studentId) {
  return useQuery({
    queryKey: ['student-achievements', studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .rpc('get_student_achievements', { p_student_id: studentId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Pinnable Badges (student pin-picker) ─────────────────────────────────────
export function usePinnableBadges(studentId) {
  return useQuery({
    queryKey: ['pinnable-badges', studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .rpc('get_my_pinnable_badges', { p_student_id: studentId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Badge Catalog ─────────────────────────────────────────────────────────────
// Teachers see school-wide badges + their own class-custom badges.
export function useBadgesMaster(schoolId, tierFilter = null, className = null) {
  return useQuery({
    queryKey: ['badges-master', schoolId, tierFilter, className],
    queryFn: async () => {
      if (!schoolId) return [];
      let query = supabase
        .from('badges_master')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('tier', { ascending: true })
        .order('name', { ascending: true });
      if (tierFilter) query = query.eq('tier', tierFilter);
      const { data, error } = await query;
      if (error) throw error;
      // Filter: show school-wide badges + class-scoped badges for THIS class
      const result = (data ?? []).filter(b =>
        b.custom_scope_class === null ||
        (className && b.custom_scope_class === className)
      );
      return result;
    },
    enabled: !!schoolId,
    staleTime: 10 * 60 * 1000,
  });
}

// ── Class Achievements feed (Teacher portal) ──────────────────────────────────
export function useClassAchievements(schoolId, className) {
  return useQuery({
    queryKey: ['class-achievements', schoolId, className],
    queryFn: async () => {
      if (!schoolId || !className) return [];
      const { data, error } = await supabase
        .from('student_achievements')
        .select(`
          id, student_id, note, awarded_at, class_name,
          badges_master ( name, icon_key, icon_color, tier ),
          users!student_id ( id, name, avatar_url, avatar_file_id, hide_avatar_from_class, role )
        `)
        .eq('school_id', schoolId)
        .eq('class_name', className)
        .eq('is_active', true)
        .order('awarded_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schoolId && !!className,
    staleTime: 2 * 60 * 1000,
  });
}

// ── School Champions (Admin leaderboard) ──────────────────────────────────────
export function useSchoolChampions(schoolId) {
  return useQuery({
    queryKey: ['school-champions', schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from('student_achievements')
        .select(`
          id, student_id, note, awarded_at, is_active,
          badges_master!inner ( name, icon_key, icon_color, tier ),
          users!student_id ( id, name, class, avatar_url, avatar_file_id, hide_avatar_from_class, role )
        `)
        .eq('school_id', schoolId)
        .eq('badges_master.tier', 'school_champion')
        .eq('is_active', true)
        .order('awarded_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schoolId,
    staleTime: 2 * 60 * 1000,
  });
}

// ── All achievements for leaderboard (both tiers, ranked by count) ─────────────
export function useLeaderboard(schoolId, filterType = 'all', filterValue = null) {
  return useQuery({
    queryKey: ['leaderboard', schoolId, filterType, filterValue],
    queryFn: async () => {
      if (!schoolId) return [];
      let query = supabase
        .from('student_achievements')
        .select(`
          student_id,
          academic_year,
          awarded_at,
          badges_master ( tier ),
          users!student_id ( id, name, class, avatar_url, avatar_file_id, hide_avatar_from_class, role )
        `)
        .eq('school_id', schoolId)
        .eq('is_active', true);

      if (filterType === 'year' && filterValue) {
        query = query.eq('academic_year', filterValue);
      } else if (filterType === 'month' && filterValue) {
        // filterValue = 'YYYY-MM'
        const start = new Date(filterValue + '-01').toISOString();
        const end   = new Date(
          new Date(filterValue + '-01').getFullYear(),
          new Date(filterValue + '-01').getMonth() + 1, 1
        ).toISOString();
        query = query.gte('awarded_at', start).lt('awarded_at', end);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Aggregate: count badges per student, separate by tier
      const map = {};
      (data ?? []).forEach(row => {
        const sid = row.student_id;
        if (!map[sid]) {
          map[sid] = {
            student_id:    sid,
            id:            sid,
            name:          row.users?.name || '—',
            class:         row.users?.class || '—',
            avatar_url:    row.users?.avatar_url || null,
            avatar_file_id: row.users?.avatar_file_id || null,
            hide_avatar_from_class: !!row.users?.hide_avatar_from_class,
            role:          row.users?.role || 'student',
            total:         0,
            class_stars:   0,
            school_champs: 0,
          };
        }
        map[sid].total++;
        if (row.badges_master?.tier === 'class_star') map[sid].class_stars++;
        else map[sid].school_champs++;
      });

      return Object.values(map).sort((a, b) => b.total - a.total);
    },
    enabled: !!schoolId,
    staleTime: 2 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS (async functions, not hooks)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Trigger Streak Check (after teacher saves attendance) ─────────────────────
export async function triggerStreakCheck(schoolId, className, monthYear) {
  const { data, error } = await supabase.rpc('check_and_award_streak_badges', {
    p_school_id:  schoolId,
    p_class_name: className,
    p_month_year: monthYear,
  });
  if (error) console.error('[StreakCheck] Error:', error);
  return data;
}

// ── Award Manual Badge ─────────────────────────────────────────────────────────
export async function awardBadge({ schoolId, studentId, badgeId, className, awardedBy, note }) {
  const { data, error } = await supabase
    .from('student_achievements')
    .insert({
      school_id:     schoolId,
      student_id:    studentId,
      badge_id:      badgeId,
      class_name:    className ?? null,
      awarded_by:    awardedBy,
      note:          note ?? null,
      academic_year: new Date().getFullYear().toString(),
    })
    .select('*, badges_master(name)')
    .single();
  if (error) throw error;

  // Queue a push notification for the student/parent
  await supabase.from('app_notifications_queue').insert({
    school_id: schoolId,
    user_id: studentId,
    title: 'New Achievement Unlocked! 🏆',
    body: `You have been awarded the "${data.badges_master?.name || 'New'}" badge. Keep it up!`,
    route: '/student/achievements',
    is_ephemeral: false,
    status: 'pending'
  });

  await supabase.rpc('rebuild_badge_cache', { p_student_id: studentId });
  return data;
}

// ── Revoke Badge (Admin soft-delete for Tier 2) ────────────────────────────────
export async function revokeBadge(achievementId, studentId) {
  const { error } = await supabase
    .from('student_achievements')
    .update({ is_active: false })
    .eq('id', achievementId);
  if (error) throw error;
  await supabase.rpc('rebuild_badge_cache', { p_student_id: studentId });
}

// ── Seed Default Badges ────────────────────────────────────────────────────────
export async function seedDefaultBadges(schoolId, adminId) {
  const defaults = [
    // School Level Champions
    { school_id: schoolId, name: 'Student of the Year', description: 'Awarded for overall excellence', icon_key: 'trophy', icon_color: '#F59E0B', tier: 'school_champion', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Sports Hero', description: 'Outstanding performance in sports', icon_key: 'medal', icon_color: '#3B82F6', tier: 'school_champion', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Academic Excellence', description: 'Top academic performance', icon_key: 'graduation-cap', icon_color: '#8B5CF6', tier: 'school_champion', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Cultural Icon', description: 'Exceptional talent in arts and culture', icon_key: 'music', icon_color: '#EC4899', tier: 'school_champion', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Leadership Award', description: 'Outstanding leadership qualities', icon_key: 'crown', icon_color: '#10B981', tier: 'school_champion', award_type: 'manual', created_by: adminId },
    
    // Class Level Stars
    { school_id: schoolId, name: 'Homework Hero', description: 'Consistently completes homework on time', icon_key: 'book-open', icon_color: '#10B981', tier: 'class_star', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Discipline Hero', description: 'Exemplary behavior in class', icon_key: 'shield', icon_color: '#64748B', tier: 'class_star', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Helper Hero', description: 'Always ready to help others', icon_key: 'hand-heart', icon_color: '#EC4899', tier: 'class_star', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Best Student', description: 'Outstanding student of the month', icon_key: 'star', icon_color: '#F59E0B', tier: 'class_star', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'All-Rounder', description: 'Excellent in all class activities', icon_key: 'sparkles', icon_color: '#8B5CF6', tier: 'class_star', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: 'Class Monitor', description: 'Takes responsibility in class', icon_key: 'smile', icon_color: '#3B82F6', tier: 'class_star', award_type: 'manual', created_by: adminId },
    { school_id: schoolId, name: '100% Attendance', description: 'Present every single day', icon_key: 'zap', icon_color: '#F59E0B', tier: 'class_star', award_type: 'manual', created_by: adminId },
  ];

  const { data: existing, error: fetchError } = await supabase
    .from('badges_master')
    .select('name')
    .eq('school_id', schoolId)
    .eq('is_active', true);

  if (fetchError) throw fetchError;

  const existingNames = new Set((existing || []).map(b => b.name.toLowerCase()));
  const toInsert = defaults.filter(d => !existingNames.has(d.name.toLowerCase()));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('badges_master').insert(toInsert);
    if (error) throw error;
  }
}

// ── Student: Pin up to 2 badges ───────────────────────────────────────────────
export async function pinBadges(studentId, badgeIds) {
  const { error } = await supabase.rpc('pin_student_badges', {
    p_student_id: studentId,
    p_badge_ids:  badgeIds.slice(0, 2),
  });
  if (error) throw error;
}

// ── Admin: Year-end Mega Star rollover ────────────────────────────────────────
export async function rolloverYearEnd(schoolId, closingYear) {
  const { data, error } = await supabase.rpc('rollover_year_end_badges', {
    p_school_id:    schoolId,
    p_closing_year: closingYear,
  });
  if (error) throw error;
  return data; // count of students awarded Mega Star
}

// ── Teacher: Create custom class badge ────────────────────────────────────────
export async function createCustomBadge({ schoolId, teacherId, className, name, description, iconKey, iconColor }) {
  const { data, error } = await supabase
    .from('badges_master')
    .insert({
      school_id:          schoolId,
      name,
      description:        description || '',
      icon_key:           iconKey,
      icon_color:         iconColor,
      tier:               'class_star',
      award_type:         'manual',
      custom_scope_class: className,
      created_by:         teacherId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Teacher: Delete their own custom badge ─────────────────────────────────────
export async function deleteCustomBadge(badgeId) {
  const { error } = await supabase
    .from('badges_master')
    .delete()
    .eq('id', badgeId);
  if (error) throw error;
}
