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
  Loader2, Zap
} from 'lucide-react';

const fmtDate = (d) => d
  ? `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
  : '—';

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

export default function ManageSubscription() {
  const { schoolSettings, fetchSettings } = useAppStore();
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

    // Fetch active subscription plans
    const fetchPlans = async () => {
      setLoadingPlans(true);
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('amount_paise', { ascending: true });
        
      if (!error && data) {
        setPlans(data);
      }
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
        
      if (!error && data) {
        setTransactions(data);
      }
      setLoadingTx(false);
    };

    fetchPlans();
    fetchTransactions();
  }, [schoolSettings?.school_id]);

  const handleBuyPlan = async (plan) => {
    if (!window.Razorpay) {
      showToast('Razorpay SDK failed to load. Are you online?', 'error');
      return;
    }

    setProcessingPlanId(plan.id);

    try {
      // 1. Call Edge Function to create order
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: { plan_id: plan.id, school_id: schoolSettings.school_id }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // 2. Configure Razorpay Options
      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: 'SchoolOS+',
        description: `${plan.name} Subscription`,
        order_id: data.order_id,
        handler: async function (response) {
          showToast('Payment Processing... Activating Premium.', 'success');
          
          // Poll database to confirm webhook processed the payment
          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            const { data, error } = await supabase
              .from('school_settings')
              .select('*')
              .eq('school_id', schoolSettings.school_id)
              .single();
              
            if (!error && data && data.subscription_tier === 'Premium') {
              clearInterval(pollInterval);
              useAppStore.getState().setSchoolSettings(data);
              showToast('✨ Premium Activated Successfully!', 'success');
              // Give it a moment, then refresh to re-render all Premium components
              setTimeout(() => window.location.reload(), 1500);
            }
            
            if (attempts >= 8) { // 16 seconds timeout
              clearInterval(pollInterval);
              showToast('Taking longer than expected. Please refresh the page in a minute.', 'error');
            }
          }, 2000);
        },
        prefill: {
          name: schoolSettings.name,
        },
        theme: {
          color: '#4f46e5'
        },
        // We use default UPI flow (Intent on mobile, QR on desktop)
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay via UPI',
                instruments: [{ method: 'upi' }]
              },
              other: {
                name: 'Other Payment Modes',
                instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }]
              }
            },
            hide: [{ method: 'emi' }, { method: 'paylater' }],
            sequence: ['block.upi', 'block.other']
          }
        }
      };

      // 3. Open Razorpay Checkout Modal
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        showToast(`Payment Failed: ${response.error.description}`, 'error');
      });
      rzp.open();

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
              {isTrial && <Clock size={14} color="#fbbf24" />}
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

        {/* Feature list globally */}
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

        {/* Plans Grid */}
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
                    {processingPlanId === plan.id ? (
                      <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                    ) : (
                      <><Zap size={16} /> Buy Now</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction History Section */}
      <div className="mt-12">
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
          Transaction & Subscription History
        </div>
        <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loadingTx ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Loader2 size={24} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted" style={{ fontSize: '13px' }}>No transactions found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-faint)', fontWeight: 700 }}>DATE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-faint)', fontWeight: 700 }}>PLAN</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-faint)', fontWeight: 700 }}>AMOUNT</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-faint)', fontWeight: 700 }}>ORDER ID</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-faint)', fontWeight: 700 }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>{fmtDate(new Date(tx.created_at))}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>{tx.subscription_plans?.name || 'Unknown'}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>₹{(tx.amount_paise / 100).toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{tx.razorpay_order_id}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800,
                          background: tx.status === 'SUCCESSFUL' ? 'rgba(52,211,153,0.1)' : tx.status === 'FAILED' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
                          color: tx.status === 'SUCCESSFUL' ? '#34d399' : tx.status === 'FAILED' ? '#f87171' : '#fbbf24'
                        }}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
