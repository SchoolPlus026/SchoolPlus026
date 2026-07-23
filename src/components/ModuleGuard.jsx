import React from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * ModuleGuard — Multi-tenant module visibility & route enforcement
 *
 * inline=true  → Dashboard card / sidebar link mode (hides card when disabled).
 * inline=false → Full page route guard (renders lock screen when disabled).
 */
export default function ModuleGuard({ moduleName, children, inline = false, alwaysVisible = false }) {
  const { schoolSettings, role, platformSettings } = useAppStore();
  const activeModules = schoolSettings?.modules_active || [];
  const lockedModules = schoolSettings?.locked_modules || [];
  const globallyDisabledModules = Array.isArray(platformSettings?.globally_disabled_modules)
    ? platformSettings.globally_disabled_modules
    : [];

  const isPlatformAdmin = role === 'platform_admin';
  const isAdmin = role === 'admin' || role === 'platform_admin' || role === 'hm';
  const isDefault = moduleName === 'default' || moduleName === 'settings' || moduleName === 'manage-modules';

  // Platform admin, alwaysVisible items, and default system routes bypass checks
  if (alwaysVisible || isDefault || isPlatformAdmin) {
    return children;
  }

  // ── 1st Priority: Master System Kill-Switch ─────────────────────────────
  const isGloballyKilled = globallyDisabledModules.includes(moduleName);
  const hasExplicitSchoolOverride = schoolSettings?.school_override_active?.[moduleName] === true || schoolSettings?.gdrive_config?.school_override_active?.[moduleName] === true;

  if (isGloballyKilled && !hasExplicitSchoolOverride) {
    if (inline) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', fontSize: '28px' }}>🚫</div>
        <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>Module Disabled</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.6 }}>
          This module has been globally disabled by Platform Administration.
        </p>
      </div>
    );
  }

  // ── 2nd Priority: School-Specific Locks & Active Modules ────────────────
  const isLockedForSchool = lockedModules.includes(moduleName);
  const isModuleActiveInSchool = moduleName === 'billing' 
    ? true 
    : (activeModules.length === 0 || activeModules.includes(moduleName));

  const isEnabled = isModuleActiveInSchool && !isLockedForSchool;

  if (inline) {
    return isEnabled ? children : null;
  }

  if (!isEnabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', fontSize: '28px' }}>🔒</div>
        <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>Module Locked</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.6 }}>
          This module is currently locked or disabled for your school.
        </p>
      </div>
    );
  }

  return children;
}
