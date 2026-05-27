-- ==============================================================================
-- v74: Fee Reminder Notification Permissions
-- Allows teachers to insert fee_reminder notifications for students
-- in their assigned class via the Smart Fee Reminder System.
-- ==============================================================================

-- Drop the old admin-only INSERT policy and replace with a broader one
-- that also allows teachers
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;

CREATE POLICY "Admins and teachers can insert notifications"
    ON public.notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (
      school_id = (SELECT school_id FROM public.users WHERE users.id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN ('admin', 'teacher')
      )
    );

-- Also ensure teachers can read notifications they sent (for RLS completeness)
-- The existing SELECT policy is scoped to school_id which already covers this.

NOTIFY pgrst, 'reload schema';
