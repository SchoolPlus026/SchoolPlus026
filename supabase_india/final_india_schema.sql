-- ==========================================
-- SchoolOS+ Consolidated Database Schema Dump
-- Extracted remotely from Japan Project (jbjtvosvwufimjcvvwcg)
-- Date: 2026-06-26T09:54:59.700Z
-- ==========================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "extensions";

-- ==========================================
-- SECTION 1: TABLES DEFINITIONS
-- ==========================================

CREATE TABLE public.academic_archives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    academic_year text NOT NULL,
    archived_by uuid,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_path text NOT NULL,
    snapshot_size_bytes bigint DEFAULT 0,
    student_count integer DEFAULT 0,
    row_counts jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'completed'::text NOT NULL,
    notes text,
    CONSTRAINT academic_archives_pkey PRIMARY KEY (id)
);

CREATE TABLE public.announcements (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    message text NOT NULL,
    target_role text DEFAULT 'all'::text NOT NULL,
    target_schools text DEFAULT 'all'::text NOT NULL,
    type_style text DEFAULT 'info'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    start_date timestamp with time zone DEFAULT now(),
    expiry_date timestamp with time zone,
    CONSTRAINT announcements_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_name text NOT NULL,
    value_content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT app_config_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_notifications_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    user_id uuid,
    target_role text,
    title text NOT NULL,
    body text NOT NULL,
    route text,
    status text DEFAULT 'pending'::text,
    error_log text,
    created_at timestamp with time zone DEFAULT now(),
    is_ephemeral boolean DEFAULT true,
    recipient_id uuid,
    CONSTRAINT app_notifications_queue_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_versions (
    id bigint NOT NULL,
    version_code integer NOT NULL,
    version_name text NOT NULL,
    apk_url text NOT NULL,
    release_notes text DEFAULT ''::text,
    is_critical boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_versions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    user_id uuid NOT NULL,
    month_year text NOT NULL,
    attendance_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    archived boolean DEFAULT false NOT NULL,
    CONSTRAINT attendance_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_type text NOT NULL,
    performed_by uuid,
    school_id uuid,
    target_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.badge_visibility_cache (
    student_id uuid NOT NULL,
    school_id uuid NOT NULL,
    active_class_stars jsonb DEFAULT '[]'::jsonb,
    active_champion jsonb,
    last_updated timestamp with time zone DEFAULT now(),
    pinned_badges jsonb,
    CONSTRAINT badge_visibility_cache_pkey PRIMARY KEY (student_id)
);

CREATE TABLE public.badges_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    icon_key text DEFAULT 'star'::text NOT NULL,
    icon_color text DEFAULT '#FFD700'::text NOT NULL,
    tier text NOT NULL,
    award_type text NOT NULL,
    auto_rule jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_scope_class text,
    CONSTRAINT badges_master_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bus_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    bus_number text NOT NULL,
    driver_id uuid,
    driver_name text,
    route_name text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bus_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    start_date date NOT NULL,
    end_date date,
    type text DEFAULT 'activity'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT calendar_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.complaint_box (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    is_anonymous boolean DEFAULT false,
    recipient_type text NOT NULL,
    recipient_id uuid,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'unread'::text,
    reply_text text,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT complaint_box_pkey PRIMARY KEY (id)
);

CREATE TABLE public.edge_function_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    function_name text NOT NULL,
    called_at timestamp with time zone DEFAULT now(),
    execution_time_ms integer,
    CONSTRAINT edge_function_usage_pkey PRIMARY KEY (id)
);

CREATE TABLE public.emergency_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    alert_type text NOT NULL,
    message text NOT NULL,
    target_audience text DEFAULT 'all'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    sender_id uuid,
    target_users uuid[],
    CONSTRAINT emergency_alerts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.executive_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    summary_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT executive_briefings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    year integer DEFAULT (EXTRACT(year FROM now()))::integer NOT NULL,
    total numeric DEFAULT 0,
    last_year_pending numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fees_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    fee_id uuid NOT NULL,
    amount numeric NOT NULL,
    method text,
    transaction_id text,
    payment_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fees_payments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.gallery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    title text,
    link text,
    category text,
    created_at timestamp with time zone DEFAULT now(),
    cover_link text,
    photo_urls jsonb DEFAULT '[]'::jsonb,
    visibility_scope text DEFAULT 'Entire School'::text,
    target_class text,
    CONSTRAINT gallery_pkey PRIMARY KEY (id)
);

CREATE TABLE public.health_mood_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    student_id uuid,
    month_year text NOT NULL,
    notes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT health_mood_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.kb_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    video_type text NOT NULL,
    video_url text NOT NULL,
    thumbnail_url text,
    sort_order integer DEFAULT 0,
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    target_module text,
    CONSTRAINT kb_articles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.kb_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon text DEFAULT 'BookOpen'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kb_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.leaves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    last_reminder_at timestamp with time zone,
    CONSTRAINT leaves_pkey PRIMARY KEY (id)
);

CREATE TABLE public.login_brute_force_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_attempt_at timestamp with time zone DEFAULT now(),
    CONSTRAINT login_brute_force_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.lost_and_found (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    reported_by uuid NOT NULL,
    item_name text NOT NULL,
    description text,
    photo_url text,
    location_found text,
    status text DEFAULT 'active'::text NOT NULL,
    claimed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    target_class text,
    CONSTRAINT lost_and_found_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    date date NOT NULL,
    scope text DEFAULT 'all'::text,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notices_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    to_user_id uuid,
    message text NOT NULL,
    link text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    to_user text,
    title text DEFAULT 'Notification'::text,
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.password_reset_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    CONSTRAINT password_reset_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    utr_number text NOT NULL,
    screenshot_url text,
    amount text,
    plan_requested text DEFAULT 'Premium'::text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    admin_note text,
    submitted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    CONSTRAINT payment_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.platform_settings (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    app_name text DEFAULT 'SchoolOS+'::text NOT NULL,
    logo_url text,
    updated_at timestamp with time zone DEFAULT now(),
    terms_conditions text,
    about_app text,
    refund_policy text,
    privacy_policy text,
    support_email text,
    pa_gdrive_config jsonb DEFAULT '[]'::jsonb,
    free_tier_locked_modules jsonb DEFAULT '[]'::jsonb,
    developer_name text,
    contact_number text,
    contact_email text,
    contact_address text DEFAULT 'Parli Vaijnath, Maharashtra'::text,
    free_tier_cron_minutes integer DEFAULT 15,
    disabled_notification_modules text[] DEFAULT ARRAY[]::text[],
    night_mode_enabled boolean DEFAULT true,
    night_start_time text DEFAULT '23:00'::text,
    night_end_time text DEFAULT '05:30'::text,
    free_tier_refresh_cooldown integer DEFAULT 30,
    premium_tier_refresh_cooldown integer DEFAULT 10,
    free_tier_cache_hours integer DEFAULT 6,
    premium_tier_cache_hours integer DEFAULT 1,
    CONSTRAINT platform_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.recovery_ephemeral_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    school_id uuid,
    current_step integer DEFAULT 1 NOT NULL,
    saved_answers jsonb DEFAULT '{}'::jsonb,
    attempt_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    qr_token text,
    qr_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    CONSTRAINT recovery_ephemeral_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.recovery_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    pin_hash text,
    security_question_1 text,
    security_answer_1_hash text,
    security_question_2 text,
    security_answer_2_hash text,
    setup_completed boolean DEFAULT false NOT NULL,
    recovery_locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    password_updated_at timestamp with time zone,
    CONSTRAINT recovery_profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.school_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_name text NOT NULL,
    school_code text NOT NULL,
    city text,
    state text,
    board text,
    school_type text DEFAULT 'private'::text,
    student_strength integer,
    admin_name text NOT NULL,
    admin_email text NOT NULL,
    admin_phone text,
    admin_username text NOT NULL,
    plan_type text DEFAULT 'trial'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    terms_accepted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    admin_password text,
    school_id uuid,
    CONSTRAINT school_registrations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.school_settings (
    school_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    school_code text NOT NULL,
    logo_url text,
    subscription_status text DEFAULT 'Trial'::text,
    classes text[] DEFAULT ARRAY['1st'::text, '2nd'::text, '3rd'::text, '4th'::text, '5th'::text, '6th'::text, '7th'::text, '8th'::text, '9th'::text, '10th'::text, '11th'::text, '12th'::text],
    modules_active jsonb DEFAULT '["attendance", "fees", "calendar", "notices", "gallery", "timetable", "off_classes", "leaves", "reports", "users", "contact", "billing", "knowledge_base"]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    gdrive_config jsonb DEFAULT '[]'::jsonb,
    subscription_tier text DEFAULT 'Free'::text,
    subscription_end_date timestamp with time zone,
    stripe_customer_id text,
    plan_type text DEFAULT 'free'::text,
    billing_cycle text,
    trial_start_date timestamp with time zone,
    trial_end_date timestamp with time zone,
    current_plan_id uuid,
    locked_modules jsonb DEFAULT '[]'::jsonb,
    data_version integer DEFAULT 1,
    student_emails_enabled boolean DEFAULT false,
    CONSTRAINT school_settings_pkey PRIMARY KEY (school_id)
);

CREATE TABLE public.student_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    class_name text,
    awarded_by uuid,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL,
    academic_year text DEFAULT to_char(now(), 'YYYY'::text) NOT NULL,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    idempotency_key text,
    CONSTRAINT student_achievements_pkey PRIMARY KEY (id)
);

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    amount_paise integer NOT NULL,
    validity_days integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);

CREATE TABLE public.subscription_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    razorpay_order_id text NOT NULL,
    razorpay_payment_id text,
    amount_paise integer NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscription_transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.substitutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    original_teacher_id uuid,
    substitute_teacher_id uuid,
    class text NOT NULL,
    subject text,
    day text NOT NULL,
    period_order integer NOT NULL,
    period_label text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    assigned_by text DEFAULT 'admin'::text,
    assigned_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    taken_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT substitutions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'Open'::text,
    manager_reply text,
    created_at timestamp with time zone DEFAULT now(),
    response text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_tickets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.syllabus_tracker (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    class text NOT NULL,
    subject text NOT NULL,
    chapters jsonb DEFAULT '[]'::jsonb,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    total_chapters integer DEFAULT 0,
    CONSTRAINT syllabus_tracker_pkey PRIMARY KEY (id)
);

CREATE TABLE public.timetable (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    day text NOT NULL,
    period_order integer NOT NULL,
    period_label text,
    subject text,
    class text,
    teacher text,
    teacher_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_pkey PRIMARY KEY (id)
);

CREATE TABLE public.timetable_free_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    day text NOT NULL,
    period_order integer NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_free_periods_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    fcm_token text NOT NULL,
    platform text NOT NULL,
    device_name text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_device_tokens_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_module_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    user_id uuid,
    module_name text NOT NULL,
    last_viewed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_module_views_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_passkeys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    sign_count bigint DEFAULT 0 NOT NULL,
    device_type text DEFAULT 'platform'::text NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    transports text[] DEFAULT '{}'::text[],
    friendly_name text DEFAULT 'My Device'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_passkeys_pkey PRIMARY KEY (id)
);

CREATE TABLE public.users (
    id uuid NOT NULL,
    school_id uuid,
    role text NOT NULL,
    username text NOT NULL,
    name text NOT NULL,
    class text,
    contact text,
    qualification text,
    aadhar_card text,
    created_at timestamp with time zone DEFAULT now(),
    designation text,
    dob date,
    address text,
    blood_group text,
    email text,
    avatar_url text,
    avatar_file_id text,
    hide_avatar_from_class boolean DEFAULT false,
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_key text NOT NULL,
    challenge text NOT NULL,
    type text DEFAULT 'authentication'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id)
);

-- Table Column Comments
COMMENT ON COLUMN public.announcements.start_date IS 'When this broadcast becomes visible to users.';
COMMENT ON COLUMN public.announcements.expiry_date IS 'When this broadcast stops being visible. NULL = show forever.';
COMMENT ON COLUMN public.gallery.photo_urls IS 'Array of Supabase Storage public URLs for all photos in this event. First item mirrors cover_link.';
COMMENT ON COLUMN public.user_device_tokens.fcm_token IS 'The native FCM registration token generated by Capacitor Push Notifications on Android/iOS.';
COMMENT ON COLUMN public.user_device_tokens.platform IS 'Platform identifier: android | ios | web';
COMMENT ON COLUMN public.users.avatar_url IS 'Google Drive CDN thumbnail URL for the user profile picture';
COMMENT ON COLUMN public.users.avatar_file_id IS 'Google Drive File ID for deletion and cleanup purposes';
COMMENT ON COLUMN public.users.hide_avatar_from_class IS 'Flag for students to hide their avatar from other classmates';

-- Unique & Check Constraints
ALTER TABLE public.user_passkeys ADD CONSTRAINT uq_user_credential UNIQUE (user_id, credential_id);
ALTER TABLE public.app_config ADD CONSTRAINT app_config_key_name_key UNIQUE (key_name);
ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE public.attendance ADD CONSTRAINT attendance_monthly_school_id_user_id_month_year_key UNIQUE (school_id, user_id, month_year);
ALTER TABLE public.academic_archives ADD CONSTRAINT academic_archives_school_id_academic_year_key UNIQUE (school_id, academic_year);
ALTER TABLE public.user_device_tokens ADD CONSTRAINT uq_user_fcm_token UNIQUE (user_id, fcm_token);
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_school_code_key UNIQUE (school_code);
ALTER TABLE public.recovery_profiles ADD CONSTRAINT recovery_profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.recovery_ephemeral_sessions ADD CONSTRAINT recovery_ephemeral_sessions_qr_token_key UNIQUE (qr_token);
ALTER TABLE public.subscription_transactions ADD CONSTRAINT subscription_transactions_razorpay_order_id_key UNIQUE (razorpay_order_id);
ALTER TABLE public.subscription_transactions ADD CONSTRAINT subscription_transactions_razorpay_payment_id_key UNIQUE (razorpay_payment_id);
ALTER TABLE public.login_brute_force_logs ADD CONSTRAINT login_brute_force_logs_username_key UNIQUE (username);
ALTER TABLE public.kb_categories ADD CONSTRAINT kb_categories_name_key UNIQUE (name);
ALTER TABLE public.health_mood_notes ADD CONSTRAINT health_mood_notes_school_id_student_id_month_year_key UNIQUE (school_id, student_id, month_year);
ALTER TABLE public.syllabus_tracker ADD CONSTRAINT syllabus_tracker_school_id_class_subject_key UNIQUE (school_id, class, subject);
ALTER TABLE public.bus_assignments ADD CONSTRAINT bus_assignments_school_id_bus_number_key UNIQUE (school_id, bus_number);
ALTER TABLE public.executive_briefings ADD CONSTRAINT executive_briefings_school_id_date_key UNIQUE (school_id, date);
ALTER TABLE public.timetable_free_periods ADD CONSTRAINT timetable_free_periods_school_id_teacher_id_day_period_orde_key UNIQUE (school_id, teacher_id, day, period_order, date);
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_school_id_original_teacher_id_date_period_ord_key UNIQUE (school_id, original_teacher_id, date, period_order);
ALTER TABLE public.badges_master ADD CONSTRAINT badges_master_school_id_name_tier_key UNIQUE (school_id, name, tier);
ALTER TABLE public.student_achievements ADD CONSTRAINT student_achievements_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'teacher'::text, 'student'::text, 'app_manager'::text, 'staff'::text, 'driver'::text, 'platform_admin'::text])));
ALTER TABLE public.fees_payments ADD CONSTRAINT fees_payments_method_check CHECK ((method = ANY (ARRAY['Cash'::text, 'Online'::text, 'Cheque'::text, 'UPI'::text])));
ALTER TABLE public.notices ADD CONSTRAINT notices_scope_check CHECK ((scope = ANY (ARRAY['all'::text, 'students'::text, 'teachers'::text])));
ALTER TABLE public.leaves ADD CONSTRAINT leaves_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'Approved'::text, 'Rejected'::text])));
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_type_check CHECK ((type = ANY (ARRAY['activity'::text, 'exam'::text, 'holiday'::text])));
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Resolved'::text])));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text])));
ALTER TABLE public.academic_archives ADD CONSTRAINT academic_archives_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text, 'partial'::text])));
ALTER TABLE public.user_device_tokens ADD CONSTRAINT user_device_tokens_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'web'::text])));
ALTER TABLE public.app_notifications_queue ADD CONSTRAINT app_notifications_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.app_notifications_queue ADD CONSTRAINT app_notifications_queue_target_role_check CHECK ((target_role = ANY (ARRAY['all'::text, 'students'::text, 'student'::text, 'teachers'::text, 'teacher'::text, 'admin'::text, 'platform_admin'::text])));
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text, NULL::text])));
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_plan_type_check CHECK ((plan_type = ANY (ARRAY['free'::text, 'trial'::text, 'premium'::text])));
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['Trial'::text, 'Paid'::text, 'Expired'::text, 'Pending'::text, 'Rejected'::text, 'Free'::text, 'VerificationRequested'::text])));
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['Free'::text, 'Trial'::text, 'Premium'::text])));
ALTER TABLE public.subscription_transactions ADD CONSTRAINT subscription_transactions_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCESSFUL'::text, 'FAILED'::text, 'DISPUTED'::text])));
ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_video_type_check CHECK ((video_type = ANY (ARRAY['youtube'::text, 'gdrive'::text])));
ALTER TABLE public.school_registrations ADD CONSTRAINT school_registrations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'verification_requested'::text])));
ALTER TABLE public.complaint_box ADD CONSTRAINT complaint_box_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['admin'::text, 'teacher'::text, 'student'::text])));
ALTER TABLE public.complaint_box ADD CONSTRAINT complaint_box_sender_role_check CHECK ((sender_role = ANY (ARRAY['student'::text, 'teacher'::text, 'admin'::text, 'platform_admin'::text])));
ALTER TABLE public.complaint_box ADD CONSTRAINT complaint_box_status_check CHECK ((status = ANY (ARRAY['unread'::text, 'read'::text, 'replied'::text])));
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_assigned_by_check CHECK ((assigned_by = ANY (ARRAY['admin'::text, 'auto'::text])));
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.badges_master ADD CONSTRAINT badges_master_award_type_check CHECK ((award_type = ANY (ARRAY['manual'::text, 'automated'::text])));
ALTER TABLE public.badges_master ADD CONSTRAINT badges_master_tier_check CHECK ((tier = ANY (ARRAY['class_star'::text, 'school_champion'::text])));

