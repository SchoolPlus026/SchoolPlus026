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
        background: 'var(--danger-bg)',
        border: '1px solid var(--danger-border)',
        borderRadius: 14, padding: '14px 18px', marginBottom: 20,
      }}>
        <XCircle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: 'var(--danger)' }}>
            Application Rejected
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Your school registration was declined by the Platform Admin. Please contact support for more information.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'var(--warn-bg)',
      border: '1px solid var(--warn-border)',
      borderRadius: 14, padding: '14px 18px', marginBottom: 20,
    }}>
      <Clock size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13, color: 'var(--warn)' }}>
          Account Under Review
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Your application is currently being reviewed by the Platform Admin. You can explore the interface, but
          <strong style={{ color: 'var(--text-main)' }}> data entry and core features are disabled</strong> until your account is approved.
        </p>
      </div>
    </div>
  );
}
