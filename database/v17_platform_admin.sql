-- Phase 28.1: Platform Admin Foundation

-- 1. Update the role constraint in users table
-- We drop the existing constraint and add it back with 'platform_admin'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'student', 'app_manager', 'platform_admin'));

-- Migrate any existing app_manager users to platform_admin
UPDATE users SET role = 'platform_admin' WHERE role = 'app_manager';

-- 2. Create platform_settings table
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_name TEXT NOT NULL DEFAULT 'SchoolOS+',
    logo_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default row if empty
INSERT INTO platform_settings (app_name) 
SELECT 'SchoolOS+'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings);

-- RLS for platform_settings
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the platform settings (needed for login page)
CREATE POLICY "Public read platform_settings" ON platform_settings
    FOR SELECT USING (true);

-- Allow platform_admin to update the settings
CREATE POLICY "Platform Admin update platform_settings" ON platform_settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    );

-- 3. Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT 'all', -- 'all', 'admin', 'teacher', 'student'
    target_schools TEXT NOT NULL DEFAULT 'all', -- 'all' or comma separated school_ids
    type_style TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'success'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for announcements
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view announcements targeted at them
CREATE POLICY "Auth read announcements" ON announcements
    FOR SELECT USING (
        auth.role() = 'authenticated'
    );

-- Allow platform_admin to manage announcements
CREATE POLICY "Platform Admin all announcements" ON announcements
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid() AND users.role = 'platform_admin'
        )
    );
