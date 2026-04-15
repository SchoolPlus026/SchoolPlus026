# Full Reconstruction of School SaaS

This plan covers the comprehensive reconstruction of the School SaaS platform to transition it into a custom, professional, multi-tenant portal inspired by the Little Flower School legacy system.

## Proposed Changes

### 1. UI/UX & CSS Architecture (Soft-UI Grid)

#### [MODIFY] `tailwind.config.js`
- Overhaul the current dark color scheme.
- Set background to a light greyish-blue (`#f1f5f9` or similar).
- Change the `primary` color to Deep Purple (`#6366f1`).
- Modify `text` colors, `surface`, and `card` defaults to align with a bright, professional aesthetic.

#### [MODIFY] `src/layouts/AdminLayout.jsx`
- Completely remove the side navigation drawer.
- Implement a streamlined, premium top header.

#### [NEW] `src/features/dashboard/AdminDashboard.jsx`
- Replace the current empty widget with a Grid-based Master Control Panel.
- Each module (Users, Attendance, Fees, Timetable, Leaves, Gallery, Notices, Calendar, Reports, Settings) will be represented as a large white card with rounded-2xl corners, subtle shadows, and descriptive icons.

#### [MODIFY] System-wide Jargon Updates
- Refactor all components to replace technical jargon with human-readable educational terms:
  - "Inject Schedule Slice" -> "Add Period"
  - "Target Assignment Vector" -> "Select Class"
  - "Node Management" -> "School Dashboard"

---

### 2. Database & Schema Expansion

#### [MODIFY] `database/schema.sql`
- Update the `public.users` table: Added `qualification` (text) and `aadhar_card` (text).
- Implement new tables with strict `school_id` multi-tenant RLS:
  - **`leaves`**: id, school_id, user_id, role, from_date, to_date, reason, status (default 'pending').
  - **`calendar_events`**: id, school_id, title, description, start_date, end_date, type (holiday/exam/event).
  - **`gallery`**: id, school_id, title, link (URL), category.
- Apply full Supabase RLS policies for tenant-level isolation on the new tables.

*(Note: While `schema.sql` is a master script, you may also need to run these updates in your Supabase SQL Editor.)*

---

### 3. Core Functional Modules 

#### [MODIFY] `src/features/attendance/MarkAttendance.jsx`
- Support both "Student Attendance" and "Teacher Attendance" modes.
- Implement strictly enforced queries so Teachers only fetch students from their assigned `class`.

#### [MODIFY] `src/features/fees/StudentFeeLedger.jsx` & `AdminFeeManager.jsx`
- Restructure the UI to prominently display:
  - Last Year Pending
  - Current Year Fees
  - Remaining Due
- Add filtering capability in the Admin Fee Manager to search outstanding fees by class.

#### [NEW] `src/features/dashboard/DigitalIdCard.jsx`
- Create a Digital ID card view for students to be displayed prominently in the Student Dashboard container, featuring Name, Class, and School Logo.

---

### 4. Branding & Signature

#### [MODIFY] `src/features/auth/Login.jsx`
- Implement permanent footer credit: "Developed by Shubham Arun Hajare — Contact: 9022761401"

#### [NEW] `src/features/settings/AdminSettings.jsx`
- Create the Admin settings page allowing for the Customization of School Name and Logo. 
- Include the 'About' section featuring the permanent developer signature.

#### [MODIFY] `src/App.jsx`
- Re-wire all routes to account for the new components (`AdminDashboard`, `AdminSettings`).

## Open Questions

> [!WARNING]
> Since we are altering the database schema (`leaves`, `gallery`, `calendar_events`, and altering `users`), do you want me to also execute this SQL directly over Supabase (if configured), or will you manually run the updated `schema.sql` in your Supabase Editor just like you did for the previous SQL block? 

> [!NOTE]
> Are there specific Tailwind hex codes you want for the extremely light "greyish-blue" background, or shall I utilize Tailwind's default `bg-slate-50` / `bg-indigo-50` configurations?

## Verification Plan

### Automated/Dev Tests
- Vite compilation step will be tested to ensure no React import/export errors occur during the transformation.
- CSS layout configurations will be validated to confirm accurate rendering of the Flex/Grid systems.

### Manual Verification
- You will be able to review the Grid-based Master dashboard immediately after compilation.
- Teacher accounts can be logged into to confirm they are locked to their respective `class` structures.
