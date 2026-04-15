# Modern School SaaS Application Architecture

This document serves as the master architectural plan for rebuilding the legacy MVP into a modern, scalable, multi-tenant SaaS.

## Acknowledgment of Strict Constraints
I fully understand and accept your workspace constraints:
1.  **No Local Setup Commands:** I will not run `npm install`, `npm create vite`, or rely on any local dev servers or setups. I will manually write `package.json`, `vite.config.js`, `index.html`, and all scaffolding files myself.
2.  **No Local Android SDK:** I will completely set up the `capacitor.config.json` and the GitHub Actions YAML workflows to build the headless Android APK entirely on GitHub servers.
3.  **Terminal Limitation:** You will exclusively use `git push`. I will act as the compiler locally.

## Proposed Tech Stack Additions & Improvements
To complement React, Vite, Tailwind CSS, Supabase, FCM, and Capacitor, I suggest the following libraries to ensure a robust, enterprise-level architecture:

1.  **Zustand (State Management):** Instead of Redux (which is bulky) or React Context (which can cause re-render issues in complex apps), Zustand provides a highly optimized, lightweight global state perfect for managing current tenant, user role, and session.
2.  **React Router v6:** Standard, declarative routing for handling the complex role-based protected routes (`/admin/*`, `/teacher/*`, `/student/*`).
3.  **React Query (TanStack Query):** Supabase provides a great client, but pairing it with React Query will give us automatic caching, background refetching, and drastically better performance data loading for dashboards.
4.  **Lucide React:** Beautiful, consistent, and lightweight icon library to replace old SVG hardcoding.

## Proposed Folder Structure (Feature-Based Architecture)

Instead of dumping everything into one huge `components` folder, I propose a highly modular **Feature-Based Architecture**. This makes a large multi-tenant SaaS much easier to scale.

```text
/
├── .github/
│   └── workflows/
│       └── build-apk.yml     # GitHub Actions fully headless build pipeline
├── public/                   # Static assets (favicons, PWA manifests)
├── src/
│   ├── assets/               # Images, generic vectors
│   ├── components/           # Generic, reusable UI components (Buttons, Modals, Cards)
│   ├── config/               # Initialization for Supabase, Firebase FCM, App config
│   ├── features/             # Business Logic Domains (The Core of the App!)
│   │   ├── auth/             # Login, Session verification
│   │   ├── dashboard/        # Role-specific dashboard widgets
│   │   ├── attendance/       # Mark attendance, summary charts
│   │   ├── fees/             # Fee structures, payment gateways/records
│   │   ├── timetable/        # Schedule mapping
│   │   └── notices/          # FCM tied notice creation/reading
│   ├── layouts/              # Wrapper layouts (AdminLayout, PublicLayout, AppLayout)
│   ├── routes/               # Centralized React Router definitions
│   ├── store/                # Zustand global state slices
│   ├── utils/                # Helper functions (date formatters, hashers)
│   ├── App.jsx               # Root Component
│   ├── index.css             # Main Tailwind + CSS variables
│   └── main.jsx              # React Entry Point
├── .gitignore
├── capacitor.config.json     # Capacitor settings for Android APK compilation
├── package.json              # Defines all dependencies and scripts manually
├── tailwind.config.js        # Tailoring Tailwind
└── vite.config.js            # Vite compiler configuration
```

## Database Strategy (Supabase RLS & Multi-Tenancy)
1.  **`school_id` Column:** Every table (Users, Attendance, Fees, Events) will have a `school_id` UUID constraint.
2.  **Postgres RLS Policies:** We will write SQL policies that guarantee a query can ONLY return rows where `auth.jwt() -> 'user_metadata' ->> 'school_id'` matches the row's `school_id`. This prevents cross-tenant data leaks natively at the database level.
3.  **`schools` Table:** Manages subscriptions, logos, and features enabled directly linked to the monetization strategy.

## User Review Required

> [!IMPORTANT]  
> Please review the proposed folder structure and tech stack additions (Zustand, React Query). Let me know if you approve this structure so we can proceed to generate the foundational files.