-- Foreign Key Constraints
ALTER TABLE public.password_reset_logs ADD CONSTRAINT password_reset_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_passkeys ADD CONSTRAINT user_passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.fees ADD CONSTRAINT fees_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.fees ADD CONSTRAINT fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.fees_payments ADD CONSTRAINT fees_payments_fee_id_fkey FOREIGN KEY (fee_id) REFERENCES fees(id) ON DELETE CASCADE;
ALTER TABLE public.fees_payments ADD CONSTRAINT fees_payments_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.timetable ADD CONSTRAINT timetable_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.timetable ADD CONSTRAINT timetable_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.notices ADD CONSTRAINT notices_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.leaves ADD CONSTRAINT leaves_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.leaves ADD CONSTRAINT leaves_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.gallery ADD CONSTRAINT gallery_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_monthly_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_monthly_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.academic_archives ADD CONSTRAINT academic_archives_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.academic_archives ADD CONSTRAINT academic_archives_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.user_device_tokens ADD CONSTRAINT user_device_tokens_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE SET NULL;
ALTER TABLE public.user_device_tokens ADD CONSTRAINT user_device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.app_notifications_queue ADD CONSTRAINT app_notifications_queue_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id);
ALTER TABLE public.app_notifications_queue ADD CONSTRAINT app_notifications_queue_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.app_notifications_queue ADD CONSTRAINT app_notifications_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_current_plan_id_fkey FOREIGN KEY (current_plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.recovery_profiles ADD CONSTRAINT recovery_profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.recovery_profiles ADD CONSTRAINT recovery_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.recovery_ephemeral_sessions ADD CONSTRAINT recovery_ephemeral_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.recovery_ephemeral_sessions ADD CONSTRAINT recovery_ephemeral_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.subscription_transactions ADD CONSTRAINT subscription_transactions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.subscription_transactions ADD CONSTRAINT subscription_transactions_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE CASCADE;
ALTER TABLE public.school_registrations ADD CONSTRAINT school_registrations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE public.school_registrations ADD CONSTRAINT school_registrations_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id);
ALTER TABLE public.complaint_box ADD CONSTRAINT complaint_box_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.complaint_box ADD CONSTRAINT complaint_box_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.complaint_box ADD CONSTRAINT complaint_box_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.health_mood_notes ADD CONSTRAINT health_mood_notes_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.health_mood_notes ADD CONSTRAINT health_mood_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.syllabus_tracker ADD CONSTRAINT syllabus_tracker_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.syllabus_tracker ADD CONSTRAINT syllabus_tracker_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public.bus_assignments ADD CONSTRAINT bus_assignments_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.bus_assignments ADD CONSTRAINT bus_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.emergency_alerts ADD CONSTRAINT emergency_alerts_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.emergency_alerts ADD CONSTRAINT emergency_alerts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.lost_and_found ADD CONSTRAINT lost_and_found_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.lost_and_found ADD CONSTRAINT lost_and_found_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.lost_and_found ADD CONSTRAINT lost_and_found_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.executive_briefings ADD CONSTRAINT executive_briefings_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.timetable_free_periods ADD CONSTRAINT timetable_free_periods_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.timetable_free_periods ADD CONSTRAINT timetable_free_periods_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_original_teacher_id_fkey FOREIGN KEY (original_teacher_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.substitutions ADD CONSTRAINT substitutions_substitute_teacher_id_fkey FOREIGN KEY (substitute_teacher_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.badges_master ADD CONSTRAINT badges_master_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.badges_master ADD CONSTRAINT badges_master_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.student_achievements ADD CONSTRAINT student_achievements_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.student_achievements ADD CONSTRAINT student_achievements_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges_master(id) ON DELETE CASCADE;
ALTER TABLE public.student_achievements ADD CONSTRAINT student_achievements_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.student_achievements ADD CONSTRAINT student_achievements_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.badge_visibility_cache ADD CONSTRAINT badge_visibility_cache_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.badge_visibility_cache ADD CONSTRAINT badge_visibility_cache_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_module_views ADD CONSTRAINT user_module_views_school_id_fkey FOREIGN KEY (school_id) REFERENCES school_settings(school_id) ON DELETE CASCADE;
ALTER TABLE public.user_module_views ADD CONSTRAINT user_module_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ==========================================
-- SECTION 2: ROW LEVEL SECURITY ENABLEMENT
-- ==========================================

ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_ephemeral_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_brute_force_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_function_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_mood_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_and_found ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_free_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_visibility_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_views ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- SECTION 3: ROW LEVEL SECURITY POLICIES
-- ==========================================

CREATE POLICY "passkeys: owner delete" ON public.user_passkeys
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((auth.uid() = user_id))
;

CREATE POLICY "passkeys: owner insert" ON public.user_passkeys
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((auth.uid() = user_id))
;

CREATE POLICY "passkeys: owner select" ON public.user_passkeys
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((auth.uid() = user_id))
;

CREATE POLICY "passkeys: owner update" ON public.user_passkeys
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((auth.uid() = user_id))
    WITH CHECK ((auth.uid() = user_id))
;

CREATE POLICY "challenges: owner delete" ON public.webauthn_challenges
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (((auth.uid())::text = owner_key))
;

CREATE POLICY "challenges: owner insert" ON public.webauthn_challenges
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((auth.uid())::text = owner_key))
;

CREATE POLICY "challenges: owner select" ON public.webauthn_challenges
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((auth.uid())::text = owner_key))
;

CREATE POLICY "fees: tenant" ON public.fees
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "fees_payments: tenant" ON public.fees_payments
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "timetable: tenant" ON public.timetable
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "Tenant: notices access" ON public.notices
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((school_id = get_my_school_id()))
    WITH CHECK ((school_id = get_my_school_id()))
;

CREATE POLICY "notices: tenant" ON public.notices
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "calendar_events: tenant" ON public.calendar_events
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "app_config: admin and manager write" ON public.app_config
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['app_manager'::text, 'admin'::text])))
;

CREATE POLICY "app_config: public read" ON public.app_config
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

CREATE POLICY "leaves: tenant" ON public.leaves
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "Platform Admin all tickets" ON public.support_tickets
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((get_my_role() = 'platform_admin'::text))
;

CREATE POLICY "School Admin insert tickets" ON public.support_tickets
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK ((school_id = get_my_school_id()))
;

CREATE POLICY "School Admin read tickets" ON public.support_tickets
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id = get_my_school_id()))
;

CREATE POLICY "support_tickets: tenant" ON public.support_tickets
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "users: admin delete" ON public.users
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text])))
;

CREATE POLICY "users: admin insert" ON public.users
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text])))
;

CREATE POLICY "users: admin update" ON public.users
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text])))
;

CREATE POLICY "users: manager read all" ON public.users
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'app_manager'::text))
;

CREATE POLICY "users: read own row" ON public.users
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((auth.uid() = id))
;

CREATE POLICY "users: read same school" ON public.users
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "users: self update own row" ON public.users
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((auth.uid() = id))
    WITH CHECK ((auth.uid() = id))
;

CREATE POLICY "Tenant: gallery access" ON public.gallery
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((school_id = get_my_school_id()))
    WITH CHECK ((school_id = get_my_school_id()))
;

CREATE POLICY "gallery: tenant" ON public.gallery
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "Admins and teachers can insert notifications" ON public.notifications
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text]))))
;

CREATE POLICY "Tenant: insert notifications" ON public.notifications
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK ((school_id = ( SELECT users.school_id
   FROM users
  WHERE (users.id = auth.uid()))))
;

CREATE POLICY "Tenant: read own notifications" ON public.notifications
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id = get_my_school_id()))
;

CREATE POLICY "Tenant: update own notifications" ON public.notifications
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING ((school_id = get_my_school_id()))
;

CREATE POLICY "notifications: read own" ON public.notifications
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((to_user_id = auth.uid()))
;

CREATE POLICY "notifications: tenant insert" ON public.notifications
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "notifications: update own" ON public.notifications
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((to_user_id = auth.uid()))
;

CREATE POLICY "Allow users to read active announcements" ON public.announcements
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((expiry_date IS NULL) OR ((now() >= COALESCE(start_date, created_at)) AND (now() <= expiry_date))))
;

CREATE POLICY "Auth read announcements" ON public.announcements
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((auth.role() = 'authenticated'::text))
;

CREATE POLICY "Platform Admin all announcements" ON public.announcements
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Platform admin manages announcements" ON public.announcements
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Platform Admin update platform_settings" ON public.platform_settings
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Platform admin: update platform settings" ON public.platform_settings
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
    WITH CHECK ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
;

CREATE POLICY "Public read platform_settings" ON public.platform_settings
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

CREATE POLICY "attendance_insert_staff" ON public.attendance
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.role = ANY (ARRAY['platform_admin'::text, 'app_manager'::text])) OR ((users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'staff'::text])) AND (users.school_id = attendance.school_id)))))))
;

CREATE POLICY "attendance_read_own" ON public.attendance
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((user_id = auth.uid()))
;

CREATE POLICY "attendance_read_staff" ON public.attendance
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.role = ANY (ARRAY['platform_admin'::text, 'app_manager'::text])) OR ((users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'staff'::text])) AND (users.school_id = attendance.school_id)))))))
;

CREATE POLICY "attendance_update_staff" ON public.attendance
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.role = ANY (ARRAY['platform_admin'::text, 'app_manager'::text])) OR ((users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'staff'::text])) AND (users.school_id = attendance.school_id)))))))
;

CREATE POLICY "Platform Admin all payment requests" ON public.payment_requests
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((get_my_role() = 'platform_admin'::text))
;

CREATE POLICY "School can manage own payment requests" ON public.payment_requests
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((school_id = get_my_school_id()))
    WITH CHECK ((school_id = get_my_school_id()))
;

CREATE POLICY "academic_archives: admin insert" ON public.academic_archives
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
;

CREATE POLICY "academic_archives: admin read" ON public.academic_archives
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
;

CREATE POLICY "users_manage_own_tokens" ON public.user_device_tokens
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((user_id = auth.uid()))
    WITH CHECK ((user_id = auth.uid()))
;

CREATE POLICY "users_read_own_tokens" ON public.user_device_tokens
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((user_id = auth.uid()))
;

CREATE POLICY "app_versions: authenticated read" ON public.app_versions
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (true)
;

CREATE POLICY "app_versions: platform_admin write" ON public.app_versions
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Admin: read own school audit logs" ON public.audit_logs
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((school_id = get_my_school_id()) AND (get_my_role() = 'admin'::text)))
;

CREATE POLICY "Authenticated: insert audit logs for own school" ON public.audit_logs
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK ((school_id = get_my_school_id()))
;

CREATE POLICY "Platform admin: read all audit logs" ON public.audit_logs
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((get_my_role() = 'platform_admin'::text))
;

CREATE POLICY "Admin: update own school settings" ON public.school_settings
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (((school_id = get_my_school_id()) AND (get_my_role() = 'admin'::text)))
;

CREATE POLICY "Manager: full school settings access" ON public.school_settings
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true)
;

CREATE POLICY "Platform admin: read all school settings" ON public.school_settings
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((get_my_role() = 'platform_admin'::text))
;

CREATE POLICY "Platform admin: update any school settings" ON public.school_settings
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING ((get_my_role() = 'platform_admin'::text))
;

CREATE POLICY "Public: read school by code" ON public.school_settings
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

CREATE POLICY "Schools can view their own settings" ON public.school_settings
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id IN ( SELECT users.school_id
   FROM users
  WHERE (users.id = auth.uid()))))
;

CREATE POLICY "Tenant: read own school settings" ON public.school_settings
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id = get_my_school_id()))
;

CREATE POLICY "school_settings: admin update" ON public.school_settings
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)))
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)))
;

CREATE POLICY "school_settings: manager write" ON public.school_settings
    AS PERMISSIVE
    FOR ALL
    TO public
    USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'app_manager'::text))
;

CREATE POLICY "school_settings: public read" ON public.school_settings
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

CREATE POLICY "Admins can view their school's notification queue" ON public.app_notifications_queue
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)))
;

CREATE POLICY "Platform admin can insert notifications" ON public.app_notifications_queue
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'platform_admin'::text))
;

CREATE POLICY "Staff can insert notifications" ON public.app_notifications_queue
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'teacher'::text, 'staff'::text, 'app_manager'::text, 'platform_admin'::text]))))
;

CREATE POLICY "profiles: owner insert" ON public.recovery_profiles
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((auth.uid() = user_id))
;

CREATE POLICY "profiles: owner select" ON public.recovery_profiles
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((auth.uid() = user_id))
;

CREATE POLICY "profiles: owner update" ON public.recovery_profiles
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((auth.uid() = user_id))
    WITH CHECK ((auth.uid() = user_id))
;

CREATE POLICY "Platform admin: read all transactions" ON public.subscription_transactions
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
;

CREATE POLICY "School admin: read own transactions" ON public.subscription_transactions
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((school_id = get_my_school_id()) AND (get_my_role() = 'admin'::text)))
;

CREATE POLICY "Schools can view their own transactions" ON public.subscription_transactions
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id IN ( SELECT users.school_id
   FROM users
  WHERE (users.id = auth.uid()))))
;

CREATE POLICY "Platform admin: delete plans" ON public.subscription_plans
    AS PERMISSIVE
    FOR DELETE
    TO authenticated
    USING ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
;

CREATE POLICY "Platform admin: insert plans" ON public.subscription_plans
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
;

CREATE POLICY "Platform admin: read all plans" ON public.subscription_plans
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
;

CREATE POLICY "Platform admin: update plans" ON public.subscription_plans
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING ((( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = 'platform_admin'::text))
;

CREATE POLICY "Schools: read active plans" ON public.subscription_plans
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((is_active = true) AND (( SELECT users.role
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'teacher'::text, 'student'::text]))))
;

CREATE POLICY "Anyone can submit a school registration" ON public.school_registrations
    AS PERMISSIVE
    FOR INSERT
    TO anon, authenticated
    WITH CHECK ((terms_accepted = true))
;

CREATE POLICY "Platform admin manages registrations" ON public.school_registrations
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Authenticated users can read kb_categories" ON public.kb_categories
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (true)
;

CREATE POLICY "Platform admin manages kb_categories" ON public.kb_categories
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Authenticated users can read published kb_articles" ON public.kb_articles
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((is_published = true))
;

