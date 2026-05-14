import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Users, Plus, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * AdminBusMonitor — Admin panel with two tabs:
 *  1. Live Monitor: Real-time route status overview (polling Supabase RTDB events)
 *  2. Bus Assignments: Assign drivers to bus numbers
 */
export default function AdminBusMonitor() {
  const { schoolSettings } = useAppStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('monitor');
  const [form, setForm] = useState({ bus_number: '', route_name: '', driver_id: '' });
  const [formError, setFormError] = useState('');

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
        .select('id, email, full_name')
        .eq('school_id', schoolId)
        .eq('role', 'driver');
      return data || [];
    },
    enabled: !!schoolId,
  });

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
        driver_name: driver ? (driver.full_name || driver.email) : null,
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

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('bus_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(['bus-assignments-admin', schoolId]),
  });

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '14px', boxSizing: 'border-box' };

  return (
    <div className="fade-in max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div style={{ borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '24px 28px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bus size={24} color="#fbbf24" />
        </div>
        <div>
          <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '20px', margin: 0 }}>Bus Safe Drop Admin</h2>
          <p style={{ color: 'rgba(253,230,138,0.6)', fontSize: '13px', margin: '4px 0 0' }}>Manage bus assignments &amp; monitor live routes</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['monitor', 'assignments'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer', background: tab === t ? '#4f46e5' : 'var(--input-bg)', color: tab === t ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s' }}>
            {t === 'monitor' ? '📡 Live Monitor' : '🚌 Bus Assignments'}
          </button>
        ))}
      </div>

      {/* ── TAB: MONITOR ── */}
      {tab === 'monitor' && (
        <div>
          {loadingAssign ? <div className="card" style={{ textAlign: 'center', padding: '32px' }}><Loader2 className="animate-spin mx-auto" size={28} color="#fbbf24" /></div> :
           assignments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <Bus size={36} color="var(--text-faint)" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p style={{ color: 'var(--text-faint)', fontSize: '14px' }}>No buses assigned yet. Go to the Assignments tab to add buses.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {assignments.map(a => (
                <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bus size={20} color="#fbbf24" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>Bus No. {a.bus_number}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.route_name || 'No route name'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                      Driver: {a.driver_name || 'Unassigned'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', background: a.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)' }}>
                    {a.is_active ? <CheckCircle2 size={12} color="#10b981" /> : <AlertCircle size={12} color="#64748b" />}
                    <span style={{ fontSize: '11px', fontWeight: 700, color: a.is_active ? '#10b981' : '#64748b' }}>{a.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ASSIGNMENTS ── */}
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
              <select style={inputStyle} value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}>
                <option value="">-- Select Driver --</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
              </select>
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
            {loadingAssign ? <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 className="animate-spin" size={20} color="#fbbf24" /></div>
            : assignments.length === 0 ? <p style={{ color: 'var(--text-faint)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No assignments yet.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {assignments.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                    <Bus size={18} color="#fbbf24" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-main)' }}>Bus {a.bus_number}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.driver_name || 'No driver'} {a.route_name ? `· ${a.route_name}` : ''}</div>
                    </div>
                    <button onClick={() => deleteMutation.mutate(a.id)} disabled={deleteMutation.isPending} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
