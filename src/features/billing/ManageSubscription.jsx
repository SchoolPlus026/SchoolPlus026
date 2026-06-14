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
          const paymentId = response.razorpay_payment_id;
          const orderId = response.razorpay_order_id;
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
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, marginBottom: '4px' }}>BILLING</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
              {isTrial ? '28-Day Trial' : billingCycle ? (billingCycle === 'monthly' ? 'Monthly (28d)' : 'Yearly (365d)') : '—'}
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
        ) : plans.length === 0 ? (
          <div className="text-center py-8 text-muted">No active plans available at the moment.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(plan => (
              <div key={plan.id} style={{
                borderRadius: '20px', padding: '24px',
                background: 'linear-gradient(145deg,rgba(18,16,56,0.9),rgba(10,8,36,0.9))',
                border: '1px solid rgba(99,102,241,0.3)',
                display: 'flex', flexDirection: 'column',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#f1f5f9' }}>{plan.name}</h4>
                    <div style={{ fontSize: '13px', color: '#818cf8', marginTop: '4px', fontWeight: 600 }}>{plan.validity_days} Days Access</div>
                  </div>
                  <div style={{ padding: '8px', borderRadius: '12px', background: 'rgba(79,70,229,0.15)' }}>
                    <Crown size={20} color="#818cf8" />
                  </div>
                </div>

                <div style={{ fontSize: '32px', fontWeight: 900, color: 'white', marginBottom: '24px' }}>
                  <span style={{ fontSize: '16px', color: '#64748b', marginRight: '4px' }}>₹</span>
                  {(plan.amount_paise / 100).toFixed(0)}
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <button
                    onClick={() => handleBuyPlan(plan)}
                    disabled={processingPlanId === plan.id}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '12px',
                      background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                      border: 'none', cursor: processingPlanId === plan.id ? 'default' : 'pointer',
                      color: 'white', fontSize: '14px', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      opacity: processingPlanId === plan.id ? 0.7 : 1,
                    }}
                  >
                    {processingPlanId === plan.id
                      ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                      : <><Zap size={16} /> Buy Now</>
                    }
                  </button>
                </div>
              </div>
            ))}
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