CREATE POLICY "Platform admin manages kb_articles" ON public.kb_articles
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'platform_admin'::text)))))
;

CREATE POLICY "Allow authenticated select on edge_function_usage" ON public.edge_function_usage
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

CREATE POLICY "Allow public insert on edge_function_usage" ON public.edge_function_usage
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (true)
;

CREATE POLICY "syllabus_tracker_all" ON public.syllabus_tracker
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'platform_admin'::text, 'teacher'::text]))))
;

CREATE POLICY "syllabus_tracker_select" ON public.syllabus_tracker
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id = get_my_school_id()))
;

CREATE POLICY "complaint_box_insert" ON public.complaint_box
    AS PERMISSIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (((school_id = get_my_school_id()) AND (sender_id = auth.uid())))
;

CREATE POLICY "complaint_box_select_admin" ON public.complaint_box
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((get_my_role() = ANY (ARRAY['platform_admin'::text, 'app_manager'::text])) OR ((get_my_role() = 'admin'::text) AND (school_id = get_my_school_id()))))
;

CREATE POLICY "complaint_box_select_recipient" ON public.complaint_box
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((recipient_id = auth.uid()))
;

CREATE POLICY "complaint_box_select_sender" ON public.complaint_box
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((sender_id = auth.uid()))
;

CREATE POLICY "complaint_box_update" ON public.complaint_box
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (((recipient_id = auth.uid()) OR (get_my_role() = ANY (ARRAY['platform_admin'::text, 'app_manager'::text])) OR ((get_my_role() = 'admin'::text) AND (school_id = get_my_school_id()))))
;

CREATE POLICY "health_mood_notes_all" ON public.health_mood_notes
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'platform_admin'::text, 'student'::text, 'teacher'::text]))))
;

CREATE POLICY "health_mood_notes_select" ON public.health_mood_notes
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING ((school_id = get_my_school_id()))
;

CREATE POLICY "Bus Assignments: Admin Full Access" ON public.bus_assignments
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)))
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)))
;

CREATE POLICY "Bus Assignments: Driver Read Own" ON public.bus_assignments
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((driver_id = auth.uid()) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'driver'::text)))
;

CREATE POLICY "Bus Assignments: Teacher/Staff Read School" ON public.bus_assignments
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['teacher'::text, 'staff'::text, 'student'::text]))))
;

CREATE POLICY "Executive Briefing: Admin Read" ON public.executive_briefings
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'platform_admin'::text]))))
;

CREATE POLICY "Emergency Alerts: Admin Update" ON public.emergency_alerts
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'platform_admin'::text]))))
;

CREATE POLICY "Emergency Alerts: Authorized Insert" ON public.emergency_alerts
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) <> 'student'::text) AND (sender_id = auth.uid())))
;

CREATE POLICY "Emergency Alerts: Read Access" ON public.emergency_alerts
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "Lost & Found: Delete Access" ON public.lost_and_found
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND ((auth.uid() = reported_by) OR (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'platform_admin'::text])))))
;

CREATE POLICY "Lost & Found: Insert Access" ON public.lost_and_found
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (auth.uid() = reported_by)))
;

CREATE POLICY "Lost & Found: Read Access" ON public.lost_and_found
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "Lost & Found: Update Access" ON public.lost_and_found
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "free_periods: admin manage" ON public.timetable_free_periods
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)))
;

CREATE POLICY "free_periods: school read" ON public.timetable_free_periods
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "free_periods: teacher delete" ON public.timetable_free_periods
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (teacher_id = auth.uid())))
;

CREATE POLICY "free_periods: teacher insert" ON public.timetable_free_periods
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (teacher_id = auth.uid())))
;

CREATE POLICY "substitutions: admin manage" ON public.substitutions
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'platform_admin'::text]))))
;

CREATE POLICY "substitutions: school read" ON public.substitutions
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "substitutions: sub teacher update" ON public.substitutions
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (substitute_teacher_id = auth.uid())))
;

CREATE POLICY "badges_master: admin write" ON public.badges_master
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
;

CREATE POLICY "badges_master: school read" ON public.badges_master
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "badges_master: teacher create custom" ON public.badges_master
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'teacher'::text) AND (custom_scope_class = ( SELECT users.class
   FROM users
  WHERE (users.id = auth.uid()))) AND (tier = 'class_star'::text)))
;

CREATE POLICY "badges_master: teacher delete own custom" ON public.badges_master
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'teacher'::text) AND (custom_scope_class = ( SELECT users.class
   FROM users
  WHERE (users.id = auth.uid()))) AND (created_by = auth.uid())))
;

CREATE POLICY "badges_master: teacher manage own custom" ON public.badges_master
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'teacher'::text) AND (custom_scope_class = ( SELECT users.class
   FROM users
  WHERE (users.id = auth.uid()))) AND (created_by = auth.uid())))
;

CREATE POLICY "achievements: admin insert champion" ON public.student_achievements
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
;

CREATE POLICY "achievements: admin read all" ON public.student_achievements
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
;

CREATE POLICY "achievements: admin update" ON public.student_achievements
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))))
;

CREATE POLICY "achievements: student read own" ON public.student_achievements
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((student_id = auth.uid()) AND (is_active = true)))
;

CREATE POLICY "achievements: teacher insert class_star" ON public.student_achievements
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'teacher'::text) AND (class_name = ( SELECT users.class
   FROM users
  WHERE (users.id = auth.uid())))))
;

CREATE POLICY "achievements: teacher read class" ON public.student_achievements
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'teacher'::text) AND (class_name = ( SELECT users.class
   FROM users
  WHERE (users.id = auth.uid()))) AND (is_active = true)))
;

CREATE POLICY "badge_cache: school read" ON public.badge_visibility_cache
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((school_id = (((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))::uuid))
;

CREATE POLICY "Users can insert their own module views" ON public.user_module_views
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK ((auth.uid() = user_id))
;

CREATE POLICY "Users can update their own module views" ON public.user_module_views
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING ((auth.uid() = user_id))
;

CREATE POLICY "Users can view their own module views" ON public.user_module_views
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING ((auth.uid() = user_id))
;

-- ==========================================
-- SECTION 4: CUSTOM FUNCTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_webauthn_challenges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE expires_at < now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_name text;
BEGIN
    IF NEW.status = 'Absent' THEN
        SELECT name INTO v_user_name FROM public.users WHERE id = NEW.user_id;
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route)
        VALUES (NEW.school_id, NEW.user_id, 'Attendance Alert', 'Hi ' || v_user_name || ', you have been marked absent today. Please provide a valid reason or leave application.', '/attendance');
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_user(p_email text, p_password text, p_role text, p_name text, p_username text, p_school_id uuid, p_class text DEFAULT NULL::text, p_contact text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_uid       uuid;
    caller_role   text;
    caller_school uuid;
BEGIN
    caller_role   := (auth.jwt() -> 'user_metadata' ->> 'role');
    caller_school := (auth.jwt() -> 'user_metadata' ->> 'school_id')::uuid;

    IF caller_role NOT IN ('admin', 'app_manager') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or managers can create users.';
    END IF;
    IF caller_role = 'admin' AND caller_school != p_school_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create users for your own school.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username) THEN
        RAISE EXCEPTION 'Username "%" is already taken.', p_username;
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
        RAISE EXCEPTION 'Email "%" is already registered.', p_email;
    END IF;
    IF p_role NOT IN ('admin', 'teacher', 'student') THEN
        RAISE EXCEPTION 'Invalid role. Allowed: admin, teacher, student.';
    END IF;

    new_uid := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_uid, 'authenticated', 'authenticated', p_email,
        crypt(p_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('school_id', p_school_id, 'role', p_role),
        now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), new_uid, p_email,
        jsonb_build_object('sub', new_uid::text, 'email', p_email),
        'email', now(), now(), now()
    );

    INSERT INTO public.users (id, school_id, role, username, name, class, contact)
    VALUES (new_uid, p_school_id, p_role, p_username, p_name, p_class, p_contact);

    RETURN new_uid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_password_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Check if encrypted_password has changed
  IF (TG_OP = 'UPDATE' AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password) THEN
    -- Update or insert password_updated_at in recovery_profiles
    INSERT INTO public.recovery_profiles (user_id, password_updated_at, updated_at)
    VALUES (NEW.id, now(), now())
    ON CONFLICT (user_id) DO UPDATE 
    SET password_updated_at = EXCLUDED.password_updated_at,
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_school_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT school_id FROM public.users WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.users WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_fees_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_student record;
    v_total_paid numeric;
    v_remaining numeric;
BEGIN
    -- Fetch student info and fee details
    SELECT student_id, total, last_year_pending INTO v_student FROM public.fees WHERE id = NEW.fee_id;
    
    IF v_student.student_id IS NOT NULL THEN
        -- Calculate total paid
        SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM public.fees_payments WHERE fee_id = NEW.fee_id;
        
        -- Calculate remaining
        v_remaining := (v_student.total + v_student.last_year_pending) - v_total_paid;
        
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route)
        VALUES (NEW.school_id, v_student.student_id, 'Payment Received', 'Your fee payment of ₹' || NEW.amount || ' via ' || NEW.method || ' has been successfully recorded. Your remaining balance is ₹' || v_remaining, '/fees');
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_support_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Notify Platform Admin (Global so school_id is null or kept as context)
        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route)
        VALUES (NEW.school_id, 'platform_admin', 'New Support Ticket', 'A new ticket has been raised: ' || NEW.subject, '/support');
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status AND NEW.status = 'Resolved' THEN
            -- Notify School Admin
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route)
            VALUES (NEW.school_id, 'admin', 'Ticket Resolved', 'Your support ticket "' || NEW.subject || '" has been resolved.', '/support');
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_app_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Global notification
    INSERT INTO public.app_notifications_queue (target_role, title, body, route)
    VALUES ('all', 'App Update Available', 'A new version (' || NEW.version_name || ') of SchoolOS+ is available! Please update for the best experience.', '/settings');
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_school_by_code(p_school_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'school_id',           school_id,
    'name',                name,
    'school_code',         school_code,
    'logo_url',            logo_url,
    'subscription_status', subscription_status,
    'subscription_tier',   subscription_tier,
    'plan_type',           plan_type,
    'classes',             classes,
    'modules_active',      modules_active
    -- NOTE: gdrive_config intentionally EXCLUDED
  )
  INTO v_result
  FROM public.school_settings
  WHERE UPPER(school_code) = UPPER(p_school_code)
  LIMIT 1;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_platform_analytics()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    caller_role TEXT;
    total_schools INT;
    total_students INT;
    total_teachers INT;
    premium_schools INT;
