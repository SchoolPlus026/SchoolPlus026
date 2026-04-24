-- Phase 30: Platform Operations & Support

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id UUID REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- School Admin can read/insert their own tickets
CREATE POLICY "School Admin read tickets" ON public.support_tickets
    FOR SELECT USING (
        school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid())
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "School Admin insert tickets" ON public.support_tickets
    FOR INSERT WITH CHECK (
        school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid())
        AND auth.role() = 'authenticated'
    );

-- Platform Admin can read and update all tickets
CREATE POLICY "Platform Admin all tickets" ON public.support_tickets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    );
