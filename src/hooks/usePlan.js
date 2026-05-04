/**
 * usePlan.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the current school's subscription plan state.
 * Reads directly from schoolSettings (loaded at login — no extra network call).
 * Business rule: 1 month = 28 days, 1 year = 365 days.
 */
import { useAppStore } from '../store/useAppStore';

export function usePlan() {
  const schoolSettings = useAppStore((s) => s.schoolSettings);

  const planType       = schoolSettings?.plan_type         || 'free';   // 'free'|'trial'|'premium'
  const billingCycle   = schoolSettings?.billing_cycle     || null;      // 'monthly'|'yearly'|null
  const trialStart     = schoolSettings?.trial_start_date  ? new Date(schoolSettings.trial_start_date)  : null;
  const subEnd         = schoolSettings?.subscription_end_date ? new Date(schoolSettings.subscription_end_date) : null;

  // Trial days remaining (28-day window)
  let trialDaysLeft = null;
  if (planType === 'trial' && trialStart) {
    const msLeft = (trialStart.getTime() + 28 * 86400000) - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  }

  // Subscription days remaining (for premium)
  let subDaysLeft = null;
  if (planType === 'premium' && subEnd) {
    const msLeft = subEnd.getTime() - Date.now();
    subDaysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  }

  const isTrial   = planType === 'trial';
  const isFree    = planType === 'free';
  const isPremium = (planType === 'premium' && subDaysLeft > 0) || (isTrial && trialDaysLeft > 0);

  return {
    planType,
    billingCycle,
    isPremium,
    isTrial,
    isFree,
    trialDaysLeft,
    subDaysLeft,
    trialStart,
    subEnd,
    schoolSettings,
  };
}