BEGIN
    -- Verify caller is platform_admin
    SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
    IF caller_role != 'platform_admin' THEN
        RAISE EXCEPTION 'Access denied: platform_admin role required';
    END IF;

    SELECT count(*) INTO total_schools FROM public.school_settings;
    SELECT count(*) INTO premium_schools FROM public.school_settings WHERE subscription_tier = 'Premium';
    SELECT count(*) INTO total_students FROM public.users WHERE role = 'student';
    SELECT count(*) INTO total_teachers FROM public.users WHERE role = 'teacher';

    RETURN json_build_object(
        'total_schools', total_schools,
        'premium_schools', premium_schools,
        'total_students', total_students,
        'total_teachers', total_teachers
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_gallery_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route)
    VALUES (NEW.school_id, 'all', 'New Event Added', 'A new event has been added to the gallery: ' || NEW.title || '. Check it out now!', '/gallery');
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_plan(p_school_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_plan_type      TEXT;
  v_trial_start    TIMESTAMPTZ;
  v_trial_end      TIMESTAMPTZ;
  v_sub_end        TIMESTAMPTZ;
BEGIN
  SELECT plan_type, trial_start_date, subscription_end_date
  INTO   v_plan_type, v_trial_start, v_sub_end
  FROM   public.school_settings
  WHERE  school_id = p_school_id;

  -- Trial auto-downgrade: 28-day window expired → revert to free
  IF v_plan_type = 'trial' THEN
    v_trial_end := v_trial_start + INTERVAL '28 days';
    IF v_trial_end < now() THEN
      UPDATE public.school_settings
        SET plan_type        = 'free',
            subscription_tier = 'Free',
            billing_cycle    = NULL,
            trial_start_date = NULL
        WHERE school_id = p_school_id;
      RETURN 'free';
    END IF;
  END IF;

  -- Premium expiry check (if subscription_end_date is set and passed)
  IF v_plan_type = 'premium' AND v_sub_end IS NOT NULL AND v_sub_end < now() THEN
    UPDATE public.school_settings
      SET plan_type        = 'free',
          subscription_tier = 'Free',
          billing_cycle    = NULL,
          subscription_end_date = NULL
      WHERE school_id = p_school_id;
    RETURN 'free';
  END IF;

  RETURN COALESCE(v_plan_type, 'free');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_transaction_modtime()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_delete_school(p_school_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.check_and_award_streak_badges(p_school_id uuid, p_class_name text, p_month_year text)
 RETURNS TABLE(student_id uuid, badge_awarded boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_streak_badge_id uuid;
    v_student         RECORD;
    v_att_data        jsonb;
    v_day_keys        text[];    -- compressed day keys e.g. {"1","7","31"}
    v_iso_dates       date[];    -- reconstructed full dates for streak math
    v_streak          int;
    v_i               int;
    v_week_key        text;
    v_idempotency_key text;
    v_awarded         boolean;
    v_day_key         text;
BEGIN
    -- Find the 7-day streak badge for this school
    SELECT id INTO v_streak_badge_id
    FROM public.badges_master
    WHERE school_id = p_school_id
      AND award_type = 'automated'
      AND auto_rule->>'type' = 'attendance_streak'
      AND (auto_rule->>'days')::int = 7
      AND is_active = true
    LIMIT 1;

    IF v_streak_badge_id IS NULL THEN
        RETURN; -- Badge not configured for this school yet
    END IF;

    -- ISO week key for idempotency (one award per week per student)
    v_week_key := to_char(now(), 'IYYY-IW');

    -- Loop over each student in this class
    FOR v_student IN
        SELECT u.id AS uid
        FROM public.users u
        WHERE u.school_id = p_school_id
          AND u.class = p_class_name
          AND u.role = 'student'
    LOOP
        v_awarded := false;
        v_idempotency_key := v_student.uid::text || '_streak7_' || v_week_key;

        -- Skip if already awarded this week
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM public.student_achievements
            WHERE idempotency_key = v_idempotency_key
        );

        -- Fetch the student's monthly attendance JSONB
        SELECT attendance_data INTO v_att_data
        FROM public.attendance
        WHERE school_id = p_school_id
          AND user_id = v_student.uid
          AND month_year = p_month_year
        LIMIT 1;

        IF v_att_data IS NULL THEN
            CONTINUE;
        END IF;

        -- ── v84 CODEC FIX ─────────────────────────────────────────────────────
        -- After v82 compression, keys are day-number strings ("1"–"31")
        -- and values are single-char codes ("P"=Present, "A"=Absent, etc.).
        -- We filter for value = 'P' (was 'Present') and reconstruct full
        -- ISO date strings from the parent row's month_year column BEFORE
        -- performing date arithmetic.
        -- ─────────────────────────────────────────────────────────────────────

        -- Extract day keys where student was Present (value = 'P'), sorted by day number
        SELECT ARRAY(
            SELECT key
            FROM jsonb_each_text(v_att_data)
            WHERE value = 'P'   -- ← was 'Present' in v65; fixed for v82 compression
            ORDER BY key::integer ASC
        ) INTO v_day_keys;

        IF array_length(v_day_keys, 1) IS NULL OR array_length(v_day_keys, 1) < 7 THEN
            CONTINUE;
        END IF;

        -- Reconstruct full ISO dates from month_year + day key for date arithmetic
        -- e.g. p_month_year='2026-05', key='7' → '2026-05-07'::date
        SELECT ARRAY(
            SELECT (p_month_year || '-' || lpad(d, 2, '0'))::date
            FROM unnest(v_day_keys) AS d
            ORDER BY (p_month_year || '-' || lpad(d, 2, '0'))::date ASC
        ) INTO v_iso_dates;

        -- Count max consecutive calendar days (school days: Mon–Fri)
        v_streak := 1;
        FOR v_i IN 2..array_length(v_iso_dates, 1) LOOP
            IF (v_iso_dates[v_i] - v_iso_dates[v_i-1]) = 1
               OR (
                  -- Monday after Friday: gap of 3 calendar days is still consecutive
                  EXTRACT(DOW FROM v_iso_dates[v_i]) = 1
                  AND (v_iso_dates[v_i] - v_iso_dates[v_i-1]) = 3
               )
            THEN
                v_streak := v_streak + 1;
                IF v_streak >= 7 THEN
                    -- Award the badge
                    INSERT INTO public.student_achievements
                        (school_id, student_id, badge_id, class_name, awarded_by,
                         academic_year, note, idempotency_key)
                    VALUES (
                        p_school_id, v_student.uid, v_streak_badge_id, p_class_name,
                        auth.uid(),
                        to_char(now(), 'YYYY'),
                        'Awarded automatically for 7 consecutive school-day attendance.',
                        v_idempotency_key
                    )
                    ON CONFLICT (idempotency_key) DO NOTHING;

                    -- Rebuild cache for this student
                    PERFORM public.rebuild_badge_cache(v_student.uid);

                    -- Queue push notification
                    INSERT INTO public.app_notifications_queue
                        (school_id, user_id, title, body, route, is_ephemeral, status)
                    VALUES (
                        p_school_id,
                        v_student.uid,
                        '⭐ New Badge Earned!',
                        'Congratulations! You earned the "7-Day Attendance Streak" star badge.',
                        '/achievements',
                        true,
                        'pending'
                    );

                    v_awarded := true;
                    EXIT; -- Stop counting for this student once streak is found
                END IF;
            ELSE
                v_streak := 1; -- Reset streak on gap
            END IF;
        END LOOP;

        student_id    := v_student.uid;
        badge_awarded := v_awarded;
        RETURN NEXT;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_academic_year(p_school_id uuid, p_year text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role       text;
    v_caller_id         uuid;
    v_current_year      text;
    v_snapshot          jsonb;
    v_att_data          jsonb;
    v_ach_data          jsonb;
    v_leave_data        jsonb;
    v_att_count         int;
    v_ach_count         int;
    v_leave_count       int;
    v_student_count     int;
    v_storage_path      text;
    v_snapshot_bytes    bigint;
    v_row_counts        jsonb;
    v_month_prefix      text;
    v_school_name       text;
BEGIN
    -- ── Security Gate ────────────────────────────────────────────────────────
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
    v_caller_id   := auth.uid();

    IF v_caller_role NOT IN ('admin', 'app_manager') THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Unauthorized. Only admin or app_manager can archive data.'
        );
    END IF;

    -- ── Safety: Prevent archiving the current year ────────────────────────
    v_current_year := to_char(now(), 'YYYY');
    IF p_year >= v_current_year THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Cannot archive the current or future academic year. Archive is only for past years.'
        );
    END IF;

    -- ── Duplicate Check ───────────────────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM public.academic_archives
        WHERE school_id = p_school_id AND academic_year = p_year
    ) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Academic year ' || p_year || ' has already been archived for this school.'
        );
    END IF;

    -- ── Get school name for metadata ──────────────────────────────────────
    SELECT name INTO v_school_name FROM public.school_settings WHERE school_id = p_school_id;

    -- ── Step 1: Collect Attendance Data for the Year ───────────────────────
    -- attendance.month_year format: 'YYYY-MM' — filter by year prefix 'YYYY-'
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'user_id',         user_id,
                'month_year',      month_year,
                'attendance_data', attendance_data
            )
        ), '[]'::jsonb),
        COUNT(*)::int
    INTO v_att_data, v_att_count
    FROM public.attendance
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = false;

    -- ── Step 2: Collect Student Achievements for the Year ─────────────────
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',             sa.id,
                'student_id',     sa.student_id,
                'badge_id',       sa.badge_id,
                'badge_name',     bm.name,
                'class_name',     sa.class_name,
                'awarded_by',     sa.awarded_by,
                'awarded_at',     sa.awarded_at,
                'academic_year',  sa.academic_year,
                'note',           sa.note
            )
        ), '[]'::jsonb),
        COUNT(*)::int
    INTO v_ach_data, v_ach_count
    FROM public.student_achievements sa
    LEFT JOIN public.badges_master bm ON bm.id = sa.badge_id
    WHERE sa.school_id = p_school_id
      AND sa.academic_year = p_year;

    -- ── Step 3: Collect Leave Requests for the Year (if table has data) ───
    SELECT
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',          lr.id,
                'user_id',     lr.user_id,
                'start_date',  lr.start_date,
                'end_date',    lr.end_date,
                'reason',      lr.reason,
                'status',      lr.status,
                'created_at',  lr.created_at
            )
        ), '[]'::jsonb),
        COUNT(*)::int
    INTO v_leave_data, v_leave_count
    FROM public.leave_requests lr
    WHERE lr.school_id = p_school_id
      AND to_char(lr.created_at, 'YYYY') = p_year;

    -- ── Step 4: Count unique students in the snapshot ─────────────────────
    SELECT COUNT(DISTINCT user_id)::int INTO v_student_count
    FROM public.attendance
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = false;

    -- ── Step 5: Build the unified JSON snapshot ───────────────────────────
    v_snapshot := jsonb_build_object(
        'archive_version',  '1.0',
        'school_id',        p_school_id,
        'school_name',      v_school_name,
        'academic_year',    p_year,
        'archived_at',      now(),
        'archived_by',      v_caller_id,
        'student_count',    v_student_count,
        'attendance',       v_att_data,
        'achievements',     v_ach_data,
        'leave_requests',   v_leave_data
    );

    v_snapshot_bytes := octet_length(v_snapshot::text);

    -- ── Step 6: Define the storage path ──────────────────────────────────
    -- Format: {school_id}/{year}_snapshot.json
    v_storage_path := p_school_id::text || '/' || p_year || '_snapshot.json';

    -- ── Step 7: Soft-delete archived attendance rows ──────────────────────
    -- Mark as archived=true instead of hard-deleting, so admin can verify
    -- the archive file before committing to the purge.
    UPDATE public.attendance
    SET archived = true
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = false;

    -- ── Step 8: Soft-deactivate achievements ─────────────────────────────
    -- student_achievements already has is_active flag.
    -- We don't delete achievements — they are permanent academic records.
    -- The archive snapshot captures them; the live rows stay for reference.
    -- (No DELETE here — achievements are low-volume and permanent by design.)

    -- ── Step 9: Build row_counts summary ─────────────────────────────────
    v_row_counts := jsonb_build_object(
        'attendance',    v_att_count,
        'achievements',  v_ach_count,
        'leave_requests', v_leave_count
    );

    -- ── Step 10: Record the archive in the tracking table ─────────────────
    INSERT INTO public.academic_archives (
        school_id, academic_year, archived_by, storage_path,
        snapshot_size_bytes, student_count, row_counts, status
    )
    VALUES (
        p_school_id, p_year, v_caller_id, v_storage_path,
        v_snapshot_bytes, v_student_count, v_row_counts, 'completed'
    );

    -- ── Step 11: Return success + the snapshot payload ────────────────────
    -- The frontend is responsible for uploading the snapshot to Storage.
    -- We return the snapshot data + metadata so the frontend can:
    --   1. Create a Blob from the snapshot JSON
    --   2. Upload it to Supabase Storage bucket 'academic-archives' at storage_path
    --   3. Show a success confirmation to the admin
    RETURN jsonb_build_object(
        'status',        'ok',
        'message',       'Academic year ' || p_year || ' archived successfully. ' ||
                         v_att_count || ' attendance records, ' ||
                         v_ach_count || ' achievements, ' ||
                         v_leave_count || ' leave requests archived for ' ||
                         v_student_count || ' students.',
        'storage_path',  v_storage_path,
        'row_counts',    v_row_counts,
        'student_count', v_student_count,
        'snapshot',      v_snapshot
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status',  'error',
        'message', 'Archive failed: ' || SQLERRM
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_device_token(p_user_id uuid, p_school_id uuid, p_fcm_token text, p_platform text, p_device_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_device_tokens
    (user_id, school_id, fcm_token, platform, device_name, last_seen_at)
  VALUES
    (p_user_id, p_school_id, p_fcm_token, p_platform, p_device_name, now())
  ON CONFLICT (user_id, fcm_token)
  DO UPDATE SET
    school_id     = EXCLUDED.school_id,
    platform      = EXCLUDED.platform,
    device_name   = EXCLUDED.device_name,
    last_seen_at  = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_missing_attendance_radar(p_school_id uuid)
 RETURNS TABLE(teacher_id uuid, teacher_name text, class_name text, subject_name text, period_order integer, period_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_today_day text := trim(to_char(CURRENT_DATE, 'Day'));   -- e.g. 'Thursday'
    v_today_iso text := to_char(CURRENT_DATE, 'YYYY-MM-DD'); -- e.g. '2026-06-18'
    v_today_day_key text := EXTRACT(DAY FROM CURRENT_DATE)::integer::text; -- e.g. '18' (no leading zero)
    v_month_year text := to_char(CURRENT_DATE, 'YYYY-MM');   -- e.g. '2026-06'
BEGIN
    RETURN QUERY
    SELECT
        u.id          AS teacher_id,
        u.name        AS teacher_name,
        t.class       AS class_name,
        t.subject     AS subject_name,
        t.period_order,
        t.period_label
    FROM public.timetable t
    -- ── SAFE JOIN: handles both UUID and name-string teacher values ──
    -- Casting the UUID id to text is always safe and prevents any type-casting crashes.
    JOIN public.users u ON (
        t.teacher = u.id::text
        OR (LOWER(TRIM(t.teacher)) = LOWER(TRIM(u.name)) AND u.role = 'teacher')
    )
    WHERE t.school_id = p_school_id
      AND t.day = v_today_day
      AND u.school_id = p_school_id
      -- ── CHECK: has ANY student in this class been marked today? ──
      AND NOT EXISTS (
          SELECT 1
          FROM public.attendance a
          JOIN public.users su ON a.user_id = su.id
          WHERE a.school_id = p_school_id
            AND a.month_year = v_month_year
            AND su.class = t.class
            AND su.role = 'student'
            AND (a.attendance_data ? v_today_day_key OR a.attendance_data ? v_today_iso)
      )
    ORDER BY t.period_order ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_complaint_box_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_sessions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.recovery_ephemeral_sessions
  WHERE expires_at < now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user(p_user_id uuid, p_email text, p_username text, p_name text, p_role text, p_class text DEFAULT NULL::text, p_contact text DEFAULT NULL::text, p_dob date DEFAULT NULL::date, p_address text DEFAULT NULL::text, p_blood_group text DEFAULT NULL::text, p_qualification text DEFAULT NULL::text, p_aadhar_card text DEFAULT NULL::text, p_designation text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    caller_role   text;
    caller_school uuid;
    target_school uuid;
BEGIN
    -- Verify caller roles
    SELECT role, school_id INTO caller_role, caller_school 
    FROM public.users WHERE id = auth.uid();

    IF caller_role NOT IN ('admin', 'app_manager', 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or managers can update users.';
    END IF;

    -- Verify school boundaries (prevent cross-tenant edits)
    SELECT school_id INTO target_school FROM public.users WHERE id = p_user_id;
    
    IF caller_role = 'admin' AND caller_school != target_school THEN
        RAISE EXCEPTION 'Unauthorized: You can only update users within your own school.';
    END IF;

    -- Verify username uniqueness
    IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username AND id != p_user_id) THEN
        RAISE EXCEPTION 'Username "%" is already taken.', p_username;
    END IF;

    -- Verify email uniqueness
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email AND id != p_user_id) THEN
        RAISE EXCEPTION 'Email "%" is already registered.', p_email;
    END IF;

    -- Update auth schemas
    UPDATE auth.users
    SET email = p_email,
        raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', p_role)
    WHERE id = p_user_id;

    UPDATE auth.identities
    SET identity_data = identity_data || jsonb_build_object('email', p_email),
        provider_id = p_email
    WHERE user_id = p_user_id AND provider = 'email';

    -- Update public schema
    UPDATE public.users
    SET name = p_name,
        username = p_username,
        email = p_email,
        role = p_role,
        class = p_class,
        contact = p_contact,
        dob = p_dob,
        address = p_address,
        blood_group = p_blood_group,
        qualification = p_qualification,
        aadhar_card = p_aadhar_card,
        designation = p_designation
    WHERE id = p_user_id;

    -- Reload postgrest schemas
    NOTIFY pgrst, 'reload schema';
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Only sync if email actually changed (avoids unnecessary writes)
  IF OLD IS NULL OR OLD.email IS DISTINCT FROM NEW.email THEN

    -- 1. Sync to public.users
    UPDATE public.users
    SET email = NEW.email
    WHERE id = NEW.id;

    -- 2. Sync to auth.identities (only for email/password provider logins)
    UPDATE auth.identities
    SET identity_data = identity_data || jsonb_build_object('email', NEW.email),
        provider_id = NEW.email
    WHERE user_id = NEW.id AND provider = 'email';

  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- If it's an OAuth/Google signup (and not email/password created by admin)
  IF NEW.raw_app_meta_data->>'provider' != 'email' THEN
    -- Check if this email exists in public.users
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE email = LOWER(NEW.email)) THEN
      RAISE EXCEPTION 'Signup is disabled. Only pre-registered users can sign in with Google.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_user(p_email text, p_password text, p_role text, p_name text, p_username text, p_school_id uuid, p_class text DEFAULT NULL::text, p_contact text DEFAULT NULL::text, p_dob date DEFAULT NULL::date, p_address text DEFAULT NULL::text, p_blood_group text DEFAULT NULL::text, p_designation text DEFAULT NULL::text, p_qualification text DEFAULT NULL::text, p_aadhar_card text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_uid       uuid;
    caller_role   text;
    caller_school uuid;
BEGIN
    SELECT role, school_id INTO caller_role, caller_school 
    FROM public.users WHERE id = auth.uid();

    IF caller_role NOT IN ('admin', 'app_manager', 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or managers can create users.';
    END IF;
    
    IF caller_role = 'admin' AND caller_school != p_school_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create users for your own school.';
    END IF;
    
    IF EXISTS (SELECT 1 FROM public.users WHERE username = p_username) THEN
        RAISE EXCEPTION 'Username "%" is already taken.', p_username;
    END IF;
    
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
        RAISE EXCEPTION 'Email "%" is already registered.', p_email;
    END IF;
    
    IF p_role NOT IN ('admin', 'teacher', 'student', 'staff', 'driver') THEN
        RAISE EXCEPTION 'Invalid role. Allowed: admin, teacher, student, staff, driver.';
    END IF;

    new_uid := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_uid, 'authenticated', 'authenticated', p_email,
        crypt(p_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('school_id', p_school_id, 'role', p_role),
        now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), new_uid, p_email,
        jsonb_build_object('sub', new_uid::text, 'email', p_email),
        'email', now(), now(), now()
    );

    INSERT INTO public.users (
        id, school_id, email, role, name, username,
        class, contact, dob, address, blood_group, designation, qualification, aadhar_card
    ) VALUES (
        new_uid, p_school_id, p_email, p_role, p_name, p_username,
        p_class, p_contact, p_dob, p_address, p_blood_group, p_designation, p_qualification, p_aadhar_card
    );

    RETURN new_uid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_bus_assignments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rebuild_badge_cache(p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_school_id      uuid;
  v_class_stars    jsonb;
  v_champion       jsonb;
  v_existing_pins  jsonb;
BEGIN
  SELECT school_id INTO v_school_id FROM public.users WHERE id = p_student_id;

  -- Preserve existing pinned_badges (don't wipe on cache rebuild)
  SELECT pinned_badges INTO v_existing_pins
  FROM public.badge_visibility_cache
  WHERE student_id = p_student_id;

  -- Aggregate active Tier 1 badges (current year)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'icon_key',   bm.icon_key,
      'icon_color', bm.icon_color,
      'badge_name', bm.name,
      'badge_id',   bm.id,
      'awarded_at', sa.awarded_at
    ) ORDER BY sa.awarded_at DESC
  ), '[]'::jsonb)
  INTO v_class_stars
  FROM public.student_achievements sa
  JOIN public.badges_master bm ON bm.id = sa.badge_id
  WHERE sa.student_id = p_student_id
    AND sa.is_active = true
    AND bm.tier = 'class_star'
    AND sa.academic_year = to_char(now(), 'YYYY');

  -- Most recent active Tier 2 badge (permanent, crosses years)
  SELECT jsonb_build_object(
    'icon_key',   bm.icon_key,
    'icon_color', bm.icon_color,
    'badge_name', bm.name,
    'badge_id',   bm.id,
    'awarded_at', sa.awarded_at
  )
  INTO v_champion
  FROM public.student_achievements sa
  JOIN public.badges_master bm ON bm.id = sa.badge_id
  WHERE sa.student_id = p_student_id
    AND sa.is_active = true
    AND bm.tier = 'school_champion'
  ORDER BY sa.awarded_at DESC
  LIMIT 1;

  -- Upsert, preserving pinned_badges
  INSERT INTO public.badge_visibility_cache
    (student_id, school_id, active_class_stars, active_champion, pinned_badges, last_updated)
  VALUES
    (p_student_id, v_school_id, v_class_stars, v_champion, v_existing_pins, now())
  ON CONFLICT (student_id)
  DO UPDATE SET
    active_class_stars = EXCLUDED.active_class_stars,
    active_champion    = EXCLUDED.active_champion,
    -- IMPORTANT: do NOT overwrite pinned_badges here — student controls it
    last_updated       = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_achievements(p_student_id uuid)
 RETURNS TABLE(achievement_id uuid, badge_name text, badge_desc text, icon_key text, icon_color text, tier text, award_type text, class_name text, awarded_by_name text, awarded_at timestamp with time zone, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        sa.id,
        bm.name,
        bm.description,
        bm.icon_key,
        bm.icon_color,
        bm.tier,
        bm.award_type,
        sa.class_name,
        u.name AS awarded_by_name,
        sa.awarded_at,
        sa.note
    FROM public.student_achievements sa
    JOIN public.badges_master bm ON bm.id = sa.badge_id
    LEFT JOIN public.users u ON u.id = sa.awarded_by
    WHERE sa.student_id = p_student_id
      AND sa.is_active = true
    ORDER BY sa.awarded_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pin_student_badges(p_student_id uuid, p_badge_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_school_id   uuid;
  v_pinned      jsonb;
BEGIN
  -- Security: only the student themselves can pin badges
  IF v_caller_id != p_student_id THEN
    RAISE EXCEPTION 'Unauthorized: only the student can pin their own badges.';
  END IF;

  -- Enforce max 2 badges
  IF array_length(p_badge_ids, 1) > 2 THEN
    RAISE EXCEPTION 'Maximum 2 badges can be pinned.';
  END IF;

  -- Get school_id
  SELECT school_id INTO v_school_id FROM public.users WHERE id = p_student_id;

  -- Build the pinned JSONB array from badges_master metadata
  -- Only pin badges the student has actually earned
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'badge_id',   bm.id,
      'icon_key',   bm.icon_key,
      'icon_color', bm.icon_color,
      'badge_name', bm.name,
      'tier',       bm.tier
    )
    ORDER BY array_position(p_badge_ids, bm.id)
  ), NULL)
  INTO v_pinned
  FROM public.badges_master bm
  JOIN public.student_achievements sa ON sa.badge_id = bm.id
  WHERE bm.id = ANY(p_badge_ids)
    AND sa.student_id = p_student_id
    AND sa.is_active = true;

  -- Upsert the cache row
  INSERT INTO public.badge_visibility_cache
    (student_id, school_id, pinned_badges, last_updated)
  VALUES
    (p_student_id, v_school_id, v_pinned, now())
  ON CONFLICT (student_id)
  DO UPDATE SET
    pinned_badges = EXCLUDED.pinned_badges,
    last_updated  = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_default_badges(p_school_id uuid, p_admin_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Class Level Stars (Manual)
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Homework Hero', 'Consistently completing homework on time.', 'book-open', '#8B5CF6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Active Learner', 'Participating actively in class discussions.', 'zap', '#3B82F6', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Good Listener', 'Paying attention and following instructions.', 'ear', '#F59E0B', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Best Handwriting', 'Maintaining neat and legible handwriting.', 'pen-tool', '#10B981', 'class_star', 'manual', p_admin_id),
        (p_school_id, 'Discipline Star', 'Outstanding behavior in class.', 'star', '#EC4899', 'class_star', 'manual', p_admin_id)
    ON CONFLICT ON CONSTRAINT badges_master_school_id_name_tier_key DO NOTHING;

    -- School Level Champions (Manual)
    INSERT INTO public.badges_master (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
        (p_school_id, 'Student of the Year', 'Overall excellence in academics and behavior.', 'crown', '#F59E0B', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'Best Sportsman', 'Exceptional performance in school sports.', 'medal', '#EF4444', 'school_champion', 'manual', p_admin_id),
        (p_school_id, 'All Rounder', 'Excelling in both studies and extracurriculars.', 'award', '#3B82F6', 'school_champion', 'manual', p_admin_id)
    ON CONFLICT ON CONSTRAINT badges_master_school_id_name_tier_key DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rollover_year_end_badges(p_school_id uuid, p_closing_year text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role   text;
  v_mega_badge_id uuid;
  v_student       RECORD;
  v_star_count    int;
  v_idempotency   text;
  v_awarded_count int := 0;
BEGIN
  -- Security gate
  v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
  IF v_caller_role NOT IN ('admin', 'app_manager') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Step 1: Ensure the Mega Star badge exists for this school/year
  SELECT id INTO v_mega_badge_id
  FROM public.badges_master
  WHERE school_id = p_school_id
    AND name = p_closing_year || ' Attendance Champion'
    AND tier = 'class_star'
  LIMIT 1;

  IF v_mega_badge_id IS NULL THEN
    INSERT INTO public.badges_master
      (school_id, name, description, icon_key, icon_color, tier, award_type, created_by)
    VALUES
      (
        p_school_id,
        p_closing_year || ' Attendance Champion',
        'Awarded for earning multiple Class Stars during the ' || p_closing_year || ' academic year.',
        'sparkles', '#F59E0B', 'class_star', 'automated', auth.uid()
      )
    RETURNING id INTO v_mega_badge_id;
  END IF;

  -- Step 2: Loop students with ≥1 class_star in closing year
  FOR v_student IN
    SELECT sa.student_id, u.class, COUNT(sa.id) AS star_count
    FROM public.student_achievements sa
    JOIN public.badges_master bm ON bm.id = sa.badge_id
    JOIN public.users u ON u.id = sa.student_id
    WHERE sa.school_id = p_school_id
      AND sa.academic_year = p_closing_year
      AND sa.is_active = true
      AND bm.tier = 'class_star'
      AND bm.name != (p_closing_year || ' Attendance Champion')  -- skip existing mega stars
    GROUP BY sa.student_id, u.class
    HAVING COUNT(sa.id) >= 1
  LOOP
    v_idempotency := v_student.student_id::text || '_megastar_' || p_closing_year;

    -- Award Mega Star (idempotent)
    INSERT INTO public.student_achievements
      (school_id, student_id, badge_id, class_name, awarded_by,
       academic_year, note, idempotency_key)
    VALUES (
      p_school_id,
      v_student.student_id,
      v_mega_badge_id,
      v_student.class,
      auth.uid(),
      p_closing_year,
      'Year-end rollover: earned ' || v_student.star_count || ' Class Stars in ' || p_closing_year || '.',
      v_idempotency
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF FOUND THEN
      -- Soft-deactivate individual class stars for this student/year
      -- (Mega Star replaces them in the cache; raw records preserved for audit)
      UPDATE public.student_achievements
      SET is_active = false
      WHERE student_id = v_student.student_id
        AND school_id  = p_school_id
        AND academic_year = p_closing_year
        AND is_active = true
        AND badge_id != v_mega_badge_id
        AND badge_id IN (
          SELECT id FROM public.badges_master WHERE tier = 'class_star'
        );

      PERFORM public.rebuild_badge_cache(v_student.student_id);
      v_awarded_count := v_awarded_count + 1;
    END IF;
  END LOOP;

  RETURN v_awarded_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_pinnable_badges(p_student_id uuid)
 RETURNS TABLE(badge_id uuid, badge_name text, icon_key text, icon_color text, tier text, awarded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the student themselves may call this
  IF auth.uid() != p_student_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (bm.id)
    bm.id,
    bm.name,
    bm.icon_key,
    bm.icon_color,
    bm.tier,
    sa.awarded_at
  FROM public.student_achievements sa
  JOIN public.badges_master bm ON bm.id = sa.badge_id
  WHERE sa.student_id = p_student_id
    AND sa.is_active = true
  ORDER BY bm.id, sa.awarded_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email text;
BEGIN
    SELECT email INTO v_email
    FROM public.users
    WHERE LOWER(username) = LOWER(p_username)
    LIMIT 1;

    RETURN v_email; -- Returns NULL if not found (handled by Login.jsx)
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_emergency_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_recipient record;
    v_target_role text;
BEGIN
    IF NEW.target_audience = 'specific_students' AND NEW.target_users IS NOT NULL THEN
        -- Loop through target student IDs and enqueue push notifications
        FOR v_recipient IN SELECT id FROM public.users WHERE id = any(NEW.target_users) LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                v_recipient.id, 
                '🚨 EMERGENCY ALERT: ' || UPPER(NEW.alert_type), 
                NEW.message, 
                '/dashboard', 
                false, -- Critical emergency alerts are not ephemeral (do not auto-delete)
                'pending'
            );
        END LOOP;
    ELSE
        -- Map audience keyword to a target role compatible with the queue check constraint
        v_target_role := CASE NEW.target_audience
            WHEN 'all' THEN 'all'
            WHEN 'staff' THEN 'teacher'
            WHEN 'students' THEN 'student'
            WHEN 'admin' THEN 'admin'
            ELSE 'all'
        END;

        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id, 
            v_target_role, 
            '🚨 EMERGENCY ALERT: ' || UPPER(NEW.alert_type), 
            NEW.message, 
            '/dashboard', 
            false, 
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_manual_badge_award()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_badge_name text;
    v_award_type text;
BEGIN
    -- Look up the badge details
    SELECT name, award_type INTO v_badge_name, v_award_type
    FROM public.badges_master
    WHERE id = NEW.badge_id;

    -- Only enqueue push notifications for manual badge awards to prevent double-notifying automated ones
    IF v_award_type = 'manual' AND NEW.is_active = true THEN
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id,
            NEW.student_id,
            '🏅 New Achievement Badge!',
            'Congratulations! You have been awarded the "' || v_badge_name || '" badge.',
            '/achievements',
            true,
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_lost_found_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_recipient record;
BEGIN
    IF NEW.target_class IS NOT NULL AND NEW.target_class <> '' THEN
        -- Notify all students in the targeted class
        FOR v_recipient IN 
            SELECT id FROM public.users 
            WHERE school_id = NEW.school_id AND class = NEW.target_class AND role = 'student'
        LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                v_recipient.id,
                '🔍 Lost & Found Update',
                'A new item (' || NEW.item_name || ') has been reported found in your class.',
                '/dashboard',
                true,
                'pending'
            );
        END LOOP;
    ELSE
        -- Notify the entire school
        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id,
            'all',
            '🔍 Lost & Found Update',
            'A new item (' || NEW.item_name || ') has been reported found.',
            '/dashboard',
            true,
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_replicate_queue_to_bell()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user      RECORD;
  v_email     TEXT;
  v_norm_role TEXT;
BEGIN
  -- ── GATE: Only replicate non-ephemeral notifications to the bell ──────────
  -- Ephemeral = silent background push (attendance alerts, fee pings, streaks)
  -- These are processed by FCM and cleaned up by the v81 sweeper.
  -- They must NOT appear in the user's in-app notification bell.
  IF NEW.is_ephemeral = TRUE THEN
    RETURN NEW;
  END IF;

  -- ── PATH A: Targeted notification (specific user_id) ─────────────────────
  IF NEW.user_id IS NOT NULL THEN
    -- Resolve the user's email to write into the bell's `to_user` column
    SELECT email INTO v_email
    FROM public.users
    WHERE id = NEW.user_id
    LIMIT 1;

    IF v_email IS NOT NULL AND v_email <> '' THEN
      INSERT INTO public.notifications (school_id, to_user, title, message, is_read)
      VALUES (
        NEW.school_id,
        v_email,
        COALESCE(NEW.title, 'Notification'),
        COALESCE(NEW.body, ''),
        false
      );
    END IF;

  -- ── PATH B: Role/group broadcast (target_role) ────────────────────────────
  ELSIF NEW.target_role IS NOT NULL THEN
    -- Normalize plural aliases (students → student, teachers → teacher)
    v_norm_role := CASE NEW.target_role
      WHEN 'students' THEN 'student'
      WHEN 'teachers' THEN 'teacher'
      ELSE NEW.target_role
    END;

    IF v_norm_role = 'all' THEN
      -- Write one bell entry per user in the school (only for is_ephemeral=false, so this is justified)
      FOR v_user IN
        SELECT email FROM public.users
        WHERE school_id = NEW.school_id
          AND email IS NOT NULL
          AND email <> ''
      LOOP
        INSERT INTO public.notifications (school_id, to_user, title, message, is_read)
        VALUES (
          NEW.school_id,
          v_user.email,
          COALESCE(NEW.title, 'Notification'),
          COALESCE(NEW.body, ''),
          false
        );
      END LOOP;

    ELSE
      -- Write one bell entry per matching-role user in the school
      FOR v_user IN
        SELECT email FROM public.users
        WHERE school_id = NEW.school_id
          AND role = v_norm_role
          AND email IS NOT NULL
          AND email <> ''
      LOOP
        INSERT INTO public.notifications (school_id, to_user, title, message, is_read)
        VALUES (
          NEW.school_id,
          v_user.email,
          COALESCE(NEW.title, 'Notification'),
          COALESCE(NEW.body, ''),
          false
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block the queue insert due to a bell notification failure
  -- Log error silently and allow the push notification to proceed
  RAISE WARNING 'trg_replicate_queue_to_bell: Failed to write bell notification. Error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_monthly_attendance_badge(p_school_id uuid, p_month_year text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_badge_id        uuid;
    v_student         RECORD;
    v_att_data        jsonb;
    v_total_days      int;
    v_present_days    int;
    v_idempotency_key text;
    v_awarded_count   int := 0;
    v_caller_role     text;
BEGIN
    -- Security: Only admin or app_manager can call this
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
    IF v_caller_role NOT IN ('admin', 'app_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Find the monthly perfect attendance badge for this school
    SELECT id INTO v_badge_id
    FROM public.badges_master
    WHERE school_id = p_school_id
      AND award_type = 'automated'
      AND auto_rule->>'type' = 'monthly_attendance_perfect'
      AND is_active = true
    LIMIT 1;

    IF v_badge_id IS NULL THEN
        RAISE EXCEPTION 'Monthly attendance badge not configured for this school.';
    END IF;

    -- Loop over all students with attendance records for this month
    FOR v_student IN
        SELECT a.user_id, a.attendance_data
        FROM public.attendance a
        JOIN public.users u ON a.user_id = u.id
        WHERE a.school_id = p_school_id
          AND a.month_year = p_month_year
          AND u.role = 'student'
    LOOP
        v_att_data     := v_student.attendance_data;
        v_total_days   := (SELECT count(*) FROM jsonb_each_text(v_att_data));
        -- ── v84 CODEC FIX: was 'Present', now 'P' after v82 compression ──
        v_present_days := (SELECT count(*) FROM jsonb_each_text(v_att_data) WHERE value = 'P');

        -- 100% present for the month
        IF v_total_days > 0 AND v_present_days = v_total_days THEN
            v_idempotency_key := v_student.user_id::text || '_monthly100_' || p_month_year;

            INSERT INTO public.student_achievements
                (school_id, student_id, badge_id, class_name, awarded_by,
                 academic_year, note, idempotency_key)
            SELECT
                p_school_id,
                v_student.user_id,
                v_badge_id,
                u.class,
                auth.uid(),
                split_part(p_month_year, '-', 1),
                '100% attendance for ' || to_char((p_month_year || '-01')::date, 'Month YYYY'),
                v_idempotency_key
            FROM public.users u WHERE u.id = v_student.user_id
            ON CONFLICT (idempotency_key) DO NOTHING;

            IF FOUND THEN
                PERFORM public.rebuild_badge_cache(v_student.user_id);

                INSERT INTO public.app_notifications_queue
                    (school_id, user_id, title, body, route, is_ephemeral, status)
                VALUES (
                    p_school_id,
                    v_student.user_id,
                    '🏅 Perfect Attendance!',
                    'You achieved 100% attendance for ' ||
                        to_char((p_month_year || '-01')::date, 'Month YYYY') || '!',
                    '/achievements',
                    true,
                    'pending'
                );

                v_awarded_count := v_awarded_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_awarded_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_archived_attendance(p_school_id uuid, p_year text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role text;
    v_deleted     int;
    v_archive_exists boolean;
BEGIN
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
    IF v_caller_role NOT IN ('admin', 'app_manager') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized.');
    END IF;

    -- Safety: Only purge if archive record exists (i.e. archive_academic_year was called first)
    SELECT EXISTS (
        SELECT 1 FROM public.academic_archives
        WHERE school_id = p_school_id
          AND academic_year = p_year
          AND status = 'completed'
    ) INTO v_archive_exists;

    IF NOT v_archive_exists THEN
        RETURN jsonb_build_object(
            'status',  'error',
            'message', 'No completed archive found for year ' || p_year || '. Run archive_academic_year() first.'
        );
    END IF;

    -- Hard-delete the archived attendance rows
    DELETE FROM public.attendance
    WHERE school_id = p_school_id
      AND month_year LIKE (p_year || '-%')
      AND archived = true;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'status',        'ok',
        'message',       'Purged ' || v_deleted || ' archived attendance rows for year ' || p_year || '.',
        'deleted_count', v_deleted
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Purge failed: ' || SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.retrieve_username_by_email(p_email text, p_contact text)
 RETURNS TABLE(username text, name text, role text, student_emails_enabled boolean, school_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT u.username, u.name, u.role, COALESCE(s.student_emails_enabled, false), s.name
    FROM public.users u
    JOIN public.school_settings s ON u.school_id = s.school_id
    WHERE LOWER(u.email) = LOWER(p_email) AND u.contact = p_contact
    LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_all_module_activities(p_user_id uuid, p_school_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_class text;
  v_last_viewed timestamp with time zone;
  v_pending_count integer;
  v_unseen_count integer;
  v_result jsonb;
  v_module text;
  v_modules text[] := ARRAY['leaves', 'complaint_box', 'notices', 'achievers', 'lost_found'];
BEGIN
  -- Fetch user class (needed for teacher pending leaves and visibility logic)
  SELECT class INTO v_user_class FROM public.users WHERE id = p_user_id;

  v_result := jsonb_build_object();

  -- Loop through modules and calculate activity
  FOREACH v_module IN ARRAY v_modules LOOP
    v_pending_count := 0;
    v_unseen_count := 0;

    -- Fetch last_viewed_at from user_module_views
    SELECT last_viewed_at INTO v_last_viewed
    FROM public.user_module_views
    WHERE user_id = p_user_id AND module_name = v_module;

    -- FIX: If never viewed, default to the last 7 days to prevent permanent historical red dots
    IF v_last_viewed IS NULL THEN
      v_last_viewed := NOW() - INTERVAL '7 days';
    END IF;

    -- Module-specific logic
    CASE v_module
      WHEN 'leaves' THEN
        IF p_role = 'admin' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.leaves
          WHERE school_id = p_school_id AND status = 'pending';
        ELSIF p_role = 'teacher' THEN
          IF v_user_class IS NOT NULL AND v_user_class <> '' THEN
            SELECT COALESCE(count(*), 0) INTO v_pending_count
            FROM public.leaves l
            JOIN public.users u ON l.user_id = u.id
            WHERE l.status = 'pending' 
              AND u.role = 'student' 
              AND u.class = v_user_class 
              AND u.school_id = p_school_id;
          END IF;
        END IF;

        IF p_role IN ('student', 'teacher', 'staff') THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.leaves
          WHERE user_id = p_user_id AND created_at > v_last_viewed;
        END IF;

      WHEN 'complaint_box' THEN
        -- FIX: status is 'unread', not 'pending' in the complaint_box table schema
        IF p_role = 'admin' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.complaint_box
          WHERE school_id = p_school_id AND status = 'unread';
        ELSIF p_role = 'teacher' THEN
          SELECT COALESCE(count(*), 0) INTO v_pending_count
          FROM public.complaint_box
          WHERE recipient_id = p_user_id AND status = 'unread';

          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.complaint_box
          WHERE sender_id = p_user_id AND status = 'replied' AND replied_at > v_last_viewed;
        ELSIF p_role = 'student' THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.complaint_box
          WHERE sender_id = p_user_id AND status = 'replied' AND replied_at > v_last_viewed;
        END IF;

      WHEN 'notices' THEN
        -- FIX: Filter notices by p_role's visibility scope to match NoticeBoard filters
        SELECT COALESCE(count(*), 0) INTO v_unseen_count
        FROM public.notices
        WHERE school_id = p_school_id 
          AND created_at > v_last_viewed
          AND (
            p_role IN ('admin', 'platform_admin', 'staff', 'driver')
            OR (p_role = 'student' AND scope IN ('all', 'students'))
            OR (p_role = 'teacher' AND scope IN ('all', 'teachers'))
          );

      WHEN 'achievers' THEN
        IF p_role = 'student' THEN
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.student_achievements
          WHERE student_id = p_user_id AND is_active = true AND awarded_at > v_last_viewed;
        ELSE
          SELECT COALESCE(count(*), 0) INTO v_unseen_count
          FROM public.student_achievements
          WHERE school_id = p_school_id AND is_active = true AND awarded_at > v_last_viewed;
        END IF;

      WHEN 'lost_found' THEN
        -- FIX: Filter unseen items by target_class visibility scope to match LostAndFound filters
        SELECT COALESCE(count(*), 0) INTO v_unseen_count
        FROM public.lost_and_found
        WHERE school_id = p_school_id 
          AND claimed_by IS NULL 
          AND created_at > v_last_viewed
          AND (
            p_role NOT IN ('student', 'teacher')
            OR (target_class IS NULL)
            OR (v_user_class IS NOT NULL AND target_class = v_user_class)
          );

        SELECT COALESCE(count(*), 0) INTO v_pending_count
        FROM public.lost_and_found
        WHERE reported_by = p_user_id AND status = 'claimed';

      ELSE
        -- No action
    END CASE;

    -- Store results for this module
    v_result := jsonb_set(
      v_result, 
      ARRAY[v_module], 
      jsonb_build_object(
        'hasActivity', (v_pending_count > 0 OR v_unseen_count > 0),
        'pendingCount', v_pending_count,
        'unseenCount', v_unseen_count
      )
    );
  END LOOP;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_cron_schedule(p_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cron_expr TEXT;
BEGIN
  IF p_minutes <= 0 OR p_minutes > 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid interval. Must be between 1 and 60 minutes.');
  END IF;

  -- FIX: Added WHERE constraint on platform_settings to bypass safe update validation checks
  UPDATE public.platform_settings 
  SET free_tier_cron_minutes = p_minutes
  WHERE id = (SELECT id FROM public.platform_settings LIMIT 1);

  -- Construct standard cron schedule (run every X minutes during school hours 8 AM - 6 PM)
  v_cron_expr := '*/' || p_minutes || ' 8-18 * * *';

  -- Re-register pg_cron schedule
  PERFORM cron.unschedule('notification-batch-processor-free-tier');
  PERFORM cron.schedule(
    'notification-batch-processor-free-tier',
    v_cron_expr,
    $cron$
    SELECT net.http_post(
      url     => 'https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue',
      headers => jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpianR2b3N2d3VmaW1qY3Z2d2NnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1MTM3NCwiZXhwIjoyMDk4MDI3Mzc0fQ.MFjwewzZSXgslBnGB6xT44FWvsCD-Mw7Ib5-O9rgj7Q'
      ),
      body    => '{}'::jsonb
    );
    $cron$
  );

  RETURN jsonb_build_object('success', true, 'minutes', p_minutes, 'schedule', v_cron_expr);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_pending_notifications(p_limit integer)
 RETURNS SETOF app_notifications_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ids uuid[]; -- FIX: Changed from bigint[] to uuid[] to match the primary key type of public.app_notifications_queue
BEGIN
  -- Select and lock the rows
  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id
    FROM public.app_notifications_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) t;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    -- Update and return the rows
    RETURN QUERY
    UPDATE public.app_notifications_queue
    SET status = 'processing'
    WHERE id = any(v_ids)
    RETURNING *;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_and_log_login_attempt(p_username text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_username text;
  v_log record;
  v_locked boolean := false;
  v_locked_until timestamp with time zone := null;
  v_attempts integer := 0;
BEGIN
  v_username := lower(trim(p_username));
  IF v_username IS NULL OR v_username = '' THEN
    RETURN jsonb_build_object('error', 'Username is required');
  END IF;

  -- Get current lock log
  SELECT * INTO v_log FROM public.login_brute_force_logs WHERE username = v_username;

  IF p_action = 'check' THEN
    IF v_log.locked_until IS NOT NULL AND v_log.locked_until > now() THEN
      v_locked := true;
      v_locked_until := v_log.locked_until;
    END IF;
    RETURN jsonb_build_object('locked', v_locked, 'lockedUntil', v_locked_until, 'attempts', COALESCE(v_log.failed_attempts, 0));

  ELSIF p_action = 'fail' THEN
    IF v_log.username IS NULL THEN
      -- Create new log on first failure
      INSERT INTO public.login_brute_force_logs (username, failed_attempts, last_attempt_at)
      VALUES (v_username, 1, now())
      RETURNING failed_attempts, locked_until INTO v_attempts, v_locked_until;
    ELSE
      -- Increment failed attempts
      v_attempts := v_log.failed_attempts + 1;
      IF v_attempts >= 5 THEN
        -- Lock account for 2 hours to match frontend UI message
        v_locked_until := now() + interval '2 hours';
        v_locked := true;
      END IF;
      
      UPDATE public.login_brute_force_logs
      SET failed_attempts = v_attempts,
          last_attempt_at = now(),
          locked_until = COALESCE(v_locked_until, locked_until)
      WHERE username = v_username;
    END IF;
    
    RETURN jsonb_build_object('attempts', v_attempts, 'locked', v_attempts >= 5, 'lockedUntil', v_locked_until);

  ELSIF p_action = 'success' THEN
    -- Clear failed logs on successful authentication
    DELETE FROM public.login_brute_force_logs WHERE username = v_username;
    RETURN jsonb_build_object('success', true);

  ELSE
    RETURN jsonb_build_object('error', 'Invalid action');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_reactive_notification_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_has_premium_pending boolean;
BEGIN
  -- Check if there are any pending notifications in the queue belonging to a Paid (premium/trial) school.
  -- This prevents duplicate triggers if multiple rows are inserted in a single transaction.
  SELECT EXISTS (
    SELECT 1 
    FROM public.app_notifications_queue q
    JOIN public.school_settings s ON q.school_id = s.school_id
    WHERE q.status = 'pending' AND (s.plan_type = 'premium' OR s.plan_type = 'trial')
  ) INTO v_has_premium_pending;

  IF v_has_premium_pending THEN
    PERFORM net.http_post(
      url     := 'https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpianR2b3N2d3VmaW1qY3Z2d2NnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1MTM3NCwiZXhwIjoyMDk4MDI3Mzc0fQ.MFjwewzZSXgslBnGB6xT44FWvsCD-Mw7Ib5-O9rgj7Q'
      ),
      body    := '{}'::jsonb
    );
  END IF;

  RETURN NULL; -- For AFTER statement-level triggers, return value is ignored
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_check_notification_delivery_toggles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_disabled_modules TEXT[];
BEGIN
  -- Get disabled modules from platform_settings
  SELECT disabled_notification_modules INTO v_disabled_modules
  FROM public.platform_settings
  LIMIT 1;

  IF v_disabled_modules IS NOT NULL THEN
    -- Attendance
    IF NEW.route LIKE '%attendance%' AND 'attendance' = ANY(v_disabled_modules) THEN
      RETURN NULL; -- Block insert silently
    END IF;
    
    -- Leaves
    IF (NEW.route LIKE '%leave%' OR NEW.route LIKE '%leaves%') AND 'leaves' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;

    -- Complaints / Principal's Desk
    IF (NEW.route LIKE '%complaint%' OR NEW.route LIKE '%principals_desk%') AND 'complaints' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;

    -- Achievers
    IF (NEW.route LIKE '%achiever%' OR NEW.route LIKE '%achievement%') AND 'achievers' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;

    -- Lost & Found
    IF NEW.route LIKE '%lost_found%' AND 'lost_found' = ANY(v_disabled_modules) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_school_data_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_auto_throttle_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer;
  v_mode text;
  v_limit integer := 500000;
  v_disabled_modules TEXT[];
  v_cron_minutes INT;
BEGIN
  -- Count total edge function usage executions in current calendar month
  SELECT COUNT(*) INTO v_count 
  FROM public.edge_function_usage 
  WHERE called_at > DATE_TRUNC('month', NOW());

  -- Determine throttling threshold mode
  IF v_count < 350000 THEN
    v_mode := 'Normal';
  ELSIF v_count < 450000 THEN
    v_mode := 'Economy';
  ELSE
    v_mode := 'Critical';
  END IF;

  -- Load toggles and current cron configurations
  SELECT disabled_notification_modules, free_tier_cron_minutes 
  INTO v_disabled_modules, v_cron_minutes
  FROM public.platform_settings
  LIMIT 1;

  RETURN jsonb_build_object(
    'call_count', v_count,
    'limit', v_limit,
    'mode', v_mode,
    'cron_minutes', COALESCE(v_cron_minutes, 15),
    'disabled_modules', COALESCE(v_disabled_modules, ARRAY[]::TEXT[])
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_school_subscription_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- If subscription_tier was changed but plan_type was not:
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier AND (NEW.plan_type IS NOT DISTINCT FROM OLD.plan_type OR NEW.plan_type IS NULL) THEN
    NEW.plan_type := CASE NEW.subscription_tier
      WHEN 'Premium' THEN 'premium'
      WHEN 'Trial'   THEN 'trial'
      ELSE 'free'
    END;
  -- If plan_type was changed but subscription_tier was not:
  ELSIF NEW.plan_type IS DISTINCT FROM OLD.plan_type AND (NEW.subscription_tier IS NOT DISTINCT FROM OLD.subscription_tier OR NEW.subscription_tier IS NULL) THEN
    NEW.subscription_tier := CASE NEW.plan_type
      WHEN 'premium' THEN 'Premium'
      WHEN 'trial'   THEN 'Trial'
      ELSE 'Free'
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_complaint_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- 1. Student raising a complaint to Admins
        IF NEW.recipient_type = 'admin' THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                'admin',
                'New Complaint Received',
                CASE WHEN NEW.is_anonymous THEN 'Anonymous: ' || NEW.subject ELSE NEW.subject END,
                '/complaint-box',
                false,
                'pending'
            );
        
        -- 2. Student raising a complaint to a specific Class Teacher
        ELSIF NEW.recipient_type = 'teacher' AND NEW.recipient_id IS NOT NULL THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                NEW.recipient_id,
                'New Complaint Received',
                CASE WHEN NEW.is_anonymous THEN 'Anonymous: ' || NEW.subject ELSE NEW.subject END,
                '/complaint-box',
                false,
                'pending'
            );
            
        -- 3. Teacher sending a message directly to a Student
        ELSIF NEW.recipient_type = 'student' AND NEW.recipient_id IS NOT NULL THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                NEW.recipient_id,
                'Message from Teacher',
                NEW.subject,
                '/complaint-box',
                false,
                'pending'
            );
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- 4. Admin or Teacher replying to a complaint (status switches to 'replied')
        IF NEW.status = 'replied' AND OLD.status IS DISTINCT FROM 'replied' THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id,
                NEW.sender_id,
                'New Reply to your Complaint',
                'Reply: ' || NEW.subject,
                '/complaint-box',
                false,
                'pending'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_email_direct(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Validate email formatting
  IF p_email IS NULL OR p_email NOT LIKE '%@%._%' THEN
    RAISE EXCEPTION 'Invalid email address format.';
  END IF;

  -- Check email uniqueness in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = LOWER(p_email) AND id != auth.uid()) THEN
    RAISE EXCEPTION 'Email "%" is already registered to another account.', p_email;
  END IF;

  -- Update auth.users directly
  UPDATE auth.users
  SET email = LOWER(p_email),
      email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE id = auth.uid();

  -- Update auth.identities for email provider
  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', LOWER(p_email)),
      provider_id = LOWER(p_email)
  WHERE user_id = auth.uid() AND provider = 'email';

  -- Update public.users
  UPDATE public.users
  SET email = LOWER(p_email)
  WHERE id = auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_identity_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_username text;
  v_google_email text;
BEGIN
  -- On INSERT/UPDATE of Google identity: Sync Google email directly to user profile
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.provider = 'google' THEN
    v_google_email := NEW.identity_data->>'email';
    IF v_google_email IS NOT NULL THEN
      -- Update auth.users email
      UPDATE auth.users
      SET email = LOWER(v_google_email),
          email_confirmed_at = COALESCE(email_confirmed_at, now())
      WHERE id = NEW.user_id;

      -- Update email provider identity if it exists
      UPDATE auth.identities
      SET identity_data = identity_data || jsonb_build_object('email', LOWER(v_google_email)),
          provider_id = LOWER(v_google_email)
      WHERE user_id = NEW.user_id AND provider = 'email';
      
      -- Update public.users email
      UPDATE public.users
      SET email = LOWER(v_google_email)
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  -- On DELETE of Google identity: Reset email to username@school.internal
  IF TG_OP = 'DELETE' AND OLD.provider = 'google' THEN
    -- Check if another Google identity still exists for safety
    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = OLD.user_id AND provider = 'google') THEN
      SELECT username INTO v_username FROM public.users WHERE id = OLD.user_id;
      IF v_username IS NOT NULL THEN
        -- Revert auth.users email
        UPDATE auth.users
        SET email = LOWER(v_username || '@school.internal')
        WHERE id = OLD.user_id;

        -- Revert email provider identity if exists
        UPDATE auth.identities
        SET identity_data = identity_data || jsonb_build_object('email', LOWER(v_username || '@school.internal')),
            provider_id = LOWER(v_username || '@school.internal')
        WHERE user_id = OLD.user_id AND provider = 'email';
        
        -- Revert public.users email
        UPDATE public.users
        SET email = LOWER(v_username || '@school.internal')
        WHERE id = OLD.user_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_timetable_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_student record;
BEGIN
    -- Trigger alert on ANY subject, label, or teacher assignment modifications
    IF OLD.subject IS DISTINCT FROM NEW.subject 
       OR OLD.period_label IS DISTINCT FROM NEW.period_label 
       OR OLD.teacher IS DISTINCT FROM NEW.teacher THEN
       
        -- Insert a notification for every student in that class
        FOR v_student IN 
            SELECT id FROM public.users 
            WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student'
        LOOP
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                v_student.id, 
                '📅 Timetable Modified', 
                'Your schedule for Class ' || NEW.class || ' on ' || NEW.day || ' (Period ' || NEW.period_order || ') has been updated.', 
                '/timetable',
                false,
                'pending'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_substitution_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_substitute_name text;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Look up the substitute teacher's name
        SELECT name INTO v_substitute_name FROM public.users WHERE id = NEW.substitute_teacher_id;
        
        IF NEW.status = 'cancelled' THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                'admin', 
                '📋 Substitution Declined', 
                COALESCE(v_substitute_name, 'A teacher') || ' has declined the substitution for ' || NEW.class || ' (Period ' || NEW.period_order || ').', 
                '/off-classes',
                false,
                'pending'
            );
        ELSIF NEW.status = 'completed' THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                'admin', 
                '✅ Substitution Completed', 
                COALESCE(v_substitute_name, 'A teacher') || ' has completed the substitution for ' || NEW.class || ' (Period ' || NEW.period_order || ').', 
                '/off-classes',
                false,
                'pending'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_mood_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_date text;
    v_entry jsonb;
    v_old_emoji text;
    v_emoji text;
    v_note text;
    v_student_name text;
    v_student_class text;
    v_teacher record;
    v_teacher_found boolean := false;
BEGIN
    -- Fetch student details
    SELECT name, class INTO v_student_name, v_student_class
    FROM public.users
    WHERE id = NEW.student_id;

    -- Loop through all entries in the new notes jsonb object
    FOR v_date, v_entry IN SELECT * FROM jsonb_each(NEW.notes) LOOP
        v_teacher_found := false;
        v_emoji := v_entry ->> 'emoji';
        v_note := COALESCE(v_entry ->> 'note', 'No note provided.');

        -- Alert strictly on '🤒' (Sick/Unwell) check-ins
        IF v_emoji = '🤒' THEN
            -- Check if this is a newly inserted date or if the emoji transitioned to '🤒'
            v_old_emoji := NULL;
            IF OLD IS NOT NULL AND OLD.notes IS NOT NULL THEN
                v_old_emoji := OLD.notes -> v_date ->> 'emoji';
            END IF;

            IF v_old_emoji IS NULL OR v_old_emoji IS DISTINCT FROM '🤒' THEN
                
                -- Look up the class teacher for this student's class
                FOR v_teacher IN 
                    SELECT id FROM public.users
                    WHERE school_id = NEW.school_id 
                      AND class = v_student_class 
                      AND role = 'teacher'
                LOOP
                    v_teacher_found := true;
                    
                    INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
                    VALUES (
                        NEW.school_id,
                        v_teacher.id,
                        '🤒 Student Health Alert',
                        v_student_name || ' checked in today as Unwell (🤒). Note: "' || v_note || '"',
                        '/mood_note',
                        false,
                        'pending'
                    );
                END LOOP;

                -- Fallback: If no teacher is found in that class, alert the school admin
                IF NOT v_teacher_found THEN
                    INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
                    VALUES (
                        NEW.school_id,
                        'admin',
                        '🤒 Student Health Alert',
                        v_student_name || ' (Class ' || COALESCE(v_student_class, 'N/A') || ') checked in today as Unwell (🤒). Note: "' || v_note || '"',
                        '/mood_note',
                        false,
                        'pending'
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_calendar_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
        VALUES (
            NEW.school_id, 
            'all', 
            '📅 New Event Created', 
            NEW.title || ' has been scheduled for ' || NEW.start_date::text || '.', 
            '/calendar',
            false,
            'pending'
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.title IS DISTINCT FROM NEW.title 
           OR OLD.start_date IS DISTINCT FROM NEW.start_date 
           OR OLD.description IS DISTINCT FROM NEW.description THEN
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, is_ephemeral, status)
            VALUES (
                NEW.school_id, 
                'all', 
                '📅 Event Updated', 
                'Details for the event "' || NEW.title || '" have been updated.', 
                '/calendar',
                false,
                'pending'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_syllabus_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_old_chapter jsonb;
    v_new_chapter jsonb;
    v_recipient record;
    v_old_completed boolean;
    v_new_completed boolean;
    v_old_notes text;
    v_new_notes text;
    v_chapter_title text;
    v_chapter_id int;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Loop through the elements of the new chapters array
        FOR v_new_chapter IN SELECT jsonb_array_elements(NEW.chapters) LOOP
            v_chapter_id := (v_new_chapter ->> 'id')::int;
            v_chapter_title := COALESCE(v_new_chapter ->> 'title', 'Chapter ' || v_chapter_id);
            v_new_completed := COALESCE((v_new_chapter ->> 'is_completed')::boolean, false);
            v_new_notes := v_new_chapter ->> 'notes_url';

            -- Match corresponding chapter in OLD structure
            SELECT c INTO v_old_chapter 
            FROM jsonb_array_elements(OLD.chapters) AS c
            WHERE (c ->> 'id')::int = v_chapter_id;

            IF v_old_chapter IS NOT NULL THEN
                v_old_completed := COALESCE((v_old_chapter ->> 'is_completed')::boolean, false);
                v_old_notes := v_old_chapter ->> 'notes_url';

                -- Case A: Chapter completion marked completed (false -> true)
                IF NOT v_old_completed AND v_new_completed THEN
                    FOR v_recipient IN 
                        SELECT id FROM public.users 
                        WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student'
                    LOOP
                        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
                        VALUES (
                            NEW.school_id,
                            v_recipient.id,
                            '📚 Syllabus Completed',
                            'Great job! Chapter ' || v_chapter_id || ' (' || v_chapter_title || ') of ' || NEW.subject || ' is completed.',
                            '/syllabus',
                            false,
                            'pending'
                        );
                    END LOOP;
                END IF;

                -- Case B: Chapter notes uploaded / changed
                IF v_new_notes IS NOT NULL AND (v_old_notes IS NULL OR v_old_notes IS DISTINCT FROM v_new_notes) THEN
                    FOR v_recipient IN 
                        SELECT id FROM public.users 
                        WHERE school_id = NEW.school_id AND class = NEW.class AND role = 'student'
                    LOOP
                        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, is_ephemeral, status)
                        VALUES (
                            NEW.school_id,
                            v_recipient.id,
                            '📝 Study Notes Uploaded',
                            'New study notes have been uploaded for ' || NEW.subject || ' — ' || v_chapter_title || '.',
                            '/syllabus',
                            false,
                            'pending'
                        );
                    END LOOP;
                END IF;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_leave_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_name text;
    v_user_role text;
    v_user_class text;
    v_teacher_id uuid;
    v_teacher_found boolean := false;
BEGIN
    -- Fetch details of the applicant
    SELECT name, role, class INTO v_user_name, v_user_role, v_user_class
    FROM public.users 
    WHERE id = NEW.user_id;

    IF TG_OP = 'INSERT' THEN
        -- 1. Notify the applicant that their application is pending
        INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, status)
        VALUES (NEW.school_id, NEW.user_id, 'Leave Application', 'Hi ' || v_user_name || ', your leave application has been submitted and is pending approval.', '/leaves', 'pending');

        -- 2. Notify the reviewer
        IF v_user_role = 'student' THEN
            -- Find the Class Teacher (who has 1st period on the class in timetable)
            -- We search the timetable for this class and period_order = 1
            -- We order by day so we get a consistent default (e.g. Monday's teacher, or today's teacher)
            SELECT teacher::uuid INTO v_teacher_id
            FROM public.timetable
            WHERE school_id = NEW.school_id
              AND class = v_user_class
              AND period_order = 1
            ORDER BY 
              CASE WHEN trim(day) = to_char(now(), 'FMDay') THEN 1
                   WHEN trim(day) = 'Monday' THEN 2
                   ELSE 3
              END
            LIMIT 1;

            IF v_teacher_id IS NOT NULL THEN
                v_teacher_found := true;
                INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, status)
                VALUES (NEW.school_id, v_teacher_id, 'Student Leave Request', v_user_name || ' from your class (' || v_user_class || ') has requested leave.', '/leaves', 'pending');
            END IF;

            -- Fallback: if no class teacher is resolved from timetable, notify the school admin
            IF NOT v_teacher_found THEN
                INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, status)
                VALUES (NEW.school_id, 'admin', 'Student Leave Request (No Teacher)', v_user_name || ' (Class ' || COALESCE(v_user_class, 'N/A') || ') has requested leave, but no class teacher is assigned.', '/leaves', 'pending');
            END IF;
        ELSE
            -- Non-student leave (teacher/staff/driver) -> goes to Admin
            INSERT INTO public.app_notifications_queue (school_id, target_role, title, body, route, status)
            VALUES (NEW.school_id, 'admin', 'Staff Leave Request', v_user_name || ' (' || v_user_role || ') has requested leave.', '/leaves', 'pending');
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('Approved', 'Rejected') THEN
            INSERT INTO public.app_notifications_queue (school_id, user_id, title, body, route, status)
            VALUES (NEW.school_id, NEW.user_id, 'Leave Update', 'Hi ' || v_user_name || ', your leave application from ' || NEW.from_date::text || ' to ' || NEW.to_date::text || ' has been ' || NEW.status || '.', '/leaves', 'pending');
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_password_reset_email(p_identifier text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id                 uuid;
    v_email                   text;
    v_role                    text;
    v_school_id               uuid;
    v_plan_type               text;
    v_student_emails_enabled  boolean;
BEGIN
    -- Resolve user ID, role, school, and email by either username or email
    SELECT id, role, school_id, email INTO v_user_id, v_role, v_school_id, v_email
    FROM public.users
    WHERE LOWER(username) = LOWER(p_identifier) OR LOWER(email) = LOWER(p_identifier)
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No account found for "%".', p_identifier;
    END IF;

    -- Block placeholders (e.g. initial demo accounts or school.internal domains)
    IF v_email IS NULL OR v_email NOT LIKE '%@%._%' OR v_email LIKE '%@school.internal' OR v_email LIKE '%@demo.com' THEN
        RAISE EXCEPTION 'This account does not have a verified recovery email linked. Please contact your teacher/admin for a manual password reset.';
    END IF;

    -- Fetch active plan type (auto-handles trial downgrades)
    v_plan_type := public.get_effective_plan(v_school_id);

    -- Fetch student email toggle
    SELECT student_emails_enabled INTO v_student_emails_enabled
    FROM public.school_settings
    WHERE school_id = v_school_id;

    -- Apply Student recovery restriction (Only allow students if student_emails_enabled is TRUE)
    IF v_role = 'student' AND COALESCE(v_student_emails_enabled, false) = FALSE THEN
        RAISE EXCEPTION 'Password recovery via email is not enabled for students of this school. Please contact your class teacher or school administrator for help.';
    END IF;

    -- Apply Free Plan Teacher rate limit (1 request per 24 hours)
    IF v_role = 'teacher' AND v_plan_type = 'free' THEN
        IF EXISTS (
            SELECT 1 FROM public.password_reset_logs
            WHERE user_id = v_user_id
              AND requested_at > NOW() - INTERVAL '24 hours'
        ) THEN
            RAISE EXCEPTION 'Teachers in free tier schools can only request password resets once per 24 hours. Please try again later.';
        END IF;
    END IF;

    -- Log reset request
    INSERT INTO public.password_reset_logs (user_id) VALUES (v_user_id);

    -- Reload schema cache notification
    NOTIFY pgrst, 'reload schema';

    RETURN v_email;
END;
$function$;

-- ==========================================
-- SECTION 5: TRIGGERS
-- ==========================================

CREATE TRIGGER trigger_notification_on_notice AFTER INSERT OR UPDATE ON public.notices FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/send-notice-notification', 'POST', '{"Content-type":"application/json"}', '{}', '5000');

CREATE TRIGGER trigger_notification_queue AFTER INSERT ON public.app_notifications_queue FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue', 'POST', '{"Content-type":"application/json"}', '{}', '5000');

CREATE TRIGGER on_fees_payment_notify AFTER INSERT ON public.fees_payments FOR EACH ROW EXECUTE FUNCTION trg_notify_fees_payment();

CREATE TRIGGER on_gallery_notify AFTER INSERT ON public.gallery FOR EACH ROW EXECUTE FUNCTION trg_notify_gallery_insert();

CREATE TRIGGER on_support_ticket_notify AFTER INSERT OR UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION trg_notify_support_ticket();

CREATE TRIGGER on_app_version_notify AFTER INSERT ON public.app_versions FOR EACH ROW EXECUTE FUNCTION trg_notify_app_version();

CREATE TRIGGER update_subscription_transactions_modtime BEFORE UPDATE ON public.subscription_transactions FOR EACH ROW EXECUTE FUNCTION update_transaction_modtime();

CREATE TRIGGER complaint_box_updated_at BEFORE UPDATE ON public.complaint_box FOR EACH ROW EXECUTE FUNCTION update_complaint_box_timestamp();

CREATE TRIGGER trg_bus_assignments_updated_at BEFORE UPDATE ON public.bus_assignments FOR EACH ROW EXECUTE FUNCTION update_bus_assignments_updated_at();

CREATE TRIGGER on_emergency_alert_notify AFTER INSERT ON public.emergency_alerts FOR EACH ROW EXECUTE FUNCTION trg_notify_emergency_alert();

CREATE TRIGGER on_manual_badge_award_notify AFTER INSERT ON public.student_achievements FOR EACH ROW EXECUTE FUNCTION trg_notify_manual_badge_award();

CREATE TRIGGER on_lost_found_item_notify AFTER INSERT ON public.lost_and_found FOR EACH ROW EXECUTE FUNCTION trg_notify_lost_found_item();

CREATE TRIGGER on_queue_insert_replicate_to_bell AFTER INSERT ON public.app_notifications_queue FOR EACH ROW EXECUTE FUNCTION trg_replicate_queue_to_bell();

CREATE TRIGGER trg_reactive_notification_delivery AFTER INSERT ON public.app_notifications_queue FOR EACH STATEMENT EXECUTE FUNCTION trg_reactive_notification_delivery();

CREATE TRIGGER trg_check_notification_delivery_toggles BEFORE INSERT ON public.app_notifications_queue FOR EACH ROW EXECUTE FUNCTION trg_check_notification_delivery_toggles();

CREATE TRIGGER trg_increment_version_attendance AFTER INSERT OR DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION increment_school_data_version();

CREATE TRIGGER trg_increment_version_notices AFTER INSERT OR DELETE OR UPDATE ON public.notices FOR EACH ROW EXECUTE FUNCTION increment_school_data_version();

CREATE TRIGGER trg_increment_version_fees AFTER INSERT OR DELETE OR UPDATE ON public.fees FOR EACH ROW EXECUTE FUNCTION increment_school_data_version();

CREATE TRIGGER trg_increment_version_leaves AFTER INSERT OR DELETE OR UPDATE ON public.leaves FOR EACH ROW EXECUTE FUNCTION increment_school_data_version();

CREATE TRIGGER trg_increment_version_emergency_alerts AFTER INSERT OR DELETE OR UPDATE ON public.emergency_alerts FOR EACH ROW EXECUTE FUNCTION increment_school_data_version();

CREATE TRIGGER trg_sync_school_subscription_columns BEFORE INSERT OR UPDATE ON public.school_settings FOR EACH ROW EXECUTE FUNCTION trg_sync_school_subscription_columns();

CREATE TRIGGER on_complaint_activity_notify AFTER INSERT OR UPDATE ON public.complaint_box FOR EACH ROW EXECUTE FUNCTION trg_notify_complaint_activity();

CREATE TRIGGER on_timetable_notify AFTER UPDATE ON public.timetable FOR EACH ROW EXECUTE FUNCTION trg_notify_timetable_update();

CREATE TRIGGER on_substitution_status_notify AFTER UPDATE OF status ON public.substitutions FOR EACH ROW EXECUTE FUNCTION trg_notify_substitution_update();

CREATE TRIGGER on_calendar_event_notify AFTER INSERT OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION trg_notify_calendar_event();

CREATE TRIGGER on_syllabus_change_notify AFTER UPDATE OF chapters ON public.syllabus_tracker FOR EACH ROW EXECUTE FUNCTION trg_notify_syllabus_change();

CREATE TRIGGER on_mood_flag_notify AFTER INSERT OR UPDATE ON public.health_mood_notes FOR EACH ROW EXECUTE FUNCTION trg_notify_mood_flag();

CREATE TRIGGER on_leaves_notify AFTER INSERT OR UPDATE ON public.leaves FOR EACH ROW EXECUTE FUNCTION trg_notify_leave_update();

-- ==========================================
-- SECTION 6: INDEXES
-- ==========================================

CREATE INDEX idx_users_school_role ON public.users USING btree (school_id, role);

CREATE INDEX idx_users_school_class ON public.users USING btree (school_id, class) WHERE (class IS NOT NULL);

CREATE INDEX idx_users_username ON public.users USING btree (username) WHERE (username IS NOT NULL);

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (email IS NOT NULL);

CREATE INDEX idx_notifications_school_user ON public.notifications USING btree (school_id, to_user);

CREATE INDEX idx_notifications_school_unread ON public.notifications USING btree (school_id, to_user, is_read) WHERE (is_read = false);

CREATE INDEX idx_notifications_created_desc ON public.notifications USING btree (school_id, created_at DESC);

CREATE INDEX idx_notif_queue_pending ON public.app_notifications_queue USING btree (created_at) WHERE (status = 'pending'::text);

CREATE INDEX idx_notif_queue_school_status ON public.app_notifications_queue USING btree (school_id, status);

CREATE INDEX idx_notif_queue_user_status ON public.app_notifications_queue USING btree (user_id, status) WHERE (user_id IS NOT NULL);

CREATE INDEX idx_notif_queue_created_at ON public.app_notifications_queue USING btree (created_at);

CREATE INDEX idx_fees_school_student ON public.fees USING btree (school_id, student_id);

CREATE INDEX idx_fees_school_year ON public.fees USING btree (school_id, year);

CREATE INDEX idx_fees_payments_school_fee ON public.fees_payments USING btree (school_id, fee_id);

CREATE INDEX idx_fees_payments_created_desc ON public.fees_payments USING btree (school_id, created_at DESC);

CREATE INDEX idx_leaves_school_user ON public.leaves USING btree (school_id, user_id);

CREATE INDEX idx_leaves_school_pending ON public.leaves USING btree (school_id, created_at DESC) WHERE (status = 'pending'::text);

CREATE INDEX idx_leaves_school_status ON public.leaves USING btree (school_id, status);

CREATE INDEX idx_timetable_school_class ON public.timetable USING btree (school_id, class);

CREATE INDEX idx_timetable_school_teacher ON public.timetable USING btree (school_id, teacher);

CREATE INDEX idx_timetable_school_day ON public.timetable USING btree (school_id, day);

CREATE INDEX idx_notices_school_created_desc ON public.notices USING btree (school_id, created_at DESC);

CREATE INDEX idx_notices_school_scope ON public.notices USING btree (school_id, scope);

CREATE INDEX idx_gallery_school_created_desc ON public.gallery USING btree (school_id, created_at DESC);

CREATE INDEX idx_calendar_events_school_date ON public.calendar_events USING btree (school_id, start_date);

CREATE INDEX idx_audit_logs_school_created_desc ON public.audit_logs USING btree (school_id, created_at DESC);

CREATE INDEX idx_support_tickets_created_desc ON public.support_tickets USING btree (created_at DESC);

CREATE INDEX idx_support_tickets_school_status ON public.support_tickets USING btree (school_id, status);

CREATE INDEX idx_sub_transactions_school_date ON public.subscription_transactions USING btree (school_id, created_at DESC);

CREATE INDEX idx_sub_transactions_status ON public.subscription_transactions USING btree (status);

CREATE INDEX idx_lost_found_school_status ON public.lost_and_found USING btree (school_id, status);

CREATE INDEX idx_lost_found_school_created_desc ON public.lost_and_found USING btree (school_id, created_at DESC);

CREATE INDEX idx_emergency_alerts_school_created_desc ON public.emergency_alerts USING btree (school_id, created_at DESC);

CREATE INDEX idx_complaint_box_created_desc ON public.complaint_box USING btree (school_id, created_at DESC);

CREATE INDEX idx_user_device_tokens_user_id ON public.user_device_tokens USING btree (user_id);

CREATE INDEX idx_user_device_tokens_school_id ON public.user_device_tokens USING btree (school_id);

CREATE INDEX idx_app_versions_code ON public.app_versions USING btree (version_code DESC);

CREATE INDEX idx_kb_articles_category ON public.kb_articles USING btree (category_id);

CREATE INDEX idx_kb_articles_published ON public.kb_articles USING btree (is_published);

CREATE INDEX idx_bus_assignments_school_id ON public.bus_assignments USING btree (school_id);

CREATE INDEX idx_bus_assignments_driver_id ON public.bus_assignments USING btree (driver_id);

CREATE INDEX idx_badges_master_scope_class ON public.badges_master USING btree (school_id, custom_scope_class) WHERE (custom_scope_class IS NOT NULL);

CREATE INDEX idx_announcements_dates ON public.announcements USING btree (start_date, expiry_date);

CREATE UNIQUE INDEX idx_school_registrations_code_pending ON public.school_registrations USING btree (lower(school_code)) WHERE (status = 'pending'::text);

CREATE INDEX idx_school_registrations_status ON public.school_registrations USING btree (status, created_at DESC);

CREATE INDEX idx_attendance_user_month ON public.attendance USING btree (user_id, month_year);

CREATE INDEX idx_attendance_school_month ON public.attendance USING btree (school_id, month_year);

CREATE INDEX idx_achievements_student ON public.student_achievements USING btree (student_id, academic_year);

CREATE INDEX idx_achievements_class ON public.student_achievements USING btree (class_name, school_id, awarded_at DESC);

CREATE INDEX idx_achievements_school_badge ON public.student_achievements USING btree (school_id, badge_id, awarded_at DESC);

CREATE INDEX idx_badge_cache_school ON public.badge_visibility_cache USING btree (school_id);

CREATE INDEX idx_complaint_box_school ON public.complaint_box USING btree (school_id);

CREATE INDEX idx_complaint_box_sender ON public.complaint_box USING btree (sender_id);

CREATE INDEX idx_complaint_box_recipient ON public.complaint_box USING btree (recipient_id);

CREATE INDEX idx_syllabus_tracker_school_class ON public.syllabus_tracker USING btree (school_id, class);

CREATE INDEX idx_health_mood_school_student ON public.health_mood_notes USING btree (school_id, student_id, month_year);

CREATE UNIQUE INDEX idx_user_module_views_unique ON public.user_module_views USING btree (user_id, module_name);

CREATE INDEX idx_passkeys_credential_id ON public.user_passkeys USING btree (credential_id);

CREATE INDEX idx_passkeys_user_id ON public.user_passkeys USING btree (user_id);

CREATE INDEX idx_challenges_owner_key ON public.webauthn_challenges USING btree (owner_key);

CREATE INDEX idx_challenges_expires_at ON public.webauthn_challenges USING btree (expires_at);

CREATE INDEX idx_recovery_profiles_user_id ON public.recovery_profiles USING btree (user_id);

CREATE INDEX idx_recovery_profiles_school_id ON public.recovery_profiles USING btree (school_id);

CREATE INDEX idx_recovery_profiles_locked ON public.recovery_profiles USING btree (recovery_locked_until);

CREATE INDEX idx_recovery_sessions_user_id ON public.recovery_ephemeral_sessions USING btree (user_id);

CREATE INDEX idx_recovery_sessions_qr_token ON public.recovery_ephemeral_sessions USING btree (qr_token);

CREATE INDEX idx_recovery_sessions_expires_at ON public.recovery_ephemeral_sessions USING btree (expires_at);

CREATE INDEX idx_brute_force_username ON public.login_brute_force_logs USING btree (username);

CREATE INDEX idx_brute_force_locked_until ON public.login_brute_force_logs USING btree (locked_until);

CREATE INDEX idx_recovery_sessions_qr_token_v2 ON public.recovery_ephemeral_sessions USING btree (qr_token) WHERE (qr_token IS NOT NULL);

CREATE INDEX idx_recovery_sessions_qr_v2 ON public.recovery_ephemeral_sessions USING btree (qr_token) WHERE (qr_token IS NOT NULL);

CREATE INDEX idx_attendance_archived ON public.attendance USING btree (school_id, archived) WHERE (archived = false);

CREATE INDEX idx_academic_archives_school ON public.academic_archives USING btree (school_id, academic_year DESC);

-- ==========================================
-- SECTION 7: PG_CRON SCHEDULES
-- ==========================================

SELECT cron.schedule(
  'cleanup-webauthn-challenges',
  '*/5 * * * *',
  $$
  SELECT public.cleanup_expired_webauthn_challenges();
  $$
);

SELECT cron.schedule(
  'cleanup-recovery-sessions',
  '*/15 * * * *',
  $$
  SELECT public.cleanup_expired_recovery_sessions();
  $$
);

SELECT cron.schedule(
  'cleanup-brute-force-logs',
  '0 4 1 * *',
  $$
  DELETE FROM public.login_brute_force_logs
  WHERE last_attempt_at < NOW() - INTERVAL '30 days';
  $$
);

SELECT cron.schedule(
  'notification-batch-processor-free-tier',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jbjtvosvwufimjcvvwcg.supabase.co/functions/v1/process-notification-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpianR2b3N2d3VmaW1qY3Z2d2NnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1MTM3NCwiZXhwIjoyMDk4MDI3Mzc0fQ.MFjwewzZSXgslBnGB6xT44FWvsCD-Mw7Ib5-O9rgj7Q'
    ),
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'notification-smart-sweeper',
  '30 2 * * *',
  $$
  -- 1. Free plan schools (including trial): Delete notifications older than 3 months
  DELETE FROM public.notifications n
  USING public.school_settings s
  WHERE n.school_id = s.school_id
    AND s.plan_type IN ('free', 'trial')
    AND n.created_at < NOW() - INTERVAL '3 months';

  DELETE FROM public.app_notifications_queue q
  USING public.school_settings s
  WHERE q.school_id = s.school_id
    AND s.plan_type IN ('free', 'trial')
    AND q.created_at < NOW() - INTERVAL '3 months';

  -- 2. Premium plan schools: Delete notifications older than 6 months
  DELETE FROM public.notifications n
  USING public.school_settings s
  WHERE n.school_id = s.school_id
    AND s.plan_type = 'premium'
    AND n.created_at < NOW() - INTERVAL '6 months';

  DELETE FROM public.app_notifications_queue q
  USING public.school_settings s
  WHERE q.school_id = s.school_id
    AND s.plan_type = 'premium'
    AND q.created_at < NOW() - INTERVAL '6 months';

  -- 3. Cleanup orphan notifications / global notification queue items older than 3 months
  DELETE FROM public.notifications
  WHERE school_id IS NULL
    AND created_at < NOW() - INTERVAL '3 months';

  DELETE FROM public.app_notifications_queue
  WHERE school_id IS NULL
    AND created_at < NOW() - INTERVAL '3 months';
  $$
);

CREATE OR REPLACE FUNCTION public.sync_teacher_class_change()
RETURNS trigger AS $$
BEGIN
  -- If the user is a teacher and their class has changed, sync with timetable
  IF NEW.role = 'teacher' AND (OLD.class IS DISTINCT FROM NEW.class) THEN
    -- Sync timetable records
    UPDATE public.timetable
    SET class = NEW.class
    WHERE teacher_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_teacher_class_change
AFTER UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_teacher_class_change();

-- ==========================================
-- SECTION 8: MIGRATION ISOLATION COMMANDS
-- ==========================================

-- Truncate user device tokens to prevent sending cross-region notifications from test env
TRUNCATE TABLE public.user_device_tokens;

-- Reset Google Drive configs to prevent test environment from touching production drive
UPDATE public.school_settings SET gdrive_config = '[]'::jsonb;
UPDATE public.platform_settings SET pa_gdrive_config = '[]'::jsonb;

-- ==========================================
-- SECTION 9: STORAGE BUCKETS & POLICIES
-- ==========================================

-- Create Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('school_assets', 'school_assets', true, null, null),
  ('payment-screenshots', 'payment-screenshots', true, null, null),
  ('gallery', 'gallery', true, null, null),
  ('app-updates', 'app-updates', true, null, null),
  ('academic-archives', 'academic-archives', false, null, null)
ON CONFLICT (id) DO NOTHING;

-- Create Storage Policies
CREATE POLICY "Admin Uploads" ON storage.objects FOR INSERT WITH CHECK (
  (bucket_id = 'school_assets'::text) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'app_manager'::text]))
);

