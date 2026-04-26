import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, ClipboardList, DollarSign, Clock, CalendarHeart,
  Image, Bell, Calendar, LineChart, Settings, CalendarX, Phone, Lock,
  Crown, CheckCircle, AlertCircle, Loader2, Upload, X
} from 'lucide-react';
import DashboardHero from '../../components/DashboardHero';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../config/supabaseClient';

// Exact legacy module list for Admin role:
const MODULES = [
  { name: 'Users',        path: '/admin/users',        icon: <Users size={26} />,         colorHex: '#60a5fa', bgRgb: '96,165,250'   },
  { name: 'Attendance',   path: '/admin/attendance',   icon: <ClipboardList size={26} />, colorHex: '#818cf8', bgRgb: '129,140,248'  },
  { name: 'Fees',         path: '/admin/fees',         icon: <DollarSign size={26} />,    colorHex: '#34d399', bgRgb: '52,211,153'   },
  { name: 'Calendar',     path: '/admin/calendar',     icon: <Calendar size={26} />,      colorHex: '#2dd4bf', bgRgb: '45,212,191'   },
  { name: 'Notices',      path: '/admin/notices',      icon: <Bell size={26} />,          colorHex: '#fbbf24', bgRgb: '251,191,36'   },
  { name: 'Gallery',      path: '/admin/gallery',      icon: <Image size={26} />,         colorHex: '#f472b6', bgRgb: '244,114,182'  },
  { name: 'Timetable',    path: '/admin/timetable',    icon: <Clock size={26} />,         colorHex: '#c084fc', bgRgb: '192,132,252'  },
  { name: 'Off Classes',  path: '/admin/off-classes',  icon: <CalendarX size={26} />,     colorHex: '#fb923c', bgRgb: '251,146,60'   },
  { name: 'Leaves',       path: '/admin/leaves',       icon: <CalendarHeart size={26} />, colorHex: '#fb7185', bgRgb: '251,113,133'  },
  { name: 'Reports',      path: '/admin/reports',      icon: <LineChart size={26} />,     colorHex: '#22d3ee', bgRgb: '34,211,238'   },
  { name: 'Contact',      path: '/admin/contact',      icon: <Phone size={26} />,         colorHex: '#94a3b8', bgRgb: '148,163,184'  },
  { name: 'Settings',     path: '/admin/settings',     icon: <Settings size={26} />,      colorHex: '#94a3b8', bgRgb: '148,163,184'  },
];

const PREMIUM_MODULES = ['Fees', 'Timetable', 'Gallery'];

