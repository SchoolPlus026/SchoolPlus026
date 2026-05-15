import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { rtdb, fbAuth } from '../../config/firebaseClient';
import { ref, onValue, off } from 'firebase/database';
import { signInWithCustomToken } from 'firebase/auth';
import { useAppStore } from '../../store/useAppStore';
import { Bus, MapPin, School, Clock, Loader2, RefreshCw, Navigation, WifiOff } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

const TOKEN_REFRESH_MS = 50 * 60 * 1000;

// ─── MUST match toBusKey() in BusAlerts.jsx exactly ──────────────────────────
function toBusKey(busNumber) {
  return `bus_${String(busNumber).trim().toLowerCase().replace(/\s+/g, '_')}`;
}

export default function LiveBusTracker() {
  const { schoolSettings } = useAppStore();
  const [selectedBus,   setSelectedBus]   = useState('');
  const [trackingData,  setTrackingData]  = useState(undefined); // undefined = not yet received
  const [fbReady,       setFbReady]       = useState(false);
  const [fbError,       setFbError]       = useState(null);
  const [isConnecting,  setIsConnecting]  = useState(false);

  const listenerUnsubRef = useRef(null);
  const tokenTimerRef    = useRef(null);
  const schoolId = schoolSettings?.school_id;

  // ─── Bus list ─────────────────────────────────────────────────────────────
  const { data: buses = [], isLoading: busesLoading, error: busListError } = useQuery({
    queryKey: ['bus-list', schoolId],
    queryFn: async () => {
      console.log('[LiveBusTracker] fetching bus list for school:', schoolId);
      const { data, error } = await supabase
        .from('bus_assignments')
        .select('bus_number, route_name, driver_name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('bus_number', { ascending: true });
      if (error) throw error;
      console.log('[LiveBusTracker] bus list:', data);
      return data || [];
    },
    enabled: !!schoolId,
    retry: 2,
  });

  // ─── Firebase token mint ─────────────────────────────────────────────────
  const mintToken = useCallback(async () => {
    const { data: sd, error: se } = await supabase.auth.getSession();
    if (se || !sd?.session) throw new Error('No active session — please log in again.');
    const { access_token } = sd.session;
    console.log('[LiveBusTracker] minting Firebase token...');

    let res;
    try {
      res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mint-firebase-token`,
        { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
      );
    } catch (netErr) {
      throw new Error(`Network error: ${netErr.message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Edge function returned ${res.status}: ${body || 'no detail'}`);
    }
    const json = await res.json().catch(() => null);
    if (!json?.firebase_token) throw new Error('Edge function did not return firebase_token');
    console.log('[LiveBusTracker] token minted OK');
    return json.firebase_token;
  }, []);

  // ─── Firebase auth ───────────────────────────────────────────────────────
  const authFirebase = useCallback(async () => {
    setIsConnecting(true);
    setFbError(null);
    try {
      if (!fbAuth || !rtdb) throw new Error('Firebase env vars (VITE_FIREBASE_*) are not configured.');
      const token = await mintToken();
      await signInWithCustomToken(fbAuth, token);
      setFbReady(true);
      console.log('[LiveBusTracker] Firebase auth OK');
      clearTimeout(tokenTimerRef.current);
      tokenTimerRef.current = setTimeout(authFirebase, TOKEN_REFRESH_MS);
    } catch (err) {
      console.error('[LiveBusTracker] Firebase auth FAILED:', err.message);
      setFbError(err.message);
      setFbReady(false);
    } finally {
      setIsConnecting(false);
    }
  }, [mintToken]);

  useEffect(() => {
    authFirebase();
    return () => clearTimeout(tokenTimerRef.current);
  }, [authFirebase]);

  // ─── RTDB listener ───────────────────────────────────────────────────────
  useEffect(() => {
    // Detach any previous listener
    if (listenerUnsubRef.current) {
      listenerUnsubRef.current();
      listenerUnsubRef.current = null;
    }

    if (!fbReady || !selectedBus || !schoolId || !rtdb) {
      setTrackingData(undefined);
      return;
    }

    const busKey = toBusKey(selectedBus);
    const path   = `tracking/${schoolId}/${busKey}`;
    console.log('[LiveBusTracker] attaching RTDB listener →', path);

    const trackRef = ref(rtdb, path);
    setTrackingData(undefined); // reset to "waiting" while listener connects

    const unsub = onValue(
      trackRef,
      (snapshot) => {
        const val = snapshot.exists() ? snapshot.val() : null;
        console.log('[LiveBusTracker] RTDB data received:', val);
        setTrackingData(val); // null means no data in RTDB (route not started)
      },
      (err) => {
        console.error('[LiveBusTracker] RTDB listener error:', err.message);
        setFbError(`Live data error: ${err.message}`);
        setTrackingData(null);
      }
    );

    listenerUnsubRef.current = unsub;
    return () => {
      unsub();
      off(trackRef);
      listenerUnsubRef.current = null;
    };
  }, [fbReady, selectedBus, schoolId]);

  // ─── Unmount cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (listenerUnsubRef.current) listenerUnsubRef.current();
      clearTimeout(tokenTimerRef.current);
    };
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const fmt = (ts) =>
    ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

  const since = (ts) => {
    if (!ts) return '';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    return `${m} min${m === 1 ? '' : 's'} ago`;
  };

  // trackingData states:
  //   undefined  → listener not yet attached or waiting for first value
  //   null       → no data in RTDB (route not started)
  //   { status: 'en_route', ... }   → live
  //   { status: 'trip_ended', ... } → finished
  const isLive      = trackingData?.status === 'en_route';
  const isTripEnded = trackingData?.status === 'trip_ended';
  // Show default "Currently at School" whenever Firebase auth failed OR
  // the RTDB has no live data (null) OR trip has ended.
  // We deliberately do NOT gate this on fbReady — the UI must ALWAYS
  // render something useful when a bus is selected.
  const showDefault = !isLive;

  return (
    <ModuleGuard moduleName="bus_alerts">
      <div className="fade-in max-w-lg mx-auto pb-12 px-4">

        {/* ── Header ── */}
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          padding: '24px', marginTop: '24px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={24} color="#fbbf24" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '18px', margin: 0 }}>Bus Tracker</h2>
            <p style={{ color: 'rgba(253,230,138,0.7)', fontSize: '12px', margin: '2px 0 0' }}>Live Location Tracker</p>
          </div>
        </div>

        {/* ── Connection status ── */}
        {isConnecting && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Loader2 size={16} className="animate-spin" color="#818cf8" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Connecting to live tracking…</span>
          </div>
        )}
        {fbError && !isConnecting && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'flex-start', gap: '10px',
          }}>
            <WifiOff size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>Live tracking unavailable</div>
              <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>{fbError}</div>
            </div>
            <button onClick={authFirebase} title="Retry"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', flexShrink: 0 }}>
              <RefreshCw size={16} />
            </button>
          </div>
        )}

        {/* ── Bus selector ── */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
            Select Bus
          </label>
          {busesLoading ? (
            <div style={{ textAlign: 'center', padding: '12px' }}>
              <Loader2 size={20} className="animate-spin" color="#fbbf24" />
            </div>
          ) : busListError ? (
            <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>
              Could not load bus list. Check your connection.
            </p>
          ) : (
            <select
              id="bus-select"
              value={selectedBus}
              onChange={(e) => {
                console.log('[LiveBusTracker] bus selected:', e.target.value);
                setSelectedBus(e.target.value);
              }}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '12px',
                border: '1px solid var(--card-border)', background: 'var(--input-bg)',
                color: 'var(--text-main)', fontSize: '15px', fontWeight: 700,
              }}
            >
              <option value="">-- Choose a bus --</option>
              {buses.map((b) => (
                <option key={b.bus_number} value={b.bus_number}>
                  Bus No. {b.bus_number}{b.route_name ? ` · ${b.route_name}` : ''}
                </option>
              ))}
            </select>
          )}
          {buses.length === 0 && !busesLoading && !busListError && (
            <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: '8px 0 0' }}>
              No buses assigned yet. Contact your school admin.
            </p>
          )}
        </div>

        {/* ── Timeline — ALWAYS shown once a bus is selected, regardless of Firebase errors ── */}
        {selectedBus && (
          <div className="card">
            <h3 style={{ margin: '0 0 20px', fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={16} color="#fbbf24" />
              Live Route · Bus {selectedBus}
            </h3>

            {/* Connecting spinner — only shown when Firebase is actively authenticating */}
            {isConnecting && !fbError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', marginBottom: '12px' }}>
                <Loader2 size={16} className="animate-spin" color="#fbbf24" />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading route status…</span>
              </div>
            )}

            {/* Default state: Firebase auth failed OR no live data OR trip ended.
                This ALWAYS renders when the bus is not actively en_route. */}
            {showDefault && (
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '15px', top: '24px', bottom: '24px', width: '2px', background: 'var(--card-border)', borderRadius: '2px' }} />

                {/* Node 1 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '28px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--input-bg)', border: '2px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <Bus size={14} color="var(--text-faint)" />
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>
                      {isTripEnded ? '✅ Route Completed' : 'Route Not Started'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>
                      {isTripEnded
                        ? `Ended at ${fmt(trackingData?.last_updated_ts)}`
                        : fbError
                          ? 'Live tracking unavailable — showing last known status'
                          : fbReady
                            ? "Driver hasn't started the route yet"
                            : 'Connecting to live tracking…'}
                    </div>
                  </div>
                </div>

                {/* Node 2: School */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(79,70,229,0.12)', border: '2px solid rgba(79,70,229,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <School size={15} color="#6366f1" />
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                      Currently at
                    </div>
                    <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>
                      {schoolSettings?.name || 'School'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Live en_route state */}
            {isLive && (
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '15px', top: '24px', bottom: '24px', width: '2px', background: 'linear-gradient(180deg, #10b981, #fbbf24, rgba(129,140,248,0.3))', borderRadius: '2px' }} />

                {/* Node 1: Started */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '28px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, boxShadow: '0 0 0 4px rgba(16,185,129,0.15)' }}>
                    <span style={{ fontSize: '14px' }}>🟢</span>
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#10b981' }}>Route Started</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Driver is on the way</div>
                  </div>
                </div>

                {/* Node 2: Live location */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '28px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, boxShadow: '0 0 0 6px rgba(251,191,36,0.2)', animation: 'pulse 2s infinite' }}>
                    <MapPin size={16} color="#0f172a" />
                  </div>
                  <div style={{ paddingTop: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>
                        {trackingData.location_name || 'En Route'}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '20px', padding: '2px 8px' }}>
                        LIVE
                      </span>
                    </div>
                    {trackingData.last_updated_ts && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <Clock size={11} color="var(--text-faint)" />
                        <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                          {fmt(trackingData.last_updated_ts)} · {since(trackingData.last_updated_ts)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Node 3: Destination */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--input-bg)', border: '2px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <School size={16} color="var(--text-faint)" />
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>
                      {schoolSettings?.name || 'Destination'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleGuard>
  );
}
