/**
 * FeatureGuard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Gate any feature by subscription plan. Two usage modes:
 *
 * MODE 1 — Route-level (full page replacement):
 *   <FeatureGuard feature="fees">
 *     <AdminFeeManager />
 *   </FeatureGuard>
 *   → Free plan users see the Premium modal instead of the page.
 *
 * MODE 2 — Inline (wraps a button or section):
 *   <FeatureGuard feature="calendar_add" inline>
 *     <button>Add Event</button>
 *   </FeatureGuard>
 *   → Free plan users see a disabled, grayed-out element. Clicking opens the modal.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Lock, X, Zap, ArrowRight } from 'lucide-react';
import { usePlan } from '../hooks/usePlan';

// ── Feature permission map ────────────────────────────────────────────────────
// true  = available on free plan
// false = premium only (locked for free)
const FREE_FEATURES = {
  // Fully locked on Free
  fees:                    false,
  timetable:               false,
  leaves:                  false,
  reports:                 false,
  users_manage:            false,
  // Partially locked on Free
  calendar_add:            false,  // calendar VIEW is free, ADD/EDIT is not
  notifications_targeted:  false,  // global ok, targeting class/role is not
  // Always free
  gallery:                 true,
  attendance_view:         true,
  notices:                 true,
  calendar_view:           true,
  contact:                 true,
  settings:                true,
  dashboard:               true,
  profile:                 true,
};

const FEATURE_LABELS = {
  fees:                   'Fees & Payments Module',
  timetable:              'Timetable Builder',
  leaves:                 'Leave Management',
  reports:                'Reports & Exports',
  users_manage:           'User Management (Add/Edit)',
  calendar_add:           'Calendar Event Creation',
  notifications_targeted: 'Targeted Notifications',
};

// ── Premium Upgrade Modal ─────────────────────────────────────────────────────
function UpgradeModal({ featureLabel, onClose, onUpgrade }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '420px',
          borderRadius: '24px',
          background: 'linear-gradient(145deg, rgba(18,16,56,0.98) 0%, rgba(10,8,36,0.99) 100%)',
          border: '1px solid rgba(99,102,241,0.4)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
          padding: '32px 28px 28px',
          display: 'flex', flexDirection: 'column', gap: '20px',
          animation: 'featureGuardSlide 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
        >
          <X size={18} />
        </button>

        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '18px', flexShrink: 0,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
          }}>
            <Crown size={24} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#f1f5f9', marginBottom: '4px' }}>
              Premium Feature
            </div>
            <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: 600 }}>
              {featureLabel} requires a Premium plan
            </div>
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(99,102,241,0.18)' }} />

        {/* Feature list */}
        <div style={{ padding: '14px 16px', borderRadius: '14px', background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
            Premium Includes
          </div>
          {[
            '💰 Fees & Payment Management',
            '📅 Smart Timetable Builder',
            '🌿 Leave Management',
            '📊 Reports & Excel Exports',
            '👥 Full User Management',
            '🎯 Targeted Notifications',
          ].map((f) => (
            <div key={f} style={{ fontSize: '12px', color: '#cbd5e1', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={11} color="#818cf8" /> {f}
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onUpgrade}
          style={{
            width: '100%', padding: '15px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            border: 'none', cursor: 'pointer',
            color: 'white', fontSize: '14px', fontWeight: 800,
            boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Crown size={16} /> View Upgrade Options <ArrowRight size={14} />
        </button>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px', borderRadius: '14px',
            background: 'transparent', border: '1px solid rgba(99,102,241,0.25)',
            cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: 600,
          }}
        >
          Maybe Later
        </button>
      </div>

      <style>{`
        @keyframes featureGuardSlide {
          from { opacity: 0; transform: translateY(24px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  );
}

// ── FeatureGuard Component ────────────────────────────────────────────────────
export default function FeatureGuard({ feature, children, inline = false }) {
  const { isPremium } = usePlan();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const isLocked = !isPremium && FREE_FEATURES[feature] === false;
  const label    = FEATURE_LABELS[feature] || feature;

  const handleUpgrade = () => {
    setShowModal(false);
    navigate('/admin/billing');
  };

  // Free feature — always render children
  if (!isLocked) return children;

  // ── INLINE MODE: render a disabled wrapper ────────────────────────────────
  if (inline) {
    return (
      <>
        <div
          onClick={() => setShowModal(true)}
          title={`${label} — Premium only`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: 0.55, position: 'relative' }}
        >
          <div style={{ pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
          <Lock size={12} color="#818cf8" />
        </div>
        {showModal && <UpgradeModal featureLabel={label} onClose={() => setShowModal(false)} onUpgrade={handleUpgrade} />}
      </>
    );
  }

  // ── ROUTE-LEVEL MODE: replace the entire page ─────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{
        width: '72px', height: '72px', borderRadius: '22px',
        background: 'linear-gradient(135deg, rgba(79,70,229,0.15) 0%, rgba(124,58,237,0.15) 100%)',
        border: '1px solid rgba(99,102,241,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <Lock size={32} color="#818cf8" />
      </div>

      <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px', maxWidth: '340px', lineHeight: 1.6 }}>
        This module is part of the <strong style={{ color: '#818cf8' }}>Premium Plan</strong>. Upgrade to unlock it and all other premium features.
      </div>

      <button
        onClick={() => navigate('/admin/billing')}
        style={{
          padding: '14px 28px', borderRadius: '14px',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          border: 'none', cursor: 'pointer',
          color: 'white', fontSize: '14px', fontWeight: 800,
          boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}
      >
        <Crown size={16} /> View Plans & Upgrade
      </button>
    </div>
  );
}
