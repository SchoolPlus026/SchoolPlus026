-- Phase 33: QR Payment, Ticket Fix & Plan Status
-- ============================================================

-- 1. Fix support_tickets: ensure 'response' & 'manager_reply' columns exist
--    (handles both old v11 schema and new v20 schema)
ALTER TABLE public.support_tickets 
  ADD COLUMN IF NOT EXISTS response TEXT,
  ADD COLUMN IF NOT EXISTS manager_reply TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Drop old restrictive policies if they exist and recreate safely
DROP POLICY IF EXISTS "Platform Admin all tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets: manager all" ON public.support_tickets;
DROP POLICY IF EXISTS "Ticket Isolation" ON public.support_tickets;

-- Recreate: Platform Admin can SELECT + UPDATE + DELETE all tickets
CREATE POLICY "Platform Admin all tickets" ON public.support_tickets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    );

-- 2. Create payment_requests table for QR-based upgrade system
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES public.school_settings(school_id) ON DELETE CASCADE,
    utr_number TEXT NOT NULL,
    screenshot_url TEXT,
    amount TEXT,
    plan_requested TEXT NOT NULL DEFAULT 'Premium',
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    admin_note TEXT,
    submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- RLS for payment_requests
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- School Admin can insert and read their own requests
CREATE POLICY "School can manage own payment requests" ON public.payment_requests
    FOR ALL USING (
        school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid())
        AND auth.role() = 'authenticated'
    )
    WITH CHECK (
        school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid())
        AND auth.role() = 'authenticated'
    );

-- Platform Admin can see and update ALL requests
CREATE POLICY "Platform Admin all payment requests" ON public.payment_requests
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    );

-- 3. Create Supabase Storage bucket for payment screenshots (run manually if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('payment-screenshots', 'payment-screenshots', true)
-- ON CONFLICT (id) DO NOTHING;
