-- ============================================================
-- v42: Fix platform_delete_school RPC (fees_id to fee_id)
-- ============================================================

-- 1. Redefine the function to correct the column name and add missing cascade tables
CREATE OR REPLACE FUNCTION public.platform_delete_school(p_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Leaf tables first (those with FKs pointing up)
  
  -- Fix: Corrected column name from 'fees_id' to 'fee_id'
  DELETE FROM public.fees_payments
    WHERE fee_id IN (SELECT id FROM public.fees WHERE school_id = p_school_id);
    
  DELETE FROM public.fees                    WHERE school_id = p_school_id;
  DELETE FROM public.attendance              WHERE school_id = p_school_id;
  DELETE FROM public.gallery                 WHERE school_id = p_school_id;
  DELETE FROM public.notices                 WHERE school_id = p_school_id;
  DELETE FROM public.calendar_events         WHERE school_id = p_school_id;
  DELETE FROM public.timetable               WHERE school_id = p_school_id;
  DELETE FROM public.leaves                  WHERE school_id = p_school_id;
  
  -- Check if app_notifications_queue exists before deleting
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_notifications_queue') THEN
    DELETE FROM public.app_notifications_queue WHERE school_id = p_school_id;
  END IF;
  
  DELETE FROM public.user_device_tokens      WHERE user_id IN (SELECT id FROM public.users WHERE school_id = p_school_id);
  
  -- Check if payment_requests exists before deleting
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_requests') THEN
    DELETE FROM public.payment_requests        WHERE school_id = p_school_id;
  END IF;
  
  DELETE FROM public.support_tickets         WHERE school_id = p_school_id;
  
  -- Additional cleanup for newer tables (though CASCADE handles most, being explicit prevents locks)
  DELETE FROM public.subscription_transactions WHERE school_id = p_school_id;
  DELETE FROM public.audit_logs                WHERE school_id = p_school_id;
  DELETE FROM public.notifications             WHERE school_id = p_school_id;
  
  -- Users profile row must be deleted before school_settings (FK)
  DELETE FROM public.users                   WHERE school_id = p_school_id;
  DELETE FROM public.school_settings         WHERE school_id = p_school_id;
END;
$$;

-- 2. Grant execute only to service_role (Edge Functions use service_role key)
REVOKE ALL ON FUNCTION public.platform_delete_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_delete_school(uuid) TO service_role;
