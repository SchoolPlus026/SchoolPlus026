-- V57: Syllabus Tracker Overhaul

-- 1. Add total_chapters to syllabus_tracker
ALTER TABLE public.syllabus_tracker ADD COLUMN IF NOT EXISTS total_chapters integer DEFAULT 0;

-- Existing jsonb chapters will transition from:
-- [{"id": "1", "title": "Algebra", "status": "In Progress"}]
-- to:
-- [{"id": 1, "title": "Chapter 1", "is_completed": true}]
