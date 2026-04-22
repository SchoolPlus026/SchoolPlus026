import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // Auth state
  user: null,
  role: null, // 'admin', 'teacher', 'student', or 'platform_admin'
  
  // Tenant (School) state for dynamic branding and feature gating
  schoolSettings: null, 
  
  // Actions
  setUserAndRole: (user, role) => set({ user, role }),
  setSchoolSettings: (settings) => set({ schoolSettings: settings }),
  
  // Update classes dynamically in state after an admin edit
  setClasses: (newClasses) => set((state) => ({
    schoolSettings: { ...state.schoolSettings, classes: newClasses }
  })),
  
  // Logout action resets everything
  clearSession: () => set({ user: null, role: null, schoolSettings: null }),
}));
