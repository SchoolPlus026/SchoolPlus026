-- ==============================================================================
-- V55: Phase 2 Core Management Features
-- Includes Syllabus Tracker & Health/Mood Notes
-- ==============================================================================

-- 1. Syllabus Tracker (JSONB Array Architecture)
CREATE TABLE IF NOT EXISTS public.syllabus_tracker (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    class text NOT NULL,
    subject text NOT NULL,
    chapters jsonb DEFAULT '[]'::jsonb, -- e.g., [{"id": 1, "title": "Chapter 1", "status": "In Progress"}]
    updated_by uuid REFERENCES public.users(id),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(school_id, class, subject)
);

CREATE INDEX IF NOT EXISTS idx_syllabus_tracker_school_class ON public.syllabus_tracker(school_id, class);

ALTER TABLE public.syllabus_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "syllabus_tracker_select" ON public.syllabus_tracker FOR SELECT 
USING (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "syllabus_tracker_all" ON public.syllabus_tracker FOR ALL 
USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('admin', 'platform_admin', 'teacher')
        )
    )
);


-- 2. Morning Health & Mood Note (Student-Centric Monthly JSONB)
CREATE TABLE IF NOT EXISTS public.health_mood_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    student_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    month_year text NOT NULL, -- Format: 'YYYY-MM'
    notes jsonb DEFAULT '{}'::jsonb, -- {"YYYY-MM-DD": {"emoji": "🤒", "note": "Stomach ache"}}
    created_at timestamptz DEFAULT now(),
    UNIQUE(school_id, student_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_health_mood_school_student ON public.health_mood_notes(school_id, student_id, month_year);

ALTER TABLE public.health_mood_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_mood_notes_select" ON public.health_mood_notes FOR SELECT 
USING (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "health_mood_notes_all" ON public.health_mood_notes FOR ALL 
USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('admin', 'platform_admin', 'student', 'teacher')
        )
    )
);
