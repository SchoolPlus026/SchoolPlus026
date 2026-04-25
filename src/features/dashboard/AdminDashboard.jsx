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
  { name: 'Users',        path: '/admin/users',        icon: <Users size={28} />,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    glow: 'hover:shadow-blue-500/20' },
  { name: 'Attendance',   path: '/admin/attendance',   icon: <ClipboardList size={28} />, color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  glow: 'hover:shadow-indigo-500/20' },
  { name: 'Fees',         path: '/admin/fees',         icon: <DollarSign size={28} />,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', glow: 'hover:shadow-emerald-500/20' },
  { name: 'Calendar',     path: '/admin/calendar',     icon: <Calendar size={28} />,      color: 'text-teal-400',    bg: 'bg-teal-500/10',    glow: 'hover:shadow-teal-500/20' },
  { name: 'Notices',      path: '/admin/notices',      icon: <Bell size={28} />,          color: 'text-amber-400',   bg: 'bg-amber-500/10',   glow: 'hover:shadow-amber-500/20' },
  { name: 'Gallery',      path: '/admin/gallery',      icon: <Image size={28} />,         color: 'text-pink-400',    bg: 'bg-pink-500/10',    glow: 'hover:shadow-pink-500/20' },
  { name: 'Timetable',    path: '/admin/timetable',    icon: <Clock size={28} />,         color: 'text-purple-400',  bg: 'bg-purple-500/10',  glow: 'hover:shadow-purple-500/20' },
  { name: 'Off Classes',  path: '/admin/off-classes',  icon: <CalendarX size={28} />,     color: 'text-orange-400',  bg: 'bg-orange-500/10',  glow: 'hover:shadow-orange-500/20' },
  { name: 'Leaves',       path: '/admin/leaves',       icon: <CalendarHeart size={28} />, color: 'text-rose-400',    bg: 'bg-rose-500/10',    glow: 'hover:shadow-rose-500/20' },
  { name: 'Reports',      path: '/admin/reports',      icon: <LineChart size={28} />,     color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    glow: 'hover:shadow-cyan-500/20' },
  { name: 'Contact',      path: '/admin/contact',      icon: <Phone size={28} />,         color: 'text-zinc-400',    bg: 'bg-zinc-500/10',    glow: 'hover:shadow-zinc-500/20' },
  { name: 'Settings',     path: '/admin/settings',     icon: <Settings size={28} />,      color: 'text-slate-400',   bg: 'bg-slate-500/10',   glow: 'hover:shadow-slate-500/20' },
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
    <div className="space-y-8 fade-in pb-10">
      <DashboardHero />

      {/* ── Subscription Status Card ── */}
      <div className={`rounded-2xl p-4 flex items-center justify-between gap-4 border ${
        isPremium 
          ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/30' 
          : 'bg-gradient-to-r from-slate-500/10 to-slate-600/10 border-slate-500/30'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isPremium ? 'bg-indigo-500/20' : 'bg-slate-500/20'}`}>
            <Crown size={20} className={isPremium ? 'text-indigo-400' : 'text-slate-400'} />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Current Plan</div>
            <div className={`font-black text-lg ${isPremium ? 'text-indigo-300' : 'text-slate-300'}`}>
              {schoolSettings?.subscription_tier || 'Free'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isPremium ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <CheckCircle size={13} className="text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">Active</span>
            </div>
          ) : (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors text-xs font-bold text-white"
            >
              <Crown size={12} /> Upgrade to Premium
            </button>
          )}
        </div>
      </div>

      <div>
        {/* Legacy exact title: "Admin — Master Control" */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #4f46e5, #7c3aed)' }} />
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Admin — Master Control</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
          {MODULES.map((mod) => {
            const isLocked = !isPremium && PREMIUM_MODULES.includes(mod.name);
            return (
              <Link
                key={mod.name}
                to={isLocked ? '#' : mod.path}
                onClick={(e) => handleModuleClick(e, mod)}
                className={`module-card flex flex-col items-center justify-center p-6 gap-4 group hover:shadow-xl relative ${isLocked ? 'opacity-80 grayscale-[0.5]' : mod.glow}`}
              >
                {isLocked && (
                  <div className="absolute top-3 right-3 text-slate-400">
                    <Lock size={16} />
                  </div>
                )}
                <div className={`p-4 rounded-2xl ${isLocked ? 'bg-slate-500/10 text-slate-400' : `${mod.bg} ${mod.color}`} ${!isLocked && 'group-hover:scale-110'} transition-transform duration-300`}>
                  {mod.icon}
                </div>
                <span className={`font-bold text-xs uppercase tracking-widest ${isLocked ? 'text-slate-400' : mod.color} text-center`}>
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
