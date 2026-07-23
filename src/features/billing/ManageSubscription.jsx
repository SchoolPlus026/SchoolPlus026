/**
 * ManageSubscription.jsx — School Admin billing page with Razorpay Integration
 * Route: /admin/billing
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePlan } from '../../hooks/usePlan';
import {
  Crown, CheckCircle, Clock, CreditCard, AlertTriangle,
  Loader2, Zap, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';

const fmtDate = (d) => d
  ? `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
  : '—';

const fmtDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const PREMIUM_FEATURES = [
  '💰 Fees & Payment Management',
  '📅 Smart Timetable Builder',
  '🌿 Leave Management',
  '📊 Reports & Excel Exports',
  '🎯 Targeted Notifications',
  '📁 Unlimited Google Drive Gallery',
  '🔒 Priority Support',
];

/* ── Toast ── */
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

/* ── Accordion Transaction Row ── */
function TransactionRow({ tx, isLast, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = tx.status === 'SUCCESSFUL'
    ? { bg: 'var(--success-bg)', fg: 'var(--success)' }
    : tx.status === 'FAILED'
      ? { bg: 'var(--danger-bg)', fg: 'var(--danger)' }
      : { bg: 'var(--warn-bg)', fg: 'var(--warn)' };

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--card-border)' }}>
      {/* Collapsed row — click to expand */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px', cursor: 'pointer',
          background: expanded ? 'rgba(79,70,229,0.04)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
              {tx.subscription_plans?.name || 'Subscription'}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 800,
              background: statusColor.bg, color: statusColor.fg,
            }}>
              {tx.status}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {fmtDate(new Date(tx.created_at))} &nbsp;·&nbsp; ₹{(tx.amount_paise / 100).toFixed(2)}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  : <ChevronDown size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px',
          background: 'rgba(79,70,229,0.03)',
          borderTop: '1px solid var(--card-border)',
          animation: 'fcmFadeIn 0.15s ease',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px', marginBottom: '14px' }}>
            {[
              ['Plan', tx.subscription_plans?.name || '—'],
              ['Amount', `₹${(tx.amount_paise / 100).toFixed(2)}`],
              ['Status', tx.status],
              ['Date & Time', fmtDateTime(tx.created_at)],
              ['Razorpay Order ID', tx.razorpay_order_id || '—'],
              ['Payment ID', tx.razorpay_payment_id || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', fontFamily: label.includes('ID') ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
              </div>
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(tx.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '10px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          >
            <Trash2 size={13} /> Delete Record
          </button>
        </div>
      )}
    </div>
  );
}

