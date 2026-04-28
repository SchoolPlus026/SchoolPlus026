/**
 * ManageSubscription.jsx — Self-serve billing & upgrade page for School Admins
 * Route: /admin/billing
 */
import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePlan } from '../../hooks/usePlan';
import { Crown, CheckCircle, Zap, Clock, CreditCard, AlertTriangle, Loader2 } from 'lucide-react';

const fmtDate = (d) => d
  ? `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
  : '—';

// ── Upgrade Plan Card ────────────────────────────────────────────────────────
function PlanCard({ title, price, duration, features, badge, onUpgrade, loading, disabled, highlight }) {
  return (
    <div style={{
      borderRadius: '20px', padding: '28px 24px',
      background: highlight ? 'linear-gradient(145deg,rgba(79,70,229,0.12),rgba(124,58,237,0.08))' : 'var(--glass)',
      border: `1px solid ${highlight ? 'rgba(99,102,241,0.45)' : 'var(--card-border)'}`,
      boxShadow: highlight ? '0 8px 32px rgba(79,70,229,0.15)' : 'none',
      display: 'flex', flexDirection: 'column', gap: '16px',
      position: 'relative', overflow: 'hidden',
    }}>
      {badge && (
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 800,
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{badge}</div>
      )}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1.1 }}>{price}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{duration}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {features.map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-main)' }}>
            <CheckCircle size={13} color="#34d399" style={{ flexShrink: 0 }} /> {f}
          </div>
        ))}
      </div>
      <button
        onClick={onUpgrade}
        disabled={loading || disabled}
        style={{
          width: '100%', padding: '13px', borderRadius: '12px',
          background: disabled ? 'var(--glass)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          border: disabled ? '1px solid var(--card-border)' : 'none',
          cursor: disabled ? 'default' : 'pointer',
          color: disabled ? 'var(--text-faint)' : 'white',
          fontSize: '13px', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          transition: 'all 0.2s ease',
        }}
      >
        {loading ? <><Loader2 size={14} className="animate-spin" /> Upgrading...</>
          : disabled ? 'Current Plan'
          : <><Crown size={14} /> Activate Plan</>}
      </button>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, padding: '12px 20px', borderRadius: '12px',
      background: type === 'error' ? '#450a0a' : '#052e16',
      border: `1px solid ${type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
      color: type === 'error' ? '#fca5a5' : '#86efac',
      fontSize: '13px', fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: '8px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
      {msg}
    </div>
  );
}

export default function ManageSubscription() {
  const { schoolSettings, setSchoolSettings } = useAppStore();
  const { planType, isTrial, isFree, isPremium, billingCycle, trialDaysLeft, subDaysLeft, subEnd, trialStart } = usePlan();
  const [loadingCycle, setLoadingCycle] = useState(null); // 'monthly'|'yearly'|null
  const [toast, setToast] = useState({ msg: '', type: 'success' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 4000);
  };

  const handleUpgrade = async (cycle) => {
    setLoadingCycle(cycle);
    try {
      const { data, error } = await supabase.functions.invoke('school-self-upgrade', {
        body: { billing_cycle: cycle },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Update local Zustand state immediately so the banner reflects the change
      setSchoolSettings({
        ...schoolSettings,
        plan_type:             'premium',
        subscription_tier:     'Premium',
        billing_cycle:         cycle,
        subscription_end_date: data.subscription_end_date,
        trial_start_date:      null,
      });

      showToast(`✅ ${data.message}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingCycle(null);
    }
  };

  const isCurrentPlan = (cycle) => isPremium && !isTrial && billingCycle === cycle;

  const PREMIUM_FEATURES = [
    'Fees & Payment Management',
    'Smart Timetable Builder',
    'Leave Management',
    'Reports & Excel Exports',
    'Full User Management (Add/Edit)',
    'Targeted Notifications',
    'Unlimited Google Drive Gallery',
    'Priority Support',
  ];

  return (
    <div className="space-y-6 fade-in pb-12">
      {/* Header */}
      <div className="sp-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CreditCard size={18} className="text-indigo-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Manage Subscription</h3>
        </div>
      </div>

      {/* Current Plan Status Card */}
      <div className="sp-card">
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Current Plan Status
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '12px' }}>
            {/* Plan type */}
            <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>PLAN</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: isFree ? 'var(--text-muted)' : '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isPremium && !isTrial && <Crown size={16} color="#818cf8" />}
                {isTrial && <Clock size={16} color="#fbbf24" />}
                {planType === 'free' ? 'Free' : planType === 'trial' ? '28-Day Trial' : 'Premium'}
              </div>
            </div>
            {/* Billing cycle */}
            <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>BILLING</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>
                {isTrial ? '28-Day Trial' : billingCycle ? (billingCycle === 'monthly' ? 'Monthly (28 days)' : 'Yearly (365 days)') : '—'}
              </div>
            </div>
            {/* Validity */}
            <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>
                {isTrial ? 'TRIAL ENDS' : isPremium ? 'EXPIRES' : 'VALIDITY'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>
                {isTrial && trialStart ? fmtDate(new Date(trialStart.getTime() + 28 * 86400000)) : isPremium && subEnd ? fmtDate(subEnd) : '—'}
              </div>
            </div>
            {/* Days remaining */}
            {(isTrial || (isPremium && subEnd)) && (
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>DAYS LEFT</div>
                <div style={{
                  fontSize: '22px', fontWeight: 900,
                  color: (isTrial && trialDaysLeft <= 5) || (subDaysLeft !== null && subDaysLeft <= 7) ? '#f87171' : '#34d399',
                }}>
                  {isTrial ? (trialDaysLeft ?? '—') : (subDaysLeft ?? '—')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade Plan Cards */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
          {isPremium && !isTrial ? 'Change or Renew Plan' : 'Upgrade to Premium'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '16px' }}>
          {/* Monthly */}
          {!(isCurrentPlan('monthly') && !isCurrentPlan('yearly')) && (
            <PlanCard
              title="Premium Monthly"
              price="Contact Admin"
              duration="28 days • Renews every 28 days"
              badge={isTrial ? 'Popular' : null}
              highlight={isTrial || isFree}
              features={PREMIUM_FEATURES.slice(0, 5).concat(['28-day billing cycle'])}
              loading={loadingCycle === 'monthly'}
              disabled={isCurrentPlan('monthly')}
              onUpgrade={() => handleUpgrade('monthly')}
            />
          )}
          {/* Yearly */}
          <PlanCard
            title="Premium Yearly"
            price="Contact Admin"
            duration="365 days • Best value"
            badge="Best Value"
            highlight={billingCycle === 'monthly' || isFree}
            features={PREMIUM_FEATURES.concat(['365-day billing cycle', 'Priority support'])}
            loading={loadingCycle === 'yearly'}
            disabled={isCurrentPlan('yearly')}
            onUpgrade={() => handleUpgrade('yearly')}
          />
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '16px', lineHeight: 1.6 }}>
          ⓘ For the demo environment, clicking "Activate Plan" immediately activates the plan.
          In production, this will be connected to a payment gateway.
          1 month = 28 days as per the platform billing policy.
        </p>
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
