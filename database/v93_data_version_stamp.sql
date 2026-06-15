-- ==============================================================================
-- V93: DATA VERSION STAMP FOR CLIENT-SIDE CACHE INVALIDATION
-- ==============================================================================
-- Adds data_version column to school_settings to track changes.
-- Automatically increments data_version when core tables (attendance, notices, fees,
-- leaves, emergency_alerts) are updated.

-- 1. Add data_version column to school_settings if not exists
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS data_version INT DEFAULT 1;

-- 2. Populate default value for existing rows
UPDATE public.school_settings SET data_version = COALESCE(data_version, 1);

-- 3. Create helper function to increment version definer
CREATE OR REPLACE FUNCTION public.increment_school_data_version()
RETURNS TRIGGER AS $$
DECLARE
    v_school_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_school_id := OLD.school_id;
    ELSE
        v_school_id := NEW.school_id;
    END IF;

    IF v_school_id IS NOT NULL THEN
        UPDATE public.school_settings
        SET data_version = COALESCE(data_version, 0) + 1
        WHERE school_id = v_school_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create triggers for core school-specific tables

-- Attendance
DROP TRIGGER IF EXISTS trg_increment_version_attendance ON public.attendance;
CREATE TRIGGER trg_increment_version_attendance
AFTER INSERT OR UPDATE OR DELETE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.increment_school_data_version();

-- Notices
DROP TRIGGER IF EXISTS trg_increment_version_notices ON public.notices;
CREATE TRIGGER trg_increment_version_notices
AFTER INSERT OR UPDATE OR DELETE ON public.notices
FOR EACH ROW EXECUTE FUNCTION public.increment_school_data_version();

-- Fees
DROP TRIGGER IF EXISTS trg_increment_version_fees ON public.fees;
CREATE TRIGGER trg_increment_version_fees
AFTER INSERT OR UPDATE OR DELETE ON public.fees
FOR EACH ROW EXECUTE FUNCTION public.increment_school_data_version();

-- Leaves
DROP TRIGGER IF EXISTS trg_increment_version_leaves ON public.leaves;
CREATE TRIGGER trg_increment_version_leaves
AFTER INSERT OR UPDATE OR DELETE ON public.leaves
FOR EACH ROW EXECUTE FUNCTION public.increment_school_data_version();

-- Emergency Alerts
DROP TRIGGER IF EXISTS trg_increment_version_emergency_alerts ON public.emergency_alerts;
CREATE TRIGGER trg_increment_version_emergency_alerts
AFTER INSERT OR UPDATE OR DELETE ON public.emergency_alerts
FOR EACH ROW EXECUTE FUNCTION public.increment_school_data_version();

-- 5. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