export default function ManageSubscription() {
  const { schoolSettings } = useAppStore();
  const { planType, isTrial, isFree, isPremium, billingCycle, trialDaysLeft, subDaysLeft, subEnd, trialStart } = usePlan();

  const pricingModel = schoolSettings?.pricing_model || 'fixed';
  const perUserRate = schoolSettings?.per_user_rate || 0;
  const contractedUserCount = schoolSettings?.contracted_user_count || 0;
  const customBillingAmount = schoolSettings?.custom_billing_amount || 0;

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [toast, setToast] = useState({ msg: '', type: 'success' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 5000);
  };

  useEffect(() => {
    // Load Razorpay SDK
    if (!window.document.getElementById('razorpay-sdk')) {
      const script = window.document.createElement('script');
      script.id = 'razorpay-sdk';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      window.document.body.appendChild(script);
    }

    const fetchPlans = async () => {
      setLoadingPlans(true);
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('amount_paise', { ascending: true });
      if (!error && data) setPlans(data);
      setLoadingPlans(false);
    };

    const fetchTransactions = async () => {
      if (!schoolSettings?.school_id) return;
      setLoadingTx(true);
      const { data, error } = await supabase
        .from('subscription_transactions')
        .select('*, subscription_plans(name)')
        .eq('school_id', schoolSettings.school_id)
        .order('created_at', { ascending: false });
      if (!error && data) setTransactions(data);
      setLoadingTx(false);
    };

    fetchPlans();
    fetchTransactions();
  }, [schoolSettings?.school_id]);

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Delete this transaction record? This cannot be undone.')) return;
    const { error } = await supabase
      .from('subscription_transactions')
      .delete()
      .eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    setTransactions(prev => prev.filter(t => t.id !== id));
    showToast('Transaction deleted.', 'success');
  };

  /**
   * Extracts a human-readable error message from a Supabase FunctionsHttpError or standard Error.
   * The Supabase JS SDK wraps 4xx responses in FunctionsHttpError whose .message is just
   * "Edge Function returned a non-2xx status code". The real error JSON lives in error.context.
   */
  const extractEdgeFnError = async (err) => {
    try {
      const ctx = err?.context;
      if (ctx && typeof ctx.json === 'function') {
        const json = await ctx.json();
        return json?.error || json?.message || err.message;
      }
    } catch (_) { /* ignore */ }
    return err?.message || 'An unknown error occurred';
  };

  /**
   * Calls verify-razorpay-payment. On first failure, waits 2s and retries once.
   * Returns the verifyData on success, throws on failure.
   */
  const verifyPaymentWithRetry = async (payload, attempt = 1) => {
    const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('verify-razorpay-payment', {
      body: payload
    });

    if (verifyErr) {
      const errMsg = await extractEdgeFnError(verifyErr);
      if (attempt < 2) {
        console.warn(`[Billing] Verification attempt ${attempt} failed: ${errMsg}. Retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        return verifyPaymentWithRetry(payload, attempt + 1);
      }
      throw new Error(errMsg);
    }

    if (verifyData?.error) throw new Error(verifyData.error);
    if (!verifyData?.success) throw new Error('Verification returned unexpected response');

    return verifyData;
  };

  const handleBuyPlan = async (plan) => {
    if (!window.Razorpay) {
      showToast('Razorpay SDK failed to load. Are you online?', 'error');
      return;
    }

    setProcessingPlanId(plan.id);

    try {
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: { plan_id: plan.id, school_id: schoolSettings.school_id }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: 'SchoolOS+',
        description: `${plan.name} Subscription`,
        order_id: data.order_id,
        notes: { school_id: schoolSettings.school_id, plan_type: plan.name },
        handler: async function (response) {
          showToast('Payment received. Activating Premium...', 'success');
          const paymentId = response?.razorpay_payment_id || response?.payment_id || (typeof response === 'string' ? response : null);
          const orderId = response?.razorpay_order_id || options.order_id;
          try {
            if (!orderId || !paymentId) {
              throw new Error('Razorpay did not return required payment fields. Please contact support.');
            }

            await verifyPaymentWithRetry({
              razorpay_order_id: orderId,
              razorpay_payment_id: paymentId,
              school_id: schoolSettings.school_id,
            });

            // Refresh school settings in the store
            const { data: s } = await supabase
              .from('school_settings')
              .select('*')
              .eq('school_id', schoolSettings.school_id)
              .single();
            if (s) useAppStore.getState().setSchoolSettings(s);

            showToast('✨ Premium Activated Successfully!', 'success');
            setTimeout(() => window.location.reload(), 1500);

          } catch (err) {
            console.error('[Billing] Verification error:', err);
            // Surface the payment ID so the user can contact support if needed
            const supportMsg = paymentId
              ? `Verification failed. Your payment (${paymentId}) was received. Please contact support if premium is not activated within 10 minutes.`
              : `Verification failed: ${err.message}`;
            showToast(supportMsg, 'error');
          }
        },
        prefill: { name: schoolSettings.name },
        theme: { color: '#4f46e5' },
      };

      if (Capacitor.isNativePlatform() && window.RazorpayCheckout) {
        try {
          window.RazorpayCheckout.open(options,
            (successResponse) => options.handler(successResponse),
            (errorResponse) => showToast(`Payment Failed: ${errorResponse.description || 'User Closed'}`, 'error')
          );
        } catch (nativeErr) {
          showToast(`Plugin Error: ${nativeErr.message || nativeErr}`, 'error');
        }
      } else {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response) => showToast(`Payment Failed: ${response.error.description}`, 'error'));
        rzp.open();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProcessingPlanId(null);
    }
  };

  const isCurrentlyPremium = isPremium && !isTrial;

  return (
    <div className="space-y-6 fade-in pb-12">
      {/* Header */}
      <div className="sp-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CreditCard size={18} style={{ color: '#818cf8' }} />
          <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Manage Subscription
          </h3>
        </div>
      </div>

      {/* Current Plan Status */}
      <div className="sp-card">
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
          Current Plan Status
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '10px' }}>
          <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>PLAN</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: isFree ? 'var(--text-muted)' : '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isCurrentlyPremium && <Crown size={14} color="#818cf8" />}
              {isTrial && <Clock size={14} color="var(--warn)" />}
              {planType === 'free' ? 'Free' : planType === 'trial' ? '28-Day Trial' : 'Premium'}
            </div>
          </div>
          <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>PRICING MODEL</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>
              {pricingModel === 'per_user' ? `Per-User (₹${perUserRate}/user)` : 'Fixed Plan'}
            </div>
          </div>
          <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>BILLING AMOUNT</div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#34d399' }}>
              {customBillingAmount > 0 ? `₹${customBillingAmount.toLocaleString()}` : (pricingModel === 'per_user' ? `₹${(perUserRate * contractedUserCount).toLocaleString()}` : '—')}
            </div>
          </div>
          <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>
              {isTrial ? 'TRIAL ENDS' : isCurrentlyPremium ? 'EXPIRES' : 'VALIDITY'}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
              {isTrial && trialStart ? fmtDate(new Date(trialStart.getTime() + 28 * 86400000))
                : isCurrentlyPremium && subEnd ? fmtDate(subEnd) : '—'}
            </div>
          </div>
          {(isTrial || (isCurrentlyPremium && subEnd)) && (
            <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--glass)', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>DAYS LEFT</div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: (isTrial && trialDaysLeft <= 5) || (subDaysLeft !== null && subDaysLeft <= 7) ? '#f87171' : '#34d399' }}>
                {isTrial ? (trialDaysLeft ?? '—') : (subDaysLeft ?? '—')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upgrade Section */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
          {isCurrentlyPremium ? 'Renew / Change Plan' : 'Upgrade to Premium'}
        </div>

        <div className="sp-card mb-6" style={{ background: 'linear-gradient(145deg,rgba(79,70,229,0.05),rgba(124,58,237,0.03))' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '10px' }}>
            {PREMIUM_FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-main)' }}>
                <CheckCircle size={14} color="#34d399" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {loadingPlans ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Loader2 size={24} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ maxWidth: '440px', margin: '0 auto' }}>
          <div style={{
            borderRadius: '24px', padding: '28px',
            background: 'linear-gradient(145deg, rgba(30, 27, 75, 0.95), rgba(15, 12, 41, 0.95))',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
            display: 'flex', flexDirection: 'column',
            position: 'relative', overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Assigned Subscription Plan
                </span>
                <h4 style={{ margin: '10px 0 0', fontSize: '20px', fontWeight: 900, color: '#f8fafc' }}>
                  {isCurrentlyPremium ? 'Renew Subscription' : 'Upgrade Account'}
                </h4>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>
                  {(billingCycle === 'yearly' ? 365 : 28)} Days Full Access
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                <Crown size={24} color="#818cf8" />
              </div>
            </div>

            {(() => {
              const assignedAmount = customBillingAmount > 0
                ? customBillingAmount
                : (pricingModel === 'per_user' && perUserRate > 0 && contractedUserCount > 0)
                  ? (perUserRate * contractedUserCount)
                  : (plans.length > 0 ? (plans[0].amount_paise / 100) : 0);

              const singlePlanObj = {
                id: schoolSettings?.school_id || 'custom-assigned-plan',
                name: `${schoolSettings?.name || 'School'} Subscription Plan`,
                amount_paise: Math.round(assignedAmount * 100),
                validity_days: (billingCycle === 'yearly' ? 365 : 28)
              };

              return (
                <>
                  <div style={{ fontSize: '36px', fontWeight: 900, color: '#38bdf8', marginBottom: '24px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '20px', color: '#64748b' }}>₹</span>
                    {assignedAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginLeft: '6px' }}>
                      / {billingCycle === 'yearly' ? 'Year' : 'Month'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleBuyPlan(singlePlanObj)}
                    disabled={processingPlanId === singlePlanObj.id || assignedAmount <= 0}
                    style={{
                      width: '100%', padding: '16px', borderRadius: '14px',
                      background: assignedAmount > 0 ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : '#334155',
                      border: 'none', cursor: assignedAmount > 0 ? 'pointer' : 'not-allowed',
                      color: 'white', fontSize: '15px', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                      boxShadow: assignedAmount > 0 ? '0 8px 20px rgba(79, 70, 229, 0.4)' : 'none',
                      transition: 'all 0.2s', opacity: processingPlanId === singlePlanObj.id ? 0.7 : 1
                    }}
                  >
                    {processingPlanId === singlePlanObj.id ? (
                      <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing Payment...</>
                    ) : (
                      <><Zap size={18} /> Pay & Renew Subscription</>
                    )}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
        )}
      </div>

      {/* Transaction History — Accordion */}
      <div className="mt-12">
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
          Transaction &amp; Subscription History
        </div>
        <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loadingTx ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Loader2 size={24} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted" style={{ fontSize: '13px' }}>No transactions found.</div>
          ) : (
            <div>
              {transactions.map((tx, idx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  isLast={idx === transactions.length - 1}
                  onDelete={handleDeleteTransaction}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
