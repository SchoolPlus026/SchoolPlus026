-- V67: Seed Default Gamification Badges
-- Inserts Class Level and School Level default badges.

CREATE OR REPLACE FUNCTION public.seed_default_badges(p_school_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Class Level Stars (Manual)
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Homework Hero', 'Consistently completing homework on time.', 'book-open', '#8B5CF6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Active Learner', 'Participating actively in class discussions.', 'zap', '#3B82F6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Good Listener', 'Paying attention and following instructions.', 'ear', '#F59E0B', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Best Handwriting', 'Maintaining neat and legible handwriting.', 'pen-tool', '#10B981', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Discipline Star', 'Outstanding behavior in class.', 'star', '#EC4899', 'class_star', 'manual', p_admin_id)
    ON CONFLICT ON CONSTRAINT badges_master_school_id_name_tier_key DO NOTHING;

    -- School Level Champions (Manual)
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Student of the Year', 'Overall excellence in academics and behavior.', 'crown', '#F59E0B', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Best Sportsman', 'Exceptional performance in school sports.', 'medal', '#EF4444', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'All Rounder', 'Excelling in both studies and extracurriculars.', 'award', '#3B82F6', 'school_champion', 'manual', p_admin_id)
    ON CONFLICT ON CONSTRAINT badges_master_school_id_name_tier_key DO NOTHING;
END;
$$;
