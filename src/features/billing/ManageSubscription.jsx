/**
 * ManageSubscription.jsx — School Admin billing page with QR payment system
 * Route: /admin/billing
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePlan } from '../../hooks/usePlan';
import {
  Crown, CheckCircle, Clock, CreditCard, AlertTriangle,
  Loader2, X, Upload, QrCode, ArrowRight
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

/* ── Billing Cycle Modal ── */
function CycleModal({ onClose, onSelect }) {
  const [selected, setSelected] = useState('monthly');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', borderRadius: '24px',
        background: 'linear-gradient(145deg,rgba(18,16,56,0.98),rgba(10,8,36,0.99))',
        border: '1px solid rgba(99,102,241,0.4)', padding: '28px',
        display: 'flex', flexDirection: 'column', gap: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 900, color: '#f1f5f9' }}>Choose Billing Cycle</div>
            <div style={{ fontSize: '12px', color: '#818cf8', marginTop: '3px' }}>Select your preferred plan duration</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {[
          { value: 'monthly', label: 'Monthly', sub: '28 days', badge: null },
          { value: 'yearly',  label: 'Yearly',  sub: '365 days', badge: 'Best Value' },
        ].map(opt => (
          <div
            key={opt.value}
            onClick={() => setSelected(opt.value)}
            style={{
              padding: '16px 18px', borderRadius: '16px', cursor: 'pointer',
              border: `2px solid ${selected === opt.value ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.2)'}`,
              background: selected === opt.value ? 'rgba(79,70,229,0.12)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%',
                border: `2px solid ${selected === opt.value ? '#818cf8' : '#334155'}`,
                background: selected === opt.value ? '#818cf8' : 'transparent',
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>{opt.label}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{opt.sub}</div>
              </div>
            </div>
            {opt.badge && (
              <span style={{
                padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 800,
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white',
              }}>{opt.badge}</span>
            )}
          </div>
        ))}

        <button
          onClick={() => onSelect(selected)}
          style={{
            width: '100%', padding: '14px', borderRadius: '14px',
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            border: 'none', cursor: 'pointer', color: 'white',
            fontSize: '14px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <ArrowRight size={16} /> Continue to Payment
        </button>
      </div>
    </div>
  );
}

/* ── QR Payment Form ── */
function QRPaymentForm({ cycle, onClose, onSuccess }) {
  const { schoolSettings } = useAppStore();
  const { user } = useAppStore();
  const [utr, setUtr] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const planLabel = cycle === 'yearly' ? 'Premium Yearly (365 days)' : 'Premium Monthly (28 days)';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!utr.trim()) { setError('Please enter your UTR / transaction number.'); return; }
    setProcessing(true);
    setError('');
    // 2-second simulated processing state
    await new Promise(r => setTimeout(r, 2000));
    setProcessing(false);
    setSubmitting(true);

    try {
      let screenshotUrl = null;

      // Upload screenshot if provided
      if (screenshotFile) {
        const ext = screenshotFile.name.split('.').pop();
        const path = `${schoolSettings.school_id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('payment-screenshots')
          .upload(path, screenshotFile, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('payment-screenshots').getPublicUrl(path);
          screenshotUrl = urlData?.publicUrl || null;
        }
      }

      // Insert payment request
      const { error: insertErr } = await supabase.from('payment_requests').insert({
        school_id:      schoolSettings.school_id,
        utr_number:     utr.trim(),
        screenshot_url: screenshotUrl,
        amount:         'Contact Admin',
        plan_requested: planLabel,
        submitted_by:   user?.id || null,
      });

      if (insertErr) throw new Error(insertErr.message);
      onSuccess();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '20px', overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: '460px', borderRadius: '24px', margin: 'auto',
        background: 'linear-gradient(145deg,rgba(18,16,56,0.99),rgba(10,8,36,0.99))',
        border: '1px solid rgba(99,102,241,0.35)', padding: '28px',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 900, color: '#f1f5f9' }}>Complete Payment</div>
            <div style={{ fontSize: '12px', color: '#818cf8', marginTop: '3px' }}>{planLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* QR Code placeholder */}
        <div style={{
          textAlign: 'center', padding: '24px 16px',
          borderRadius: '16px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}>
          <QrCode size={80} color="#818cf8" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>Scan QR to Pay</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>UPI / Bank Transfer accepted</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Contact admin for payment details</div>
        </div>

        {/* Form */}
        {processing ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            padding: '24px', borderRadius: '14px',
            background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          }}>
            <Loader2 size={32} color="#818cf8" style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8' }}>Processing Payment...</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Please wait a moment</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>
                ⚠️ {error}
              </div>
            )}

            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                UTR / Transaction Number *
              </label>
              <input
                required
                type="text"
                className="sp-input block w-full"
                placeholder="e.g. 123456789012"
                value={utr}
                onChange={e => setUtr(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                Payment Screenshot (optional)
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                background: 'rgba(79,70,229,0.06)', border: '1px dashed rgba(99,102,241,0.35)',
              }}>
                <Upload size={16} color="#818cf8" />
                <span style={{ fontSize: '12px', color: screenshotFile ? '#86efac' : '#64748b', fontWeight: 600 }}>
                  {screenshotFile ? screenshotFile.name : 'Click to upload screenshot'}
                </span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setScreenshotFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={onClose} style={{
                flex: 1, padding: '12px', borderRadius: '12px',
                background: 'transparent', border: '1px solid rgba(99,102,241,0.25)',
                color: '#64748b', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{
                flex: 2, padding: '12px', borderRadius: '12px',
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                border: 'none', cursor: submitting ? 'default' : 'pointer',
                color: 'white', fontSize: '13px', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: submitting ? 0.7 : 1,
              }}>
                {submitting ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting...</> : <>Submit Request</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Pending Lock State ── */
function PendingState({ request }) {
  return (
    <div style={{
      borderRadius: '20px', padding: '28px 24px',
      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.3)',
      display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '18px',
        background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Clock size={26} color="#fbbf24" />
      </div>
      <div style={{ fontSize: '16px', fontWeight: 900, color: '#fbbf24' }}>Upgrade Request Submitted</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '320px' }}>
        Your payment for <strong style={{ color: '#f1f5f9' }}>{request?.plan_requested || 'Premium'}</strong> is under review.
        The Platform Admin will approve it shortly.
      </div>
      <div style={{ padding: '8px 16px', borderRadius: '10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: '12px', color: '#64748b' }}>
        UTR: <strong style={{ color: '#f1f5f9' }}>{request?.utr_number}</strong>
        &nbsp;·&nbsp; Submitted: {request?.created_at ? new Date(request.created_at).toLocaleDateString('en-GB') : '—'}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function ManageSubscription() {
  const { schoolSettings, setSchoolSettings } = useAppStore();
  const { planType, isTrial, isFree, isPremium, billingCycle, trialDaysLeft, subDaysLeft, subEnd, trialStart } = usePlan();

  const [showCycleModal, setShowCycleModal] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [showQRForm, setShowQRForm] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [toast, setToast] = useState({ msg: '', type: 'success' });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 5000);
  };

  // On mount: check if there's an existing pending payment request
  useEffect(() => {
    const checkPending = async () => {
      if (!schoolSettings?.school_id) { setLoadingPending(false); return; }
      const { data } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('school_id', schoolSettings.school_id)
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      setPendingRequest(data || null);
      setLoadingPending(false);
    };
    checkPending();
  }, [schoolSettings?.school_id]);

  const handleCycleSelect = (cycle) => {
    setSelectedCycle(cycle);
    setShowCycleModal(false);
    setShowQRForm(true);
  };

  const handlePaymentSuccess = () => {
    setShowQRForm(false);
    // Refresh pending state
    supabase
      .from('payment_requests')
      .select('*')
      .eq('school_id', schoolSettings.school_id)
      .eq('status', 'Pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setPendingRequest(data || null));
    showToast('✅ Payment request submitted! The Platform Admin will review it shortly.');
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

        {loadingPending ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Loader2 size={24} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : pendingRequest ? (
          <PendingState request={pendingRequest} />
        ) : (
          <div style={{
            borderRadius: '20px', padding: '28px 24px',
            background: 'linear-gradient(145deg,rgba(79,70,229,0.1),rgba(124,58,237,0.06))',
            border: '1px solid rgba(99,102,241,0.35)',
            boxShadow: '0 8px 32px rgba(79,70,229,0.1)',
          }}>
            {/* Crown Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '16px', flexShrink: 0,
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(79,70,229,0.35)',
              }}>
                <Crown size={22} color="white" />
              </div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--text-main)' }}>Premium Plan</div>
                <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: 600 }}>Monthly (28 days) or Yearly (365 days)</div>
              </div>
            </div>

            {/* Feature list */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '8px', marginBottom: '22px' }}>
              {PREMIUM_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-main)' }}>
                  <CheckCircle size={12} color="#34d399" style={{ flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => setShowCycleModal(true)}
              style={{
                width: '100%', padding: '15px', borderRadius: '14px',
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                border: 'none', cursor: 'pointer', color: 'white',
                fontSize: '14px', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(79,70,229,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.4)'; }}
            >
              <Crown size={16} /> Upgrade to Premium
            </button>

            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '12px', textAlign: 'center', lineHeight: 1.6 }}>
              Select a plan → Scan QR / Pay → Submit UTR → Admin approves within 24 hours
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCycleModal && (
        <CycleModal
          onClose={() => setShowCycleModal(false)}
          onSelect={handleCycleSelect}
        />
      )}
      {showQRForm && selectedCycle && (
        <QRPaymentForm
          cycle={selectedCycle}
          onClose={() => setShowQRForm(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
