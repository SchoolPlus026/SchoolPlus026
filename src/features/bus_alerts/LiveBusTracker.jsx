import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { fbAuth } from '../../config/firebaseClient';
import { signInAnonymously } from 'firebase/auth';
import { useAppStore } from '../../store/useAppStore';
import { Bus, MapPin, School, Clock, Loader2, RefreshCw, Navigation, WifiOff } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

// Anonymous auth token never expires on the client — no refresh timer needed.

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
 
   // ─── Firebase Anonymous Auth ───────────────────────────
   const authFirebase = useCallback(async () => {
     setIsConnecting(true);
     setFbError(null);
     try {
       const rawDbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL || '';
       if (!fbAuth || !rawDbUrl) throw new Error('Firebase env vars (VITE_FIREBASE_*) are not configured.');
       if (fbAuth.currentUser) {
         console.log('[LiveBusTracker] reusing existing Firebase user:', fbAuth.currentUser.uid);
         setFbReady(true);
         return;
       }
       console.log('[LiveBusTracker] signing in anonymously...');
       const cred = await signInAnonymously(fbAuth);
       console.log('[LiveBusTracker] anonymous auth OK, uid:', cred.user.uid);
       setFbReady(true);
     } catch (err) {
       console.error('[LiveBusTracker] Firebase auth FAILED:', err.message);
       setFbError(err.message);
       setFbReady(false);
     } finally {
       setIsConnecting(false);
     }
   }, []);
 
   useEffect(() => {
     authFirebase();
   }, [authFirebase]);
 
   // ─── Fetch tracking data via REST fetch() ────────────────────────────────
   const fetchTrackingData = useCallback(async () => {
     if (!selectedBus || !schoolId) {
       setTrackingData(undefined);
       return;
     }
 
     try {
       const busKey = toBusKey(selectedBus);
       const rawDbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL || '';
       const databaseUrl = rawDbUrl.endsWith('/') ? rawDbUrl.slice(0, -1) : rawDbUrl;
       
       let idToken = '';
       if (fbAuth?.currentUser) {
         idToken = await fbAuth.currentUser.getIdToken();
       }
 
       const url = idToken 
         ? `${databaseUrl}/tracking/${schoolId}/${busKey}.json?auth=${idToken}`
         : `${databaseUrl}/tracking/${schoolId}/${busKey}.json`;
 
       const response = await fetch(url);
       if (!response.ok) {
         throw new Error(`HTTP Error ${response.status}`);
       }
 
       const val = await response.json();
       console.log('[LiveBusTracker] REST data received:', val);
       setTrackingData(val); // null means route not started
       setFbError(null);
     } catch (err) {
       console.error('[LiveBusTracker] REST fetch error:', err.message);
       setFbError(`Live data error: ${err.message}`);
     }
   }, [selectedBus, schoolId]);
 
   // ─── Polling interval ───────────────────────────────────────────────────
   useEffect(() => {
     if (!selectedBus || !schoolId) {
       setTrackingData(undefined);
       return;
     }
 
     // Trigger initial fetch
     setTrackingData(undefined);
     fetchTrackingData();
 
     // Set up polling interval (every 30 seconds)
     const intervalId = setInterval(() => {
       fetchTrackingData();
     }, 30000);
 
     return () => clearInterval(intervalId);
   }, [selectedBus, schoolId, fetchTrackingData]);

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
              <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>
                {fbError?.includes('api-key-not-valid')
                  ? 'Firebase API key is invalid. Check VITE_FIREBASE_API_KEY in GitHub Secrets (no trailing spaces).'
                  : fbError}
              </div>
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

        {/* ── Live Tracking Card — map-first, always visible when bus is selected ── */}
        {selectedBus && (
          <div className="card">
            {/* Header + status badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Navigation size={16} color="#fbbf24" />
                Live Route · Bus {selectedBus}
              </h3>
              {isLive
                ? <span style={{ fontSize: '10px', fontWeight: 800, background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', padding: '3px 10px' }}>🟢 LIVE</span>
                : isTripEnded
                  ? <span style={{ fontSize: '10px', fontWeight: 800, background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)', borderRadius: '20px', padding: '3px 10px' }}>✅ Done</span>
                  : null
              }
            </div>

            {/* Location name + timestamp — shown only when live */}
            {isLive && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={11} /> Current Location
                </div>
                <div style={{ fontWeight: 900, fontSize: '18px', color: 'var(--text-main)' }}>
                  {trackingData?.location_name || 'En Route…'}
                </div>
                {trackingData?.last_updated_ts ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <Clock size={11} color="var(--text-faint)" />
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                      {fmt(trackingData.last_updated_ts)} · {since(trackingData.last_updated_ts)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Google Maps iframe — shows when driver has pushed lat/lng */}
            {trackingData?.lat && trackingData?.lng ? (
              <iframe
                key={`map-${trackingData.lat}-${trackingData.lng}`}
                src={`https://maps.google.com/maps?q=${trackingData.lat},${trackingData.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                style={{
                  width: '100%', height: '260px', borderRadius: '14px',
                  border: isLive ? '2px solid rgba(16,185,129,0.25)' : '2px solid var(--card-border)',
                  display: 'block', pointerEvents: 'none',
                }}
                title="Bus Live Location"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : (
              /* Fallback: Currently at School — shown when no GPS data available */
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px', background: 'var(--input-bg)', borderRadius: '14px', border: '1px solid var(--card-border)' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(79,70,229,0.12)', border: '2px solid rgba(79,70,229,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <School size={20} color="#6366f1" />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                    {isTripEnded ? 'Route Completed' : 'Currently at'}
                  </div>
                  <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>
                    {isTripEnded ? `Ended at ${fmt(trackingData?.last_updated_ts)}` : (schoolSettings?.name || 'School')}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '3px' }}>
                    {isConnecting ? 'Connecting to live tracking…'
                      : fbError ? 'Live tracking unavailable'
                      : fbReady ? "Driver hasn't started the route yet"
                      : 'Waiting for location data…'}
                  </div>
                </div>
              </div>
            )}

            {/* Connecting indicator inside card */}
            {isConnecting && !fbError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                <Loader2 size={13} className="animate-spin" color="var(--text-faint)" />
                <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Connecting…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleGuard>
  );
}
