import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { rtdb, fbAuth } from '../../config/firebaseClient';
import { ref, onValue, off } from 'firebase/database';
import { signInWithCustomToken } from 'firebase/auth';
import { useAppStore } from '../../store/useAppStore';
import { Bus, MapPin, School, Clock, Loader2, RefreshCw, Navigation } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // Refresh 10 min before 1hr expiry

export default function LiveBusTracker() {
  const { user, schoolSettings } = useAppStore();
  const [selectedBus, setSelectedBus]     = useState('');
  const [trackingData, setTrackingData]   = useState(null);
  const [fbReady, setFbReady]             = useState(false);
  const [fbError, setFbError]             = useState(null);
  const [isConnecting, setIsConnecting]   = useState(false);
  const listenerRef    = useRef(null);
  const tokenTimerRef  = useRef(null);
  const schoolId = schoolSettings?.school_id;

  // Fetch all buses for this school (for the dropdown)
  const { data: buses = [], isLoading: busesLoading } = useQuery({
    queryKey: ['bus-list', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bus_assignments')
        .select('bus_number, route_name, driver_name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('bus_number', { ascending: true });
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Mint a Firebase Custom Token via Supabase Edge Function
  const mintFirebaseToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active Supabase session');

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mint-firebase-token`,
      { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Token mint failed: ${res.status}`);
    const { firebase_token } = await res.json();
    return firebase_token;
  }, []);

  // Sign into Firebase and set up auto-refresh
  const authenticateFirebase = useCallback(async () => {
    setIsConnecting(true);
    setFbError(null);
    try {
      const token = await mintFirebaseToken();
      await signInWithCustomToken(fbAuth, token);
      setFbReady(true);
      // Auto-refresh before the 1-hour token expires
      tokenTimerRef.current = setTimeout(authenticateFirebase, TOKEN_REFRESH_INTERVAL_MS);
    } catch (err) {
      setFbError(err.message);
    } finally {
      setIsConnecting(false);
    }
  }, [mintFirebaseToken]);

  // Authenticate on mount
  useEffect(() => {
    authenticateFirebase();
    return () => clearTimeout(tokenTimerRef.current);
  }, [authenticateFirebase]);

  // Attach/detach RTDB listener when bus selection changes
  useEffect(() => {
    if (!fbReady || !selectedBus || !schoolId) return;

    // Detach previous listener
    if (listenerRef.current) off(listenerRef.current);

    const busId = `bus_${selectedBus.toLowerCase().replace(/\s+/g, '_')}`;
    const trackRef = ref(rtdb, `tracking/${schoolId}/${busId}`);
    listenerRef.current = trackRef;

    setTrackingData(null); // Reset while we wait for first push
    onValue(trackRef, (snapshot) => {
      setTrackingData(snapshot.exists() ? snapshot.val() : null);
    });

    return () => off(trackRef);
  }, [fbReady, selectedBus, schoolId]);

  const formatTime = (ts) => ts
    ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const getTimeSince = (ts) => {
    if (!ts) return '';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    return `${mins} min ago`;
  };

  const isTripEnded = trackingData?.status === 'trip_ended';
  const isLive      = trackingData?.status === 'en_route';

  return (
    <ModuleGuard moduleName="bus_alerts">
      <div className="fade-in max-w-lg mx-auto pb-12 px-4">

        {/* Header */}
        <div style={{ borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '24px', marginTop: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={24} color="#fbbf24" />
          </div>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '18px', margin: 0 }}>Bus Safe Drop</h2>
            <p style={{ color: 'rgba(253,230,138,0.7)', fontSize: '12px', margin: '2px 0 0' }}>Live Location Tracker</p>
          </div>
        </div>

        {/* Firebase Auth Status */}
        {isConnecting && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Loader2 size={16} className="animate-spin" color="#818cf8" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Connecting to live tracking...</span>
          </div>
        )}
        {fbError && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#ef4444' }}>{fbError}</span>
            <button onClick={authenticateFirebase} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><RefreshCw size={16} /></button>
          </div>
        )}

        {/* Bus Selector */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
            Select Bus
          </label>
          {busesLoading ? (
            <div style={{ textAlign: 'center', padding: '12px' }}><Loader2 size={20} className="animate-spin" color="#fbbf24" /></div>
          ) : (
            <select
              id="bus-select"
              value={selectedBus}
              onChange={(e) => setSelectedBus(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '15px', fontWeight: 700 }}
            >
              <option value="">-- Choose a bus --</option>
              {buses.map((b) => (
                <option key={b.bus_number} value={b.bus_number}>
                  Bus No. {b.bus_number}{b.route_name ? ` · ${b.route_name}` : ''}
                </option>
              ))}
            </select>
          )}
          {buses.length === 0 && !busesLoading && (
            <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: '8px 0 0' }}>No buses assigned yet. Contact your school admin.</p>
          )}
        </div>

        {/* Timeline UI */}
        {selectedBus && fbReady && (
          <div className="card">
            <h3 style={{ margin: '0 0 20px', fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={16} color="#fbbf24" /> Live Route · Bus {selectedBus}
            </h3>

            {!trackingData ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Bus size={36} color="var(--text-faint)" style={{ marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Waiting for driver to start the route...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>

                {/* Timeline Line */}
                <div style={{ position: 'absolute', left: '15px', top: '24px', bottom: '24px', width: '2px', background: 'linear-gradient(180deg, #10b981, #fbbf24, #818cf8)', borderRadius: '2px' }} />

                {/* Node 1: Trip Start */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '28px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, boxShadow: '0 0 0 4px rgba(16,185,129,0.15)' }}>
                    <span style={{ fontSize: '14px' }}>🟢</span>
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#10b981' }}>Route Started</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Driver is on the way</div>
                  </div>
                </div>

                {/* Node 2: Current Location (Live) */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '28px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isLive ? '#fbbf24' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, boxShadow: isLive ? '0 0 0 6px rgba(251,191,36,0.2)' : 'none', animation: isLive ? 'pulse 2s infinite' : 'none' }}>
                    <MapPin size={16} color={isLive ? '#0f172a' : '#fff'} />
                  </div>
                  <div style={{ paddingTop: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text-main)' }}>
                        {isTripEnded ? 'Trip Ended' : trackingData.location_name}
                      </span>
                      {isLive && (
                        <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '20px', padding: '2px 8px' }}>LIVE</span>
                      )}
                    </div>
                    {trackingData.last_updated_ts && !isTripEnded && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <Clock size={11} color="var(--text-faint)" />
                        <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                          {formatTime(trackingData.last_updated_ts)} · {getTimeSince(trackingData.last_updated_ts)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Node 3: Destination */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isTripEnded ? '#818cf8' : 'var(--input-bg)', border: '2px solid', borderColor: isTripEnded ? '#818cf8' : 'var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <School size={16} color={isTripEnded ? '#fff' : 'var(--text-faint)'} />
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: isTripEnded ? '#818cf8' : 'var(--text-muted)' }}>
                      {isTripEnded ? '✅ Route Completed Safely' : schoolSettings?.name || 'Destination'}
                    </div>
                    {isTripEnded && <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>at {formatTime(trackingData.last_updated_ts)}</div>}
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
