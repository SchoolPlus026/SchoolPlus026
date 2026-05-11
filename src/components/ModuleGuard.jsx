import React from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * ModuleGuard — Multi-tenant module visibility enforcement
 *
 * inline=true  → Dashboard card / sidebar link mode.
 *               Hides for EVERYONE (including Admin) when module is OFF.
 *               This is how the Admin "also loses sight" of a disabled card.
 *               alwaysVisible=true overrides this (used for Manage Modules card).
 *
 * inline=false → Full page route guard.
 *               Admins ALWAYS get through so they never lose data access.
 *               End users see the lock screen.
 */
export default function ModuleGuard({ moduleName, children, inline = false, alwaysVisible = false }) {
  const { schoolSettings, role } = useAppStore();
  const activeModules = schoolSettings?.modules_active || [];

  const isAdmin = role === 'admin' || role === 'platform_admin';
  const isDefault = moduleName === 'default';
  const isEnabled = alwaysVisible || isDefault || activeModules.includes(moduleName);

  // ── Inline mode (dashboard cards / sidebar links) ──────────────────────────
  // Hides for everyone, including admin, when module is OFF.
  // Only alwaysVisible or 'default' cards remain.
  if (inline) {
    return isEnabled ? children : null;
  }

  // ── Full page mode (route guard) ───────────────────────────────────────────
  // Admin always bypasses so they retain data access even for "hidden" modules.
  if (isAdmin || isEnabled) {
    return children;
  }

  // Lock screen for end-users who navigate via direct URL
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'var(--glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', fontSize: '28px' }}>🚫</div>
      <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>Module Disabled</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px', lineHeight: 1.6 }}>
        This feature has been turned off by the administration. Contact your school admin to re-enable it.
      </p>
    </div>
  );
}
