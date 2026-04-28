/**
 * PlanStatusBanner.jsx — Compact plan status bar for AdminDashboard
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Clock, CheckCircle, AlertTriangle, Zap } from 'lucide-react';
import { usePlan } from '../hooks/usePlan';

const fmtDate = (d) => d
  ? `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
  : null;

export default function PlanStatusBanner() {
  const { planType, isTrial, isFree, isPremium, billingCycle, trialDaysLeft, subDaysLeft, subEnd } = usePlan();
  const navigate = useNavigate();

  const btnStyle = (bg) => ({
    padding: '8px 16px', borderRadius: '10px', flexShrink: 0,
    background: bg, border: 'none', cursor: 'pointer',
    color: 'white', fontSize: '12px', fontWeight: 800,
    display: 'flex', alignItems: 'center', gap: '6px',
  });

  const wrapStyle = (bg, border) => ({
    borderRadius: '14px', padding: '14px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '12px', background: bg, border: `1px solid ${border}`, flexWrap: 'wrap',
  });

  if (isTrial) {
    const urgent = trialDaysLeft !== null && trialDaysLeft <= 5;
    const color = urgent ? '#f87171' : '#fbbf24';
    return (
      <div style={wrapStyle(urgent ? 'rgba(239,68,68,0.07)' : 'rgba(251,191,36,0.07)', urgent ? 'rgba(239,68,68,0.35)' : 'rgba(251,191,36,0.35)')}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <Clock size={18} color={color} />
          <div>
            <div style={{ fontSize:'11px', fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.06em' }}>28-Day Free Trial</div>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-main)' }}>
              {trialDaysLeft !== null ? `${trialDaysLeft} day${trialDaysLeft!==1?'s':''} remaining — upgrade to keep Premium features.` : 'Trial active.'}
            </div>
          </div>
        </div>
        <button onClick={() => navigate('/admin/billing')} style={btnStyle(urgent ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#d97706,#b45309)')}>
          <Crown size={13} /> Upgrade Now
        </button>
      </div>
    );
  }

  if (isFree) {
    return (
      <div style={wrapStyle('rgba(99,102,241,0.06)', 'rgba(99,102,241,0.25)')}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <Zap size={18} color="#818cf8" />
          <div>
            <div style={{ fontSize:'11px', fontWeight:800, color:'#818cf8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Free Plan</div>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-muted)' }}>Fees, Timetable, Reports & more are locked. Upgrade to Premium.</div>
          </div>
        </div>
        <button onClick={() => navigate('/admin/billing')} style={btnStyle('linear-gradient(135deg,#4f46e5,#7c3aed)')}>
          <Crown size={13} /> View Plans
        </button>
      </div>
    );
  }

  if (isPremium && !isTrial) {
    const expiring = subDaysLeft !== null && subDaysLeft <= 7;
    return (
      <div style={wrapStyle(expiring ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)', expiring ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)')}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {expiring ? <AlertTriangle size={18} color="#f87171" /> : <CheckCircle size={18} color="#34d399" />}
          <div>
            <div style={{ fontSize:'11px', fontWeight:800, color: expiring?'#f87171':'#34d399', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Premium Plan {billingCycle ? `(${billingCycle.charAt(0).toUpperCase()+billingCycle.slice(1)})` : ''}
            </div>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-main)' }}>
              {expiring
                ? `⚠️ Expires in ${subDaysLeft} day${subDaysLeft!==1?'s':''} — renew to maintain access.`
                : subEnd ? `Active until ${fmtDate(subEnd)}${subDaysLeft!==null?` (${subDaysLeft} days remaining)`:''}` : 'All features unlocked.'}
            </div>
          </div>
        </div>
        {expiring && (
          <button onClick={() => navigate('/admin/billing')} style={btnStyle('linear-gradient(135deg,#dc2626,#b91c1c)')}>
            <Crown size={13} /> Renew Now
          </button>
        )}
      </div>
    );
  }
  return null;
}
