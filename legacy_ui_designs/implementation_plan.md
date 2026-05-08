# SchoolPro UI Overhaul & Bug Fix Plan

## Background

The current React app has three critical bugs AND a UI that needs to match the legacy blueprint. After deep analysis of the codebase and the `legacy_ui_designs/index.html`, I have identified the exact root cause of every issue.

---

## 🔴 Root Cause Analysis (The Bug Hunt Results)

### Bug 1: Pages Do Not Scroll At All
**Root Cause: `index.html` line 13** — The `<body>` tag has `overflow-hidden` class applied:
```html
<body class="bg-background text-text antialiased h-screen w-screen overflow-hidden m-0 p-0">
```
`overflow-hidden` on the `<body>` and `h-screen` fixes the body to viewport height with no overflow. This means **nothing on the entire page can ever scroll**. Even though the layouts have `overflow-y-auto` on `<main>`, the parent `<body>` clips everything.

**Fix:** Change `overflow-hidden` → `overflow-auto` (or remove it), and change `h-screen` on body to just let it grow naturally.

### Bug 2: Teacher & Student Dashboards Crash to White Screen
**Root Cause: `StudentDashboard.jsx` line 14** — The `useQuery` hook has a **race condition**:
```jsx
queryKey: ['my-attendance-stats', user.id],
```
`user.id` is accessed directly even though `user` can be `null` during the loading phase. However the real crash is on **line 19**: `useQuery` is called with `user.id` but if `user` is null (even for a split second during hydration), `user.id` throws `Cannot read properties of null`. This causes React to unmount the entire component tree with an unhandled error, resulting in a white screen.

The `enabled: !!user?.id` guard on line 23 does NOT prevent the crash — the queryKey is evaluated before `enabled` is checked by React Query.

**Additionally:** `StudentDashboard` imports `StudentAttendanceChart` from `./StudentAttendanceChart` (the local `dashboard/` version) but `App.jsx` imports `StudentAttendanceChart` from `features/attendance/StudentAttendanceChart`. This path inconsistency means there's a duplication.

**TeacherDashboard** would crash similarly if `DashboardHero` (which the teacher uses too) throws due to a missing `schoolSettings?.school_id`.

**Fix:** Add null-guards — use `user?.id` in `queryKey` and wrap the entire component body in an early return if `!user`.

### Bug 3: Admin Settings — Theme, Language Are Missing
**Root Cause:** The `AdminSettings.jsx` already HAS the Theme and Language selects in the code — they are in the "App Preferences" card starting at line 162. However, the Tailwind semantic colors `bg-background`, `bg-surface`, `border-border`, `text-text`, `text-muted` etc. referenced throughout are **not resolving** because the Tailwind config extends colors but the CSS variables are **never actually set** in `index.css`. 

The `index.css` has an empty `:root {}` block with only a comment. This means all `bg-background`, `text-text`, `border-border`, `text-muted` colors **resolve to nothing** (transparent/black/default browser behavior). This causes elements to be invisible or render incorrectly, making the settings panels appear "missing".

**Fix:** Populate `index.css` with the proper CSS custom property values so semantic tokens resolve correctly.

---

## User Review Required

> [!IMPORTANT]
> The scrolling bug is caused by `overflow-hidden` on `<body>` in `index.html`. This is a single-line fix but is the most critical issue.

> [!WARNING]
> The `StudentDashboard.jsx` imports `StudentAttendanceChart` from a *local* `./StudentAttendanceChart` path within the `features/dashboard/` folder. But `App.jsx` line 28 imports it from `features/attendance/StudentAttendanceChart`. There are TWO copies of this component. I will canonicalize this by using the `features/attendance/` version everywhere and removing the duplicate.

---

## Proposed Changes

### Component 1: Root HTML — Scrolling Fix

#### [MODIFY] index.html
- Remove `overflow-hidden` from `<body>` class
- Remove `h-screen w-screen` constraints from `<body>`
- Keep `w-full` on `#root` but let it grow naturally

---

### Component 2: Global CSS — Fix invisible semantic tokens

#### [MODIFY] src/index.css
Add proper CSS variable definitions so that all Tailwind semantic color tokens (`bg-background`, `text-text`, `border-border`, `text-muted`, `bg-primary`) resolve to actual colors. Also import Inter font and set base font-family.

---

### Component 3: StudentDashboard — Fix white screen crash

#### [MODIFY] src/features/dashboard/StudentDashboard.jsx
- Add null guard: early return loading spinner if `!user`
- Fix `queryKey` to use `user?.id ?? null` to prevent null dereference
- Fix the import path for `StudentAttendanceChart` to use `../../features/attendance/StudentAttendanceChart` (or relative from dashboard — same folder either way... the `./StudentAttendanceChart` file in dashboard is a *different file*)

> The `dashboard/StudentAttendanceChart.jsx` (82 lines without data, pie chart only) vs `attendance/StudentAttendanceChart.jsx` (full component). The dashboard correctly imports from `./StudentAttendanceChart` which is in `dashboard/` — this IS the correct local file. The `App.jsx` import was an unused extra. No conflict here, just need the null guard.

---

### Component 4: TeacherDashboard — Safety guard

#### [MODIFY] src/features/dashboard/TeacherDashboard.jsx  
- Add null guard for `user` and `schoolSettings` before render (safe early return)

---

### Component 5: DashboardHero — Fix potential crash

#### [MODIFY] src/components/DashboardHero.jsx
- Make `queryKey` safe with fallback: `schoolSettings?.school_id ?? 'none'` 
- Make `enabled` guard strict: `!!schoolSettings?.school_id`

---

### Component 6: Layouts — Fix scrolling in layouts

#### [MODIFY] src/layouts/AdminLayout.jsx
#### [MODIFY] src/layouts/TeacherLayout.jsx  
#### [MODIFY] src/layouts/StudentLayout.jsx

The layouts use `flex-col min-h-screen` with `flex-1 overflow-y-auto` on `<main>`. Once the body `overflow-hidden` is removed, the `overflow-y-auto` on `<main>` needs the parent `<div>` to also be `h-screen` (a fixed height) for `overflow-y-auto` to work. Change the outer `<div>` from `min-h-screen` to `h-screen` so the flex container is bounded and `<main>` can scroll within it.

---

### Component 7: AdminSettings — Add visual improvements & fix legacy settings sections

#### [MODIFY] src/features/settings/AdminSettings.jsx
The settings **ARE** in the code but may appear broken due to CSS token resolution. After fixing `index.css`, verify all sections render. Also add the missing **Theme** (dark/light toggle applied to `data-theme` on `<html>`) and **Language** sections that store to `localStorage` (matching legacy behavior).

---

## Verification Plan

### Automated Build Check
```powershell
cd "c:\Users\Icon\Downloads\new school app"
npm run dev
```

### Manual Verification Checklist
1. ✅ Open browser → login page loads and is scrollable
2. ✅ Login as admin → AdminDashboard loads, page scrolls
3. ✅ Navigate to `/admin/settings` → All three sections visible (School Identity, App Preferences with Theme+Language, Class Registry, Danger Zone)
4. ✅ Login as teacher → TeacherDashboard loads (no white screen)
5. ✅ Login as student → StudentDashboard loads (no white screen, attendance chart renders)
6. ✅ All module pages scroll normally
