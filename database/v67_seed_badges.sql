-- V67: Seed Default Gamification Badges
-- Inserts Tier 1 (Class Level) and Tier 2 (School Level) default badges.

CREATE OR REPLACE FUNCTION public.seed_default_badges(p_school_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Tier 1: Class Stars (Manual)
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Active Learner', 'Participates actively in class discussions.', 'zap', '#3B82F6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Little Helper', 'Always ready to help classmates and teachers.', 'hand-heart', '#10B981', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Good Listener', 'Pays attention and follows instructions carefully.', 'ear', '#F59E0B', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Best Handwriting', 'Maintains neat and beautiful handwriting.', 'pen-tool', '#8B5CF6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Discipline Star', 'Shows excellent behavior and discipline in class.', 'star', '#EC4899', 'class_star', 'manual', p_admin_id)
    ON CONFLICT ON CONSTRAINT badges_master_school_id_name_tier_key DO NOTHING;

    -- Tier 2: School Champions (Manual)
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Student of the Year', 'Awarded to the most outstanding overall student.', 'crown', '#F59E0B', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Sports Champion', 'Exceptional performance in school sports activities.', 'medal', '#EF4444', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Academic Excellence', 'Consistently top grades and academic brilliance.', 'graduation-cap', '#3B82F6', 'school_champion', 'manual', p_admin_id)
    ON CONFLICT ON CONSTRAINT badges_master_school_id_name_tier_key DO NOTHING;
END;
$$;
