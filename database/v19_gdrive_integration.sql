-- Phase 29: Google Drive Infinite Storage Integration

-- Add JSONB column to store Google Drive configuration per school
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS gdrive_config JSONB;

-- Example Structure of gdrive_config:
-- {
--   "refresh_token": "1//0xxxx...",
--   "folder_id": "1A2B3C...",
--   "connected_at": "2024-05-20T10:00:00Z"
-- }
