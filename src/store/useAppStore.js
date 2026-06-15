import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set) => ({
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
  
  // Global Avatar Preview Modal State
  previewAvatarUrl: null,
  
  // Cache variables for profile fetching
  profileLastFetched: null,
  platformSettings: null,
  platformSettingsLastFetched: null,
  lastRefreshedAt: null,
  
  // Actions
  setUserAndRole: (user, role) => set({ user, role }),
  setSchoolSettings: (settings) => set({ schoolSettings: settings }),
  setPreviewAvatarUrl: (url) => set({ previewAvatarUrl: url }),
  setProfileLastFetched: (timestamp) => set({ profileLastFetched: timestamp }),
  setPlatformSettings: (settings) => set({ platformSettings: settings }),
  setPlatformSettingsLastFetched: (timestamp) => set({ platformSettingsLastFetched: timestamp }),
  setLastRefreshedAt: (timestamp) => set({ lastRefreshedAt: timestamp }),
  
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
  clearSession: () => set({ user: null, role: null, schoolSettings: null, isImpersonating: false, originalSession: null, backgroundUploads: [], profileLastFetched: null, platformSettings: null, platformSettingsLastFetched: null, lastRefreshedAt: null }),
    }),
    {
      name: 'school-os-storage',
      storage: createJSONStorage(() => localStorage),
      // We don't need to persist backgroundUploads or impersonation state ideally,
      // but for simplicity we can persist the whole store or use partialize.
      partialize: (state) => ({
        user: state.user,
        role: state.role,
        schoolSettings: state.schoolSettings,
        profileLastFetched: state.profileLastFetched,
        platformSettings: state.platformSettings,
        platformSettingsLastFetched: state.platformSettingsLastFetched,
        lastRefreshedAt: state.lastRefreshedAt,
      }),
    }
  )
);
