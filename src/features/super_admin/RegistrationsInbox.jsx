import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import {
  School, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  Mail, Phone, MapPin, Hash, User, BookOpen, RefreshCw, Filter
} from 'lucide-react';

const STATUS_CONFIG = {
  pending:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Pending Review' },
  approved: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  label: 'Approved'       },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Rejected'       },
};

const PLAN_LABELS = { trial: '28-Day Trial', free: 'Free Plan', premium: 'Premium' };

function RegistrationCard({ reg, onApprove, onReject, processing }) {
  const [expanded, setExpanded] = useState(false);
  const [showApproveForm, setShowApproveForm]   = useState(false);
  const [showRejectForm, setShowRejectForm]     = useState(false);
  const [overrideCode, setOverrideCode]         = useState(reg.school_code);
  const [overridePlan, setOverridePlan]         = useState(reg.plan_type);
  const [overridePassword, setOverridePassword] = useState('');
  const [rejectReason, setRejectReason]         = useState('');

  const sc = STATUS_CONFIG[reg.status] || STATUS_CONFIG.pending;

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}>
      {/* Card Header — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(79,70,229,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <School size={20} color="#818cf8" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#e2e8f0', marginBottom: 2 }}>{reg.school_name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#818cf8', background: 'rgba(79,70,229,0.12)', padding: '2px 8px', borderRadius: 6 }}>{reg.school_code}</span>
            {reg.state && <span style={{ fontSize: 11, color: '#64748b' }}><MapPin size={10} style={{ display: 'inline' }} /> {reg.city ? `${reg.city}, ` : ''}{reg.state}</span>}
            <span style={{ fontSize: 11, color: '#64748b' }}>{PLAN_LABELS[reg.plan_type] || reg.plan_type}</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(reg.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
        {expanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '10px 20px', marginBottom: 16 }}>
            {[
              [User, 'Admin Name', reg.admin_name],
              [Mail, 'Admin Email', reg.admin_email],
              [Phone, 'Phone', reg.admin_phone || '—'],
              [Hash, 'Username', reg.admin_username],
              [BookOpen, 'Board', reg.board || '—'],
              [School, 'Type', reg.school_type],
              [User, 'Students ~', reg.student_strength ? reg.student_strength.toLocaleString() : '—'],
            ].map(([Icon, label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Icon size={10} /> {label}
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1', wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
          </div>

          {reg.status === 'rejected' && reg.rejection_reason && (
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 14 }}>
              <strong>Rejection reason:</strong> {reg.rejection_reason}
            </div>
          )}

          {/* Action Buttons — pending only */}
          {reg.status === 'pending' && (
            <div>
              {!showApproveForm && !showRejectForm && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowApproveForm(true); setShowRejectForm(false); }}
                    style={actionBtn('#4ade80')}>
                    <CheckCircle size={15} /> Review & Approve
                  </button>
                  <button onClick={() => { setShowRejectForm(true); setShowApproveForm(false); }}
                    style={actionBtn('#f87171', true)}>
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              )}

              {/* Approve Form */}
              {showApproveForm && (
                <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Confirm Approval</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>School Code</label>
                      <input style={miniInputStyle} value={overrideCode}
                        onChange={e => setOverrideCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Plan</label>
                      <select style={miniInputStyle} value={overridePlan} onChange={e => setOverridePlan(e.target.value)}>
                        <option value="trial">28-Day Trial</option>
                        <option value="free">Free Plan</option>
                        <option value="premium">Premium</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Temp Password <span style={{ color: '#475569' }}>(auto if blank)</span></label>
                      <input style={{ ...miniInputStyle, fontFamily: 'monospace' }} placeholder="Leave blank = auto"
                        value={overridePassword} onChange={e => setOverridePassword(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowApproveForm(false)} style={cancelBtn}>Cancel</button>
                    <button disabled={processing}
                      onClick={() => onApprove(reg.id, { override_school_code: overrideCode, override_plan_type: overridePlan, override_admin_password: overridePassword || undefined })}
                      style={actionBtn('#4ade80')}>
                      {processing ? 'Approving...' : <><CheckCircle size={14} /> Confirm & Provision</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Reject Form */}
              {showRejectForm && (
                <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: 16 }}>
                  <label style={{ ...labelStyle, marginBottom: 6, display: 'block' }}>Rejection Reason *</label>
                  <textarea rows={3} style={{ ...miniInputStyle, resize: 'vertical', marginBottom: 12 }}
                    placeholder="Explain why this registration is being rejected..."
                    value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowRejectForm(false)} style={cancelBtn}>Cancel</button>
                    <button disabled={processing || !rejectReason.trim()}
                      onClick={() => onReject(reg.id, rejectReason)}
                      style={actionBtn('#f87171', true)}>
                      {processing ? 'Rejecting...' : <><XCircle size={14} /> Confirm Rejection</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function RegistrationsInbox() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('pending');
  const [processing, setProcessing] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const { data: registrations = [], isLoading, refetch } = useQuery({
    queryKey: ['school_registrations', filter],
    queryFn: async () => {
      let q = supabase
        .from('school_registrations')
        .select('*')
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const handleApprove = async (regId, overrides) => {
    setProcessing(regId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('approve-school-registration', {
        body: { registration_id: regId, action: 'approve', ...overrides },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      showToast(`✅ School provisioned! Welcome email sent.`, 'success');
      qc.invalidateQueries({ queryKey: ['school_registrations'] });
      qc.invalidateQueries({ queryKey: ['schools'] });
    } catch (err) {
      showToast(`❌ Approval failed: ${err.message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (regId, reason) => {
    setProcessing(regId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('approve-school-registration', {
        body: { registration_id: regId, action: 'reject', rejection_reason: reason },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      showToast('Registration rejected.', 'success');
      qc.invalidateQueries({ queryKey: ['school_registrations'] });
    } catch (err) {
      showToast(`❌ Rejection failed: ${err.message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = registrations.filter(r => r.status === 'pending').length;

  return (
    <div className="card fade-in">
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)', border: `1px solid ${toast.type === 'success' ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}`, color: toast.type === 'success' ? '#4ade80' : '#f87171', padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, maxWidth: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="settings-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="flex gap-4 items-center">
          <div className="icon-box"><School size={20} /></div>
          <div className="text-content">
            <h4>School Registrations {pendingCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, marginLeft: 6 }}>{pendingCount}</span>}</h4>
            <p>Review and approve self-registration requests from schools.</p>
          </div>
        </div>
        <button className="btn outline" onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 12px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '20px 0 16px', flexWrap: 'wrap' }}>
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.06em', padding: '6px 14px', borderRadius: 20, cursor: 'pointer', border: 'none', background: filter === f ? (f === 'pending' ? '#fbbf24' : f === 'approved' ? '#4ade80' : f === 'rejected' ? '#f87171' : '#818cf8') : 'rgba(255,255,255,0.06)', color: filter === f ? '#0f172a' : '#64748b', transition: 'all 0.15s' }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>Loading registrations...</div>
      ) : registrations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <School size={40} style={{ opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ color: '#64748b', fontSize: 13 }}>
            {filter === 'pending' ? 'No pending registrations. Share your registration link to get started!' : `No ${filter} registrations.`}
          </p>
          {filter === 'pending' && (
            <div style={{ marginTop: 16, background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: 10, padding: '10px 16px', fontSize: 12, color: '#a5b4fc', display: 'inline-block' }}>
              🔗 Registration URL: <strong>{window.location.origin}/register</strong>
            </div>
          )}
        </div>
      ) : (
        registrations.map(reg => (
          <RegistrationCard
            key={reg.id}
            reg={reg}
            processing={processing === reg.id}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))
      )}


    </div>
  );
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const labelStyle = { fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' };
const miniInputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 10px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const cancelBtn = {
  padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 700, fontSize: 12, cursor: 'pointer',
};
function actionBtn(color, outline = false) {
  return {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
    background: outline ? `rgba(${color === '#f87171' ? '248,113,113' : '74,222,128'},0.08)` : `rgba(${color === '#f87171' ? '248,113,113' : '74,222,128'},0.15)`,
    border: `1px solid ${color}40`, color,
  };
}