CREATE POLICY "Allow public read of payment-screenshots" ON storage.objects FOR SELECT USING (
  bucket_id = 'payment-screenshots'::text
);

CREATE POLICY "Allow public uploads to payment-screenshots" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'payment-screenshots'::text
);

CREATE POLICY "Authenticated Users Can Write Assets" ON storage.objects FOR ALL USING (
  bucket_id = 'school_assets'::text
) WITH CHECK (
  bucket_id = 'school_assets'::text
);

CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (
  bucket_id = 'school_assets'::text
);

CREATE POLICY "Public Access to App Updates" ON storage.objects FOR SELECT USING (
  bucket_id = 'app-updates'::text
);

CREATE POLICY "Public Read Access for Assets" ON storage.objects FOR SELECT USING (
  bucket_id = 'school_assets'::text
);

CREATE POLICY "Public read of gallery" ON storage.objects FOR SELECT USING (
  bucket_id = 'gallery'::text
);

CREATE POLICY "School-isolated gallery delete" ON storage.objects FOR DELETE USING (
  (bucket_id = 'gallery'::text) AND ((storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))
);

CREATE POLICY "School-isolated gallery management" ON storage.objects FOR UPDATE USING (
  (bucket_id = 'gallery'::text) AND ((storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))
);

CREATE POLICY "School-isolated gallery uploads" ON storage.objects FOR INSERT WITH CHECK (
  (bucket_id = 'gallery'::text) AND ((storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata'::text) ->> 'school_id'::text))
);

CREATE POLICY "Service Role Update Access" ON storage.objects FOR UPDATE USING (
  bucket_id = 'app-updates'::text
);

CREATE POLICY "Service Role Upload Access" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'app-updates'::text
);


