-- ==============================================================================
-- V53: RESTORE DEFAULT MODULES
-- Objective: Ensure all legacy modules are included in modules_active by default
-- ==============================================================================

-- 1. Set the default value for new rows
ALTER TABLE public.school_settings 
ALTER COLUMN modules_active SET DEFAULT '["attendance", "fees", "calendar", "notices", "gallery", "timetable", "off_classes", "leaves", "reports", "users", "contact", "billing", "knowledge_base"]'::jsonb;

-- 2. Backfill existing rows that have empty or null modules_active, or missing legacy ones
UPDATE public.school_settings
SET modules_active = (
    SELECT jsonb_agg(DISTINCT elem)
    FROM jsonb_array_elements_text(
        COALESCE(modules_active, '[]'::jsonb) || 
        '["attendance", "fees", "calendar", "notices", "gallery", "timetable", "off_classes", "leaves", "reports", "users", "contact", "billing", "knowledge_base"]'::jsonb
    ) AS elem
);