export default function AdminDashboard() {
  const { schoolSettings, user } = useAppStore();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // QR Payment form state
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  const isPremium = schoolSettings?.subscription_tier === 'Premium';
  const isExpired = schoolSettings?.subscription_end_date 
    ? new Date(schoolSettings.subscription_end_date) < new Date() 
    : false;

  const handleModuleClick = (e, mod) => {
    if (!isPremium && PREMIUM_MODULES.includes(mod.name)) {
      e.preventDefault();
      setShowUpgradeModal(true);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!utrNumber.trim()) return;
    setSubmittingPayment(true);

    try {
      let screenshotUrl = null;

      // Upload screenshot to Supabase storage if provided
      if (screenshotFile) {
        const fileName = `${schoolSettings.school_id}_${Date.now()}_${screenshotFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('payment-screenshots')
          .upload(fileName, screenshotFile, { upsert: true });
        
        if (uploadError) throw new Error('Screenshot upload failed: ' + uploadError.message);
        
        const { data: { publicUrl } } = supabase.storage
          .from('payment-screenshots')
          .getPublicUrl(fileName);
        screenshotUrl = publicUrl;
      }

      // Insert payment request record
      const { error } = await supabase.from('payment_requests').insert({
        school_id: schoolSettings.school_id,
        utr_number: utrNumber.trim(),
        amount: paymentAmount.trim() || null,
        screenshot_url: screenshotUrl,
        submitted_by: user?.id,
        plan_requested: 'Premium',
        status: 'Pending'
      });

      if (error) throw error;

      setPaymentSuccess(true);
      setUtrNumber('');
      setPaymentAmount('');
      setScreenshotFile(null);
    } catch (err) {
      alert('Error submitting payment: ' + err.message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingBottom: '40px' }}>
      <DashboardHero />

      {/* ── Subscription Status Card ── */}
      <div style={{
        borderRadius: '16px', padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        background: isPremium
          ? 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(124,58,237,0.08))'
          : 'var(--accent-light)',
        border: `1px solid ${isPremium ? 'rgba(79,70,229,0.3)' : 'var(--card-border)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: isPremium ? 'rgba(79,70,229,0.18)' : 'var(--glass)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isPremium ? '#818cf8' : 'var(--text-muted)',
          }}>
            <Crown size={18} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Current Plan</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: isPremium ? 'var(--tab-active-color)' : 'var(--text-main)' }}>
              {schoolSettings?.subscription_tier || 'Free'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isPremium ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
              <CheckCircle size={12} style={{ color: 'var(--success)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--success)' }}>Active</span>
            </div>
          ) : (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="btn accent"
              style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }}
            >
              <Crown size={12} /> Upgrade to Premium
            </button>
          )}
        </div>
      </div>

      <div>
        {/* Legacy exact title: "Admin — Master Control" */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ width: '3px', height: '22px', borderRadius: '999px', background: 'linear-gradient(180deg, #4f46e5, #7c3aed)', flexShrink: 0 }} />
          <h3 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Admin — Master Control</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
          {MODULES.map((mod) => {
            const isLocked = !isPremium && PREMIUM_MODULES.includes(mod.name);
            return (
              <Link
                key={mod.name}
                to={isLocked ? '#' : mod.path}
                onClick={(e) => handleModuleClick(e, mod)}
                className="module-card"
                style={{ textDecoration: 'none', paddingTop: '24px', paddingBottom: '24px', position: 'relative', opacity: isLocked ? 0.6 : 1 }}
              >
                {isLocked && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--text-faint)' }}>
                    <Lock size={14} />
                  </div>
                )}
                <div style={{
                  width: '54px', height: '54px', borderRadius: '16px',
                  background: isLocked ? 'var(--glass)' : `rgba(${mod.bgRgb}, 0.12)`,
                  border: `1px solid ${isLocked ? 'var(--card-border)' : `rgba(${mod.bgRgb}, 0.2)`}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isLocked ? 'var(--text-faint)' : mod.colorHex,
                  transition: 'transform 0.25s ease',
                }}
                  onMouseEnter={e => !isLocked && (e.currentTarget.style.transform = 'scale(1.12)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {mod.icon}
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: isLocked ? 'var(--text-faint)' : 'var(--text-main)',
                  textAlign: 'center', lineHeight: 1.3,
                }}>
                  {mod.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Upgrade Modal (with QR option) ── */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.80)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', borderLeft: '4px solid #4f46e5' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2"><Crown size={20} className="text-indigo-400" /> Upgrade to Premium</h3>
              <button type="button" onClick={() => { setShowUpgradeModal(false); setPaymentSuccess(false); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {!showQrModal ? (
              <>
                <p className="muted small" style={{ marginBottom: '20px', fontSize: '13px' }}>
                  Unlock <strong>Fees Management</strong>, <strong>Timetable</strong>, and <strong>Gallery with Google Drive</strong> storage. Pay via UPI and submit your transaction ID for instant activation.
                </p>
                <div className="space-y-3 mb-5">
                  {['💰 Fees & Payment Management', '📅 Smart Timetable Builder', '🖼️ Unlimited Gallery Storage', '📊 Advanced Reports & Exports', '✅ Priority Support'].map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-slate-300">{f}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => { setShowUpgradeModal(false); }}>Later</button>
                  <button type="button" className="btn accent" style={{ flex: 2 }} onClick={() => setShowQrModal(true)}>
                    <Crown size={14} /> Pay via UPI / QR
                  </button>
                </div>
              </>
            ) : paymentSuccess ? (
              <div className="text-center py-6">
                <CheckCircle size={48} className="text-emerald-400 mx-auto mb-4" />
                <h4 className="font-bold text-lg mb-2">Payment Submitted!</h4>
                <p className="muted small text-sm">Your payment request has been sent to the Platform Admin. Your account will be upgraded within 24 hours.</p>
                <button type="button" className="btn accent w-full mt-6" onClick={() => { setShowUpgradeModal(false); setShowQrModal(false); setPaymentSuccess(false); }}>Done</button>
              </div>
            ) : (
              <form onSubmit={handleSubmitPayment} className="space-y-4">
                {/* QR Code placeholder - admin will replace with actual image */}
                <div className="flex flex-col items-center p-4 bg-white rounded-xl">
                  <p className="text-xs text-slate-500 mb-2 font-semibold text-center">Scan QR Code to Pay</p>
                  <img 
                    src="/qr-payment.png" 
                    alt="UPI QR Code" 
                    className="w-48 h-48 object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div style={{ display: 'none' }} className="w-48 h-48 border-2 border-dashed border-slate-300 rounded-xl items-center justify-center text-slate-400 text-xs text-center p-4">
                    QR Code image not found.<br/>Place your QR as <strong>public/qr-payment.png</strong>
                  </div>
                </div>

                <div>
                  <label className="muted small block mb-1 font-semibold">UTR / Transaction ID *</label>
                  <input required type="text" value={utrNumber} onChange={e => setUtrNumber(e.target.value)} className="sp-input" placeholder="e.g. 426781234567" />
                </div>
                <div>
                  <label className="muted small block mb-1 font-semibold">Amount Paid (₹)</label>
                  <input type="text" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="sp-input" placeholder="e.g. 1999" />
                </div>
                <div>
                  <label className="muted small block mb-1 font-semibold">Upload Payment Screenshot</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setScreenshotFile(e.target.files[0] || null)}
                    className="sp-input text-sm"
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn outline" style={{ flex: 1 }} onClick={() => setShowQrModal(false)}>Back</button>
                  <button type="submit" disabled={submittingPayment} className="btn accent" style={{ flex: 2 }}>
                    {submittingPayment ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : <><Upload size={14} /> Submit Payment</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
