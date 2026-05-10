-- ==============================================================================
-- V52: PRINCIPAL'S DESK MODULE
-- Objective: Secure, private messaging system connecting users to the Principal.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.principals_desk (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL, -- Nullable if truly anonymous (but we usually store it and hide it in UI if is_anonymous is true)
    is_anonymous boolean DEFAULT false,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
    reply_text text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.principals_desk ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone in the school can INSERT
CREATE POLICY "principals_desk_insert" ON public.principals_desk
FOR INSERT WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
);

-- Policy 2: Senders can SELECT their own messages (if they are logged in)
CREATE POLICY "principals_desk_select_own" ON public.principals_desk
FOR SELECT USING (
    sender_id = auth.uid()
);

-- Policy 3: Admins and App Managers can SELECT all messages in their school
CREATE POLICY "principals_desk_select_admin" ON public.principals_desk
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (
            role IN ('platform_admin', 'app_manager') 
            OR (role = 'admin' AND school_id = public.principals_desk.school_id)
        )
    )
);

-- Policy 4: Admins and App Managers can UPDATE (reply to) messages in their school
CREATE POLICY "principals_desk_update_admin" ON public.principals_desk
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (
            role IN ('platform_admin', 'app_manager') 
            OR (role = 'admin' AND school_id = public.principals_desk.school_id)
        )
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_principals_desk_school ON public.principals_desk(school_id);
CREATE INDEX IF NOT EXISTS idx_principals_desk_sender ON public.principals_desk(sender_id);
