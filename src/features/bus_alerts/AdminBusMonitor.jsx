import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Users, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Pencil, X, Save, MapPin, Clock, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { rtdb } from '../../config/firebaseClient';
import { ref, onValue, off } from 'firebase/database';
import { ensureFirebaseAuthenticated } from '../../utils/firebaseAuth';
import { decodeBusCSV } from '../../utils/csvCodec';

// ── Bus key helper (must match BusAlerts.jsx + LiveBusTracker.jsx) ─────────────
function toBusKey(n) {
  return `bus_${String(n).trim().toLowerCase().replace(/\s+/g, '_')}`;
}

// ── Per-bus live map card (subscribes to RTDB for a single bus) ─────────────
// Renders a Google Maps iframe if the driver has pushed lat/lng.
function BusLiveCard({ schoolId, busNumber, fbReady }) {
  const [live,   setLive]   = useState(null);
  const [secAgo, setSecAgo] = useState(null); // seconds since driver's last push
  const [mapFullscreen, setMapFullscreen] = useState(false);

  useEffect(() => {
    if (!schoolId || !busNumber || !rtdb || !fbReady) return;
    const path = `tracking/${schoolId}/${toBusKey(busNumber)}`;
    const trackRef = ref(rtdb, path);
    const unsub = onValue(trackRef, (snap) => {
      setLive(snap.exists() ? decodeBusCSV(snap.val()) : null);
    }, () => setLive(null));
    return () => { unsub(); off(trackRef); };
  }, [schoolId, busNumber, fbReady]);

  // Tick "X sec ago" counter based on the driver's last_updated_ts from Firebase
  useEffect(() => {
    if (!live?.last_updated_ts) { setSecAgo(null); return; }
    const compute = () => Math.floor((Date.now() - live.last_updated_ts) / 1000);
    setSecAgo(compute());
    const ticker = setInterval(() => setSecAgo(compute()), 5000);
    return () => clearInterval(ticker);
  }, [live?.last_updated_ts]);

  if (!fbReady) return (
    <div style={{ fontSize: '12px', color: 'var(--text-faint)', padding: '8px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Loader2 size={11} className="animate-spin" color="var(--text-muted)" /> Connecting to live tracking…
    </div>
  );

  if (!live) return (
    <div style={{ fontSize: '12px', color: 'var(--text-faint)', padding: '8px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Clock size={11} /> Route not started
    </div>
  );

  const isLive = live.status === 'en_route';
  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid var(--card-border)', paddingTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={12} color={isLive ? '#10b981' : '#94a3b8'} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: isLive ? '#10b981' : 'var(--text-muted)' }}>
            {live.location_name || (live.lat ? `GPS: ${Number(live.lat).toFixed(4)}, ${Number(live.lng).toFixed(4)}` : 'En Route')}
          </span>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 800, background: isLive ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.1)', color: isLive ? '#10b981' : '#94a3b8', border: `1px solid ${isLive ? 'rgba(16,185,129,0.25)' : 'rgba(100,116,139,0.2)'}`, borderRadius: '20px', padding: '2px 8px' }}>
          {isLive ? '🟢 LIVE' : '✅ Done'}
        </span>
      </div>

      {/* ── Refresh info bar (admin equivalent of the viewer countdown) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', background: 'var(--input-bg)', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
        <RefreshCw size={10} color="var(--text-faint)" />
        <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600 }}>
          {isLive
            ? secAgo === null
              ? 'Real-time sync active'
              : secAgo < 5
                ? 'Just updated · Real-time sync active'
                : `Driver updated ${secAgo}s ago · Next push ~${Math.max(0, 30 - secAgo)}s`
            : 'Route ended · Monitoring idle'}
        </span>
      </div>

      {live.lat && live.lng ? (
        <>
          <div style={{ position: 'relative' }}>
            <iframe
              key={`admin-map-${live.lat}-${live.lng}`}
              src={`https://maps.google.com/maps?q=${live.lat},${live.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
              style={{ width: '100%', height: '320px', borderRadius: '12px', border: `2px solid ${isLive ? 'rgba(16,185,129,0.2)' : 'var(--card-border)'}`, display: 'block' }}
              title={`Bus ${busNumber} Live Location`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <button
              onClick={() => setMapFullscreen(true)}
              title="Expand map"
              style={{
                position: 'absolute', top: '10px', right: '10px',
                background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '10px', padding: '8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(6px)', zIndex: 10
              }}
            >
              <Maximize2 size={18} color="#fff" />
            </button>
          </div>

          {/* ── Full-Screen Map Portal ── */}
          {mapFullscreen && createPortal(
            <div style={{
              position: 'fixed', inset: 0, zIndex: 99999,
              background: '#000', display: 'flex', flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute', top: '14px', right: '14px', zIndex: 100000
              }}>
                <button
                  onClick={() => setMapFullscreen(false)}
                  style={{
                    background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px', padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    color: '#fff', fontSize: '12px', fontWeight: 700,
                    backdropFilter: 'blur(8px)'
                  }}
                >
                  <Minimize2 size={16} /> Exit Full Screen
                </button>
              </div>
              <iframe
                key={`fs-admin-map-${live.lat}-${live.lng}`}
                src={`https://maps.google.com/maps?q=${live.lat},${live.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={`Bus ${busNumber} Live Location (Full Screen)`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>,
            document.body
          )}
        </>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--text-faint)', padding: '4px 0' }}>Map unavailable — no GPS data in this push.</div>
      )}
    </div>
  );
}

/**
 * AdminBusMonitor — Admin panel with two tabs:
 *  1. Live Monitor: Route status overview from bus_assignments
 *  2. Bus Assignments: Assign drivers to bus numbers, edit existing
 */
export default function AdminBusMonitor() {
  const { schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('monitor');
  const [fbReady, setFbReady] = useState(false);
  const [fbError, setFbError] = useState(null);

  useEffect(() => {
    async function authAdmin() {
      try {
        console.log('[AdminBusMonitor] Authenticating admin with Firebase...');
        await ensureFirebaseAuthenticated();
        setFbReady(true);
        setFbError(null);
      } catch (err) {
        console.error('[AdminBusMonitor] Firebase auth failed:', err.message);
        setFbError(`Live tracking connection failed: ${err.message}`);
      }
    }
    if (schoolSettings?.school_id) {
      authAdmin();
    }
  }, [schoolSettings?.school_id]);

  // ── Add form state ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({ bus_number: '', route_name: '', driver_id: '' });
  const [formError, setFormError] = useState('');

  // ── Edit modal state ────────────────────────────────────────────────────────
  const [editingAssignment, setEditingAssignment] = useState(null); // the row being edited
  const [editForm, setEditForm] = useState({ bus_number: '', route_name: '', driver_id: '' });
  const [editError, setEditError] = useState('');

  const schoolId = schoolSettings?.school_id;

  // Fetch bus assignments
  const { data: assignments = [], isLoading: loadingAssign } = useQuery({
    queryKey: ['bus-assignments-admin', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bus_assignments')
        .select('id, bus_number, route_name, driver_id, driver_name, is_active, updated_at')
        .eq('school_id', schoolId)
        .order('bus_number', { ascending: true });
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Fetch all drivers for the dropdown
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('school_id', schoolId)
        .eq('role', 'driver');
      return data || [];
    },
    enabled: !!schoolId,
  });

  // ── Helper: driver display name ─────────────────────────────────────────────
  const driverLabel = (d) => d.name || d.email || d.id;

  // ── Add Mutation ────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async () => {
      setFormError('');
      if (!form.bus_number.trim()) throw new Error('Bus number is required.');
      const driver = drivers.find(d => d.id === form.driver_id);
      const { error } = await supabase.from('bus_assignments').insert({
        school_id:   schoolId,
        bus_number:  form.bus_number.trim(),
        route_name:  form.route_name.trim() || null,
        driver_id:   form.driver_id || null,
        driver_name: driver ? driverLabel(driver) : null,
        is_active:   true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['bus-assignments-admin', schoolId]);
      setForm({ bus_number: '', route_name: '', driver_id: '' });
    },
    onError: (err) => setFormError(err.message),
  });

  // ── Edit Mutation ───────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async () => {
      setEditError('');
      if (!editForm.bus_number.trim()) throw new Error('Bus number is required.');
      const driver = drivers.find(d => d.id === editForm.driver_id);
      const { error } = await supabase.from('bus_assignments').update({
        bus_number:  editForm.bus_number.trim(),
        route_name:  editForm.route_name.trim() || null,
        driver_id:   editForm.driver_id || null,
        driver_name: driver ? driverLabel(driver) : null,
      }).eq('id', editingAssignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['bus-assignments-admin', schoolId]);
      setEditingAssignment(null);
    },
    onError: (err) => setEditError(err.message),
  });

  // ── Delete Mutation ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('bus_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(['bus-assignments-admin', schoolId]),
  });

  const openEdit = (a) => {
    setEditingAssignment(a);
    setEditForm({ bus_number: a.bus_number, route_name: a.route_name || '', driver_id: a.driver_id || '' });
    setEditError('');
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid var(--card-border)', background: 'var(--input-bg)',
    color: 'var(--text-main)', fontSize: '14px', boxSizing: 'border-box',
  };

  return (
    <div className="fade-in max-w-3xl mx-auto pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '24px 28px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bus size={24} color="#fbbf24" />
        </div>
        <div>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Bus Tracker Admin</h2>
          <p style={{ color: 'rgba(253,230,138,0.6)', fontSize: '13px', margin: '4px 0 0' }}>Manage bus assignments &amp; monitor live routes</p>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['monitor', 'assignments'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer', background: tab === t ? '#4f46e5' : 'var(--input-bg)', color: tab === t ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s' }}>
            {t === 'monitor' ? '📡 Live Monitor' : '🚌 Bus Assignments'}
          </button>
        ))}
      </div>

      {/* ── TAB: MONITOR ───────────────────────────────────────────────────── */}
      {tab === 'monitor' && (
        <div>
          {fbError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '14px', padding: '14px 16px', marginBottom: '16px',
            }}>
              <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: '#ef4444', fontSize: '13px', fontWeight: 600, lineHeight: 1.5 }}>
                  {fbError}
                </p>
                <p style={{ margin: '4px 0 0', color: '#fca5a5', fontSize: '11px', lineHeight: 1.4 }}>
                  Ensure that your Supabase instance has the FCM_SERVICE_ACCOUNT_KEY secret set and that the mint-firebase-token Edge Function is deployed.
                </p>
              </div>
            </div>
          )}

          {loadingAssign
            ? <div className="card" style={{ textAlign: 'center', padding: '32px' }}><Loader2 className="animate-spin mx-auto" size={28} color="#fbbf24" /></div>
            : assignments.length === 0
              ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                  <Bus size={36} color="var(--text-faint)" style={{ margin: '0 auto 12px', display: 'block' }} />
                  <p style={{ color: 'var(--text-faint)', fontSize: '14px' }}>No buses assigned yet. Go to the Assignments tab to add buses.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {assignments.map(a => (
                    <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* ── Top row: icon + info + status badge ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Bus size={20} color="#fbbf24" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>Bus No. {a.bus_number}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.route_name || 'No route name'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>Driver: {a.driver_name || 'Unassigned'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', background: a.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)' }}>
                          {a.is_active ? <CheckCircle2 size={12} color="#10b981" /> : <AlertCircle size={12} color="#64748b" />}
                          <span style={{ fontSize: '11px', fontWeight: 700, color: a.is_active ? '#10b981' : '#64748b' }}>{a.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                      </div>
                      {/* ── Live map (reads from Firebase RTDB) ── */}
                      <BusLiveCard schoolId={schoolId} busNumber={a.bus_number} fbReady={fbReady} />
                    </div>
                  ))}
                </div>
              )
          }
        </div>
      )}

      {/* ── TAB: ASSIGNMENTS ───────────────────────────────────────────────── */}
      {tab === 'assignments' && (
        <div>

          {/* Add Bus Form */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontWeight: 800, fontSize: '15px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={16} /> Add Bus Assignment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>BUS NUMBER *</label>
                <input style={inputStyle} placeholder="e.g. 4" value={form.bus_number} onChange={e => setForm(f => ({ ...f, bus_number: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>ROUTE NAME</label>
                <input style={inputStyle} placeholder="e.g. Morning — Ramdaspeth" value={form.route_name} onChange={e => setForm(f => ({ ...f, route_name: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>ASSIGN DRIVER</label>
              <select id="add-driver-select" style={inputStyle} value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}>
                <option value="">-- Select Driver --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{driverLabel(d)}</option>
                ))}
              </select>
              {drivers.length === 0 && (
                <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '6px' }}>No drivers found. Add a user with role "Driver" first.</p>
              )}
            </div>
            {formError && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 10px' }}>{formError}</p>}
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 800, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {addMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add Assignment
            </button>
          </div>

          {/* Current Assignments List */}
          <div className="card">
            <h3 style={{ fontWeight: 800, fontSize: '15px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16} /> Current Assignments</h3>
            {loadingAssign
              ? <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 className="animate-spin" size={20} color="#fbbf24" /></div>
              : assignments.length === 0
                ? <p style={{ color: 'var(--text-faint)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No assignments yet.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assignments.map(a => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                        <Bus size={18} color="#fbbf24" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-main)' }}>Bus {a.bus_number}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {a.driver_name || 'No driver'}{a.route_name ? ` · ${a.route_name}` : ''}
                          </div>
                        </div>
                        {/* Edit Button */}
                        <button
                          onClick={() => openEdit(a)}
                          title="Edit assignment"
                          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700 }}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        {/* Delete Button */}
                        <button
                          onClick={() => deleteMutation.mutate(a.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete assignment"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
            }
          </div>
        </div>
      )}

      {/* ── EDIT ASSIGNMENT MODAL ───────────────────────────────────────────── */}
      {editingAssignment && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setEditingAssignment(null)}
        >
          <div
            style={{ background: 'var(--card-bg, #fff)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', border: '1px solid var(--card-border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pencil size={18} color="#6366f1" />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>Edit Assignment</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Bus No. {editingAssignment.bus_number}</div>
                </div>
              </div>
              <button onClick={() => setEditingAssignment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            {/* Edit Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>BUS NUMBER *</label>
                <input
                  style={inputStyle}
                  value={editForm.bus_number}
                  onChange={e => setEditForm(f => ({ ...f, bus_number: e.target.value }))}
                  placeholder="e.g. 4"
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>ROUTE NAME</label>
                <input
                  style={inputStyle}
                  value={editForm.route_name}
                  onChange={e => setEditForm(f => ({ ...f, route_name: e.target.value }))}
                  placeholder="e.g. Morning — Ramdaspeth"
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>ASSIGN DRIVER</label>
                <select
                  id="edit-driver-select"
                  style={inputStyle}
                  value={editForm.driver_id}
                  onChange={e => setEditForm(f => ({ ...f, driver_id: e.target.value }))}
                >
                  <option value="">-- No Driver --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{driverLabel(d)}</option>
                  ))}
                </select>
              </div>

              {editError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{editError}</p>}

              {/* Modal Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  onClick={() => setEditingAssignment(null)}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => editMutation.mutate()}
                  disabled={editMutation.isPending}
                  style={{ flex: 2, padding: '11px', borderRadius: '12px', border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {editMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
