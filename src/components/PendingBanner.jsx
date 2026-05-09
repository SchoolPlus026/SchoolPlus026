import React from 'react';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';
import { usePending } from '../hooks/usePending';

/**
 * PendingBanner
 * Shows a prominent warning at the top of any admin/teacher page when the
 * school's account is pending platform approval (or has been rejected).
 * Returns null for approved schools — zero render cost.
 */
export default function PendingBanner() {
  const { isPending, isRejected } = usePending();

  if (!isPending && !isRejected) return null;

  if (isRejected) {
    return (
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 20,
      }}>
        <XCircle size={20} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: '#f87171' }}>
            Application Rejected
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            Your school registration was declined by the Platform Admin. Please contact support for more information.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'rgba(251,191,36,0.07)',
      border: '1px solid rgba(251,191,36,0.3)',
      borderRadius: 14, padding: '14px 18px', marginBottom: 20,
    }}>
      <Clock size={20} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: '#fbbf24' }}>
          Account Under Review
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
          Your application is currently being reviewed by the Platform Admin. You can explore the interface, but
          <strong style={{ color: '#e2e8f0' }}> data entry and core features are disabled</strong> until your account is approved.
        </p>
      </div>
    </div>
  );
}
