import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import {
  School, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  Mail, Phone, MapPin, Hash, User, BookOpen, RefreshCw, Filter
} from 'lucide-react';

const STATUS_CONFIG = {
  pending:  { color: 'var(--warn)', bg: 'var(--warn-bg)',  label: 'Pending Review' },
  verification_requested: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', label: 'Verification Requested' },
  verification_submitted: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Pending Re-registration' },
  approved: { color: 'var(--success)', bg: 'var(--success-bg)',  label: 'Approved'       },
  rejected: { color: 'var(--danger)', bg: 'var(--danger-bg)', label: 'Rejected'       },
};

const PLAN_LABELS = { trial: '28-Day Trial', free: 'Free Plan', premium: 'Premium' };

const actionBtn = (color, isDanger) => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
  background: isDanger ? 'rgba(248,113,113,0.1)' : (color === '#fbbf24' ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)'), color: color
});
const labelStyle = { fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, display: 'block' };
const miniInputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 };
const cancelBtn = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' };

function RegistrationCard({ reg, onApprove, onReject, onVerifyRequest, processing }) {
  const [expanded, setExpanded] = useState(false);
  const [showApproveForm, setShowApproveForm]   = useState(false);
  const [showRejectForm, setShowRejectForm]     = useState(false);
  const [showVerifyForm, setShowVerifyForm]     = useState(false);
  const [overrideCode, setOverrideCode] = useState(reg.school_code);
  const [overridePlan, setOverridePlan] = useState(reg.plan_type || 'trial');
  const [rejectReason, setRejectReason] = useState('');
  const [verifyReason, setVerifyReason] = useState('');

  // Granular verification request state
  const [enableFields, setEnableFields] = useState(false);
  const [reqFields, setReqFields] = useState({
    school_name: false,
    school_code: false,
    board: false,
    school_type: false,
    student_strength: false,
    admin_name: false,
    admin_email: false,
    admin_phone: false,
    admin_username: false,
  });

  const [enablePhotos, setEnablePhotos] = useState(false);
  const [reqPhotos, setReqPhotos] = useState({
    selfie: false,
    event: false,
  });

  const sc = STATUS_CONFIG[reg.status] || STATUS_CONFIG.pending;

  const handleSendVerify = () => {
    const selectedFields = enableFields ? Object.keys(reqFields).filter(k => reqFields[k]) : [];
    const selectedPhotos = enablePhotos ? Object.keys(reqPhotos).filter(k => reqPhotos[k]) : [];
    onVerifyRequest(reg.id, verifyReason, { fields: selectedFields, photos: selectedPhotos });
  };

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

          {reg.status === 'verification_requested' && reg.rejection_reason && (
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fbbf24', marginBottom: 14 }}>
              <strong>Requested verification:</strong> {reg.rejection_reason}
              {reg.verification_config && (
                <div style={{ fontSize: 11, marginTop: 8, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {reg.verification_config.fields && reg.verification_config.fields.length > 0 && (
                    <div>📋 <strong>Requested Field Edits:</strong> {reg.verification_config.fields.map(f => f.replace(/_/g, ' ').toUpperCase()).join(', ')}</div>
                  )}
                  {reg.verification_config.photos && reg.verification_config.photos.length > 0 && (
                    <div>📷 <strong>Requested Photo Uploads:</strong> {reg.verification_config.photos.map(p => p === 'selfie' ? 'Admin Selfie' : 'Event Photo').join(', ')}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {reg.verification_message && (
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#818cf8', marginBottom: 14 }}>
              <strong>School Admin's Reply:</strong> "{reg.verification_message}"
            </div>
          )}

          {reg.verification_photos && Array.isArray(reg.verification_photos) && reg.verification_photos.length > 0 && (
            <div style={{ marginTop: 14, marginBottom: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                📁 Uploaded Verification Photos
              </div>
              {reg.verification_folder_url && (
                <a href={reg.verification_folder_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 12, color: '#818cf8', fontWeight: 600, marginBottom: 8, textDecoration: 'none' }}>
                  Open Google Drive Folder ↗
                </a>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                {reg.verification_photos.map((photo, idx) => (
                  <a key={idx} href={photo.webViewLink || photo.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#000', position: 'relative', aspectRatio: '1/1' }}>
                    {photo.thumbnailLink ? (
                      <img src={photo.thumbnailLink} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContents: 'center', height: '100%', fontSize: 10, color: '#94a3b8', padding: 4, textAlign: 'center' }}>
                        {photo.name || `Photo ${idx+1}`}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons — pending / verification_requested only */}
          {(reg.status === 'pending' || reg.status === 'verification_requested') && (
            <div>
              {!showApproveForm && !showRejectForm && !showVerifyForm && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowApproveForm(true); setShowRejectForm(false); setShowVerifyForm(false); }}
                    style={actionBtn('#4ade80')}>
                    <CheckCircle size={15} /> Review & Approve
                  </button>
                  <button onClick={() => { setShowVerifyForm(true); setShowApproveForm(false); setShowRejectForm(false); }}
                    style={actionBtn('#fbbf24')}>
                    <Clock size={15} /> Request Verification
                  </button>
                  <button onClick={() => { setShowRejectForm(true); setShowApproveForm(false); setShowVerifyForm(false); }}
                    style={actionBtn('#f87171', true)}>
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              )}

              {/* Approve Form */}
              {showApproveForm && (
                <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Confirm Approval</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
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
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowApproveForm(false)} style={cancelBtn}>Cancel</button>
                    <button disabled={processing}
                      onClick={() => onApprove(reg.id, { override_school_code: overrideCode, override_plan_type: overridePlan })}
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

              {/* Verify (Request Info/Photos) Form */}
              {showVerifyForm && (
                <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Configure Verification Request</div>
                  
                  {/* Fields Checkbox Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" id={`enableFields-${reg.id}`} checked={enableFields} onChange={e => setEnableFields(e.target.checked)} />
                    <label htmlFor={`enableFields-${reg.id}`} style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', cursor: 'pointer' }}>Request Specific Field Edits</label>
                  </div>
                  {enableFields && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px 12px', paddingLeft: 22, marginBottom: 14 }}>
                      {Object.keys(reqFields).map(f => (
                        <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                          <input type="checkbox" checked={reqFields[f]} onChange={e => setReqFields(prev => ({ ...prev, [f]: e.target.checked }))} />
                          {f.replace(/_/g, ' ').toUpperCase()}
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Photos Checkbox Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" id={`enablePhotos-${reg.id}`} checked={enablePhotos} onChange={e => setEnablePhotos(e.target.checked)} />
                    <label htmlFor={`enablePhotos-${reg.id}`} style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', cursor: 'pointer' }}>Request Verification Photos</label>
                  </div>
                  {enablePhotos && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 22, marginBottom: 14 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                        <input type="checkbox" checked={reqPhotos.selfie} onChange={e => setReqPhotos(prev => ({ ...prev, selfie: e.target.checked }))} />
                        School Admin Selfie (Camera device capture only)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                        <input type="checkbox" checked={reqPhotos.event} onChange={e => setReqPhotos(prev => ({ ...prev, event: e.target.checked }))} />
                        Event Photo / Campus Premise Photo (Gallery allowed)
                      </label>
                    </div>
                  )}

                  <label style={{ ...labelStyle, marginTop: 12, marginBottom: 6, display: 'block' }}>Instructions / Reason for Request *</label>
                  <textarea rows={3} style={{ ...miniInputStyle, resize: 'vertical', marginBottom: 12 }}
                     placeholder="Provide clear details on what verification is needed..."
                     value={verifyReason} onChange={e => setVerifyReason(e.target.value)} />
                  
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowVerifyForm(false)} style={cancelBtn}>Cancel</button>
                    <button disabled={processing || !verifyReason.trim() || (!enableFields && !enablePhotos)}
                      onClick={handleSendVerify}
                      style={actionBtn('#fbbf24')}>
                      {processing === reg.id ? 'Sending...' : <><Clock size={14} /> Send Request</>}
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
      if (filter !== 'all') {
        if (filter === 'verification_requested') {
          q = q.in('status', ['verification_requested', 'verification_submitted']);
        } else {
          q = q.eq('status', filter);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const handleApprove = async (regId, overrides) => {
    setProcessing(regId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('approve-school-registration', {
        body: { school_id: regId, action: 'approve', ...overrides },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        let errMsg = error.message;
        try {
          const body = await error.context.json();
          if (body && body.error) errMsg = body.error;
        } catch (e) { /* fallback to default */ }
        throw new Error(errMsg);
      }
      if (data?.error) throw new Error(data.error);

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
      const { data, error } = await supabase.functions.invoke('approve-school-registration', {
        body: { school_id: regId, action: 'reject', rejection_reason: reason },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        let errMsg = error.message;
        try {
          const body = await error.context.json();
          if (body && body.error) errMsg = body.error;
        } catch (e) { /* fallback to default */ }
        throw new Error(errMsg);
      }
      if (data?.error) throw new Error(data.error);

      showToast('Registration rejected.', 'success');
      qc.invalidateQueries({ queryKey: ['school_registrations'] });
    } catch (err) {
      showToast(`❌ Rejection failed: ${err.message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleVerifyRequest = async (regId, reason, config) => {
    setProcessing(regId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('approve-school-registration', {
        body: { school_id: regId, action: 'request_verification', rejection_reason: reason, verification_config: config },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        let errMsg = error.message;
        try {
          const body = await error.context.json();
          if (body && body.error) errMsg = body.error;
        } catch (e) { /* fallback */ }
        throw new Error(errMsg);
      }
      if (data?.error) throw new Error(data.error);

      showToast('Verification request sent successfully.', 'success');
      qc.invalidateQueries({ queryKey: ['school_registrations'] });
    } catch (err) {
      showToast(`❌ Verification request failed: ${err.message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = registrations.filter(r => r.status === 'pending' || r.status === 'verification_submitted').length;

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
        {['pending', 'verification_requested', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'capitalize',
              letterSpacing: '0.06em',
              padding: '6px 14px',
              borderRadius: 20,
              cursor: 'pointer',
              border: 'none',
              background: filter === f
                ? (f === 'pending' ? 'var(--warn-bg)' : f === 'verification_requested' ? 'rgba(251,191,36,0.1)' : f === 'approved' ? 'var(--success-bg)' : f === 'rejected' ? 'var(--danger-bg)' : 'var(--accent-light)')
                : 'rgba(255,255,255,0.06)',
              color: filter === f
                ? (f === 'pending' ? 'var(--warn)' : f === 'verification_requested' ? '#fbbf24' : f === 'approved' ? 'var(--success)' : f === 'rejected' ? 'var(--danger)' : 'var(--accent)')
                : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}>
            {f === 'all' ? 'All' : f === 'verification_requested' ? 'Requested Info' : f.charAt(0).toUpperCase() + f.slice(1)}
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
            {filter === 'pending' ? 'No pending registrations. Share your registration link to get started!' : `No ${filter.replace('_', ' ')} registrations.`}
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
            onVerifyRequest={handleVerifyRequest}
          />
        ))
      )}


    </div>
  );
}

