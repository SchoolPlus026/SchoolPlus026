import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // Auth state
  user: null,
  role: null, // 'admin', 'teacher', 'student', or 'platform_admin'
  
  // Tenant (School) state for dynamic branding and feature gating
  schoolSettings: null, 
  
  // Impersonation State
  isImpersonating: false,
  originalSession: null, // Stores { user, role, schoolSettings } of the Platform Admin
  
  // Background Uploads (Gallery)
  backgroundUploads: [],
  
  // Actions
  setUserAndRole: (user, role) => set({ user, role }),
  setSchoolSettings: (settings) => set({ schoolSettings: settings }),
  
  setImpersonation: (schoolSettings) => set((state) => ({
    isImpersonating: true,
    originalSession: state.originalSession || { user: state.user, role: state.role, schoolSettings: state.schoolSettings },
    role: 'admin',
    schoolSettings: schoolSettings
  })),

  clearImpersonation: () => set((state) => {
    if (!state.originalSession) return {};
    return {
      isImpersonating: false,
      user: state.originalSession.user,
      role: state.originalSession.role,
      schoolSettings: state.originalSession.schoolSettings,
      originalSession: null
    };
  }),
  
  // Update classes dynamically in state after an admin edit
  setClasses: (newClasses) => set((state) => ({
    schoolSettings: { ...state.schoolSettings, classes: newClasses }
  })),
  
  // Background Upload Actions
  addBackgroundUpload: (upload) => set((state) => ({ backgroundUploads: [...state.backgroundUploads, upload] })),
  updateBackgroundUpload: (id, updates) => set((state) => ({
    backgroundUploads: state.backgroundUploads.map((u) => (u.id === id ? { ...u, ...updates } : u))
  })),
  removeBackgroundUpload: (id) => set((state) => ({
    backgroundUploads: state.backgroundUploads.filter((u) => u.id !== id)
  })),
  
  // Logout action resets everything
  clearSession: () => set({ user: null, role: null, schoolSettings: null, isImpersonating: false, originalSession: null, backgroundUploads: [] }),
}));
