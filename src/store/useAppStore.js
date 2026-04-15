import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // Auth state
  user: null,
  role: null, // 'admin', 'teacher', or 'student'
  
  // Tenant (School) state for dynamic branding and feature gating
  schoolSettings: null, 
  
  // Actions
  setUserAndRole: (user, role) => set({ user, role }),
  setSchoolSettings: (settings) => set({ schoolSettings: settings }),
  
  // Logout action resets everything
  clearSession: () => set({ user: null, role: null, schoolSettings: null }),
}));
