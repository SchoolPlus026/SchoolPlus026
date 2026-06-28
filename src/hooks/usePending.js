/**
 * usePending.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns true if the logged-in school's account is pending platform approval.
 * Reads from schoolSettings.subscription_status which is already in the store
 * after login — zero extra DB queries.
 *
 * A school is 'pending' when subscription_status === 'Pending'.
 * After approval it becomes 'Paid'; after rejection it becomes 'Rejected'.
 */
import { useAppStore } from '../store/useAppStore';

export function usePending() {
  const schoolSettings = useAppStore((s) => s.schoolSettings);
  const role = useAppStore((s) => s.role);

  // Platform admin and un-authenticated states are never pending
  if (!schoolSettings || role === 'platform_admin') return { isPending: false, isRejected: false };

  const status = schoolSettings?.subscription_status || '';
  return {
    isPending:               status === 'Pending',
    isRejected:              status === 'Rejected',
    isVerificationRequested: status === 'VerificationRequested',
  };
}
