-- ==============================================================================
-- V54: COMPLAINT BOX (Replaces Principal's Desk)
-- 3-way private messaging: Student→Admin, Student→Teacher, Teacher→Student
-- Multi-tenant isolated via school_id
-- ==============================================================================

-- Drop old table if it exists (was just created, no production data yet)
DROP TABLE IF EXISTS public.principals_desk CASCADE;

-- Create the new complaint_box table
CREATE TABLE IF NOT EXISTS public.complaint_box (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id     uuid        NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    
    -- Sender
    sender_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_role   text        NOT NULL CHECK (sender_role IN ('student', 'teacher', 'admin', 'platform_admin')),
    is_anonymous  boolean     DEFAULT false,   -- Only students can use this

    -- Recipient routing
    recipient_type text       NOT NULL CHECK (recipient_type IN ('admin', 'teacher', 'student')),
    recipient_id   uuid       REFERENCES public.users(id) ON DELETE SET NULL, -- NULL = "all admins"

    -- Content
    subject       text        NOT NULL,
    message       text        NOT NULL,

    -- Status & reply
    status        text        DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
    reply_text    text,
    replied_at    timestamptz,

    -- Timestamps
    created_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_complaint_box_school     ON public.complaint_box(school_id);
CREATE INDEX IF NOT EXISTS idx_complaint_box_sender     ON public.complaint_box(sender_id);
CREATE INDEX IF NOT EXISTS idx_complaint_box_recipient  ON public.complaint_box(recipient_id);

-- Enable RLS
ALTER TABLE public.complaint_box ENABLE ROW LEVEL SECURITY;

-- ── INSERT Policies ─────────────────────────────────────────────────────────

-- Policy: Any authenticated user in the school can send a complaint
CREATE POLICY "complaint_box_insert"
ON public.complaint_box FOR INSERT
WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND sender_id = auth.uid()
);

-- ── SELECT Policies ─────────────────────────────────────────────────────────

-- Policy: Senders can see their own sent messages (even if anonymous, they see their own)
CREATE POLICY "complaint_box_select_sender"
ON public.complaint_box FOR SELECT
USING (sender_id = auth.uid());

-- Policy: Explicit recipients (teacher/student) can see messages addressed to them
CREATE POLICY "complaint_box_select_recipient"
ON public.complaint_box FOR SELECT
USING (recipient_id = auth.uid());

-- Policy: School Admins & Platform Admins see ALL messages in their school
CREATE POLICY "complaint_box_select_admin"
ON public.complaint_box FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND (
            role IN ('platform_admin', 'app_manager')
            OR (role = 'admin' AND school_id = public.complaint_box.school_id)
        )
    )
);

-- ── UPDATE Policies ─────────────────────────────────────────────────────────

-- Policy: The designated recipient OR a school admin can reply/update
CREATE POLICY "complaint_box_update"
ON public.complaint_box FOR UPDATE
USING (
    recipient_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND (
            role IN ('platform_admin', 'app_manager')
            OR (role = 'admin' AND school_id = public.complaint_box.school_id)
        )
    )
);

-- ── Trigger: auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_complaint_box_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER complaint_box_updated_at
BEFORE UPDATE ON public.complaint_box
FOR EACH ROW EXECUTE FUNCTION update_complaint_box_timestamp();
