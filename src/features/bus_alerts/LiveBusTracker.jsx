import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { fbAuth } from '../../config/firebaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, MapPin, School, Clock, Loader2, RefreshCw, Navigation, WifiOff, Maximize2, Minimize2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import ModuleGuard from '../../components/ModuleGuard';
import { ensureFirebaseAuthenticated } from '../../utils/firebaseAuth';
import { decodeBusCSV } from '../../utils/csvCodec';
import mqttClient from '../../utils/mqttClient';
import { decryptPayload, hashTopic } from '../../utils/cryptoPayload';

// Anonymous auth token never expires on the client — no refresh timer needed.

// ─── MUST match toBusKey() in BusAlerts.jsx exactly ──────────────────────────
function toBusKey(busNumber) {
  return `bus_${String(busNumber).trim().toLowerCase().replace(/\s+/g, '_')}`;
}

// Module-level cache to persist data across component unmount/remount (anti-spam re-entry)
let lastFetchCache = {
  schoolId: null,
  busKey: null,
  data: null,
  timestamp: 0
};

export default function LiveBusTracker() {
  const { schoolSettings, role } = useAppStore();
  const [selectedBus,   setSelectedBus]   = useState('');
  const [trackingData,  setTrackingData]  = useState(undefined); // undefined = not yet received
  const [fbReady,       setFbReady]       = useState(false);
  const [fbError,       setFbError]       = useState(null);
  const [isConnecting,  setIsConnecting]  = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // Local ticker states for zero-bandwidth countdown and offline status
  const [countdown,     setCountdown]     = useState(30);
  const [isOffline,     setIsOffline]     = useState(!navigator.onLine);

  const countdownTimerRef = useRef(null);
  const pollTimerRef      = useRef(null);

  const schoolId = schoolSettings?.school_id;

  // Monitor online status
  useEffect(() => {
    const handleOnline  = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Bus list (with 12-hour localStorage cache) ───────────────────────────
  const { data: buses = [], isLoading: busesLoading, error: busListError } = useQuery({
    queryKey: ['bus-list', schoolId],
    queryFn: async () => {
      console.log('[LiveBusTracker] fetching bus list for school:', schoolId);
      
      const cacheKey = `sp_bus_list_${schoolId}`;
      const cacheTimeKey = `sp_bus_list_ts_${schoolId}`;

      // Check 12-hour localStorage cache
      try {
        const cachedStr = localStorage.getItem(cacheKey);
        const cachedTs  = localStorage.getItem(cacheTimeKey);
        if (cachedStr && cachedTs && Date.now() - parseInt(cachedTs, 10) < 12 * 60 * 60 * 1000) {
          console.log('[LiveBusTracker] Reusing 12-hour cached bus list from localStorage');
          return JSON.parse(cachedStr);
        }
      } catch (e) {
        console.warn('[LiveBusTracker] localStorage cache read error:', e.message);
      }

      const { data, error } = await supabase
        .from('bus_assignments')
        .select('bus_number, route_name, driver_name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('bus_number', { ascending: true });
      if (error) throw error;

      if (data && data.length > 0) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          localStorage.setItem(cacheTimeKey, Date.now().toString());
        } catch (e) {
          console.warn('[LiveBusTracker] localStorage cache write error:', e.message);
        }
      }

      console.log('[LiveBusTracker] bus list:', data);
      return data || [];
    },
    enabled: !!schoolId,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 2,
  });

  // ─── Firebase Custom Token Auth Bridge ───────────────────────────────────
  const authFirebase = useCallback(async () => {
    setIsConnecting(true);
    setFbError(null);
    try {
      await ensureFirebaseAuthenticated();
      setFbReady(true);
    } catch (err) {
      console.error('[LiveBusTracker] Firebase auth FAILED:', err.message);
      setFbError(`Connection error: ${err.message}`);
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

      const rawVal = await response.json();
      const val = decodeBusCSV(rawVal);
      console.log('[LiveBusTracker] REST data received and decoded:', val);

      // Update the anti-spam cache
      lastFetchCache = {
        schoolId,
        busKey,
        data: val,
        timestamp: Date.now()
      };

      setTrackingData(val); // null/undefined means route not started
      setFbError(null);
    } catch (err) {
      console.error('[LiveBusTracker] REST fetch error:', err.message);
      setFbError(`Live data error: ${err.message}`);
    }
  }, [selectedBus, schoolId]);

  // ─── Polling and Ticker Control (Visibility-aware + Cache-safe) ───────────
  useEffect(() => {
    // Role-based polling: Admin/Headmaster gets faster refresh (15s), others get 30s
    // Bandwidth note: Admin is 1-2 users max — doubling their polls adds <1 KB/hour, negligible
    const pollIntervalMs = (role === 'admin') ? 15000 : 30000;
    const pollIntervalS  = pollIntervalMs / 1000;

    if (!selectedBus || !schoolId) {
      setTrackingData(undefined);
      setCountdown(pollIntervalS);
      return;
    }

    const busKey = toBusKey(selectedBus);

    const clearTimers = () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const runTicker = (initialSeconds) => {
      clearTimers();
      
      let secondsLeft = initialSeconds;
      setCountdown(secondsLeft);

      // Local ticker counting down seconds on the client
      countdownTimerRef.current = setInterval(() => {
        // Freeze countdown if device is offline or screen is in background
        if (document.visibilityState !== 'visible' || !navigator.onLine) {
          return;
        }

        secondsLeft -= 1;
        
        if (secondsLeft <= 0) {
          fetchTrackingData();
          
          // Adaptive polling: 180s for idle routes, role-based interval for active
          const isRouteActive = lastFetchCache.data?.status === 'en_route';
          secondsLeft = isRouteActive ? pollIntervalS : 180;
        }
        
        setCountdown(secondsLeft);
      }, 1000);
    };

    // Anti-spam re-entry check: cache valid for one full poll interval
    const cacheAge = Date.now() - lastFetchCache.timestamp;
    const isCacheValid = 
      lastFetchCache.schoolId === schoolId &&
      lastFetchCache.busKey === busKey &&
      cacheAge < pollIntervalMs;

    if (isCacheValid) {
      console.log('[LiveBusTracker] Reusing cached tracking details (anti-spam)');
      setTrackingData(lastFetchCache.data);
      
      const elapsed = Math.floor(cacheAge / 1000);
      const remaining = Math.max(1, pollIntervalS - elapsed);
      runTicker(remaining);
    } else {
      console.log('[LiveBusTracker] Cache cold. Requesting fresh state...');
      setTrackingData(undefined);
      fetchTrackingData().then(() => {
        const isRouteActive = lastFetchCache.data?.status === 'en_route';
        runTicker(isRouteActive ? pollIntervalS : 180);
      });
    }

    // Visibility event listener
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[LiveBusTracker] Visited again. Evaluating fresh fetch...');
        const age = Date.now() - lastFetchCache.timestamp;
        const isActive = lastFetchCache.data?.status === 'en_route';
        const refreshThreshold = isActive ? pollIntervalMs : 180000;

        if (age >= refreshThreshold) {
          fetchTrackingData().then(() => {
            runTicker(isActive ? pollIntervalS : 180);
          });
        } else {
          const remaining = Math.max(1, Math.floor((refreshThreshold - age) / 1000));
          runTicker(remaining);
        }
      } else {
        console.log('[LiveBusTracker] Page minimized/backgrounded. Suspending intervals.');
        clearTimers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimers();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [selectedBus, schoolId, fetchTrackingData, role]);

  // ─── MQTT Real-Time WebSocket Subscription ───────────────────────────────
  useEffect(() => {
    if (!selectedBus || !schoolId) return;

    let activeTopic = null;
    const secretKey = `${schoolId}_secret_key`;

    const handleMqttMessage = async (encryptedPayload) => {
      try {
        const decryptedCsv = await decryptPayload(encryptedPayload, secretKey);
        const val = decodeBusCSV(decryptedCsv);
        if (val) {
          console.log('[LiveBusTracker] Real-time MQTT telemetry received:', val);
          setTrackingData(val);
          setFbError(null);

          lastFetchCache = {
            schoolId,
            busKey: toBusKey(selectedBus),
            data: val,
            timestamp: Date.now()
          };
        }
      } catch (err) {
        console.warn('[LiveBusTracker] MQTT payload decode error:', err.message);
      }
    };

    let isSubscribed = false;

    const subscribeToMqtt = () => {
      if (!isSubscribed && activeTopic) {
        console.log('[LiveBusTracker] Page active. Subscribing to MQTT topic:', activeTopic);
        mqttClient.subscribe(activeTopic, handleMqttMessage);
        isSubscribed = true;
      }
    };

    const unsubscribeFromMqtt = () => {
      if (isSubscribed && activeTopic) {
        console.log('[LiveBusTracker] Page hidden/backgrounded. Auto-pausing MQTT topic:', activeTopic);
        mqttClient.unsubscribe(activeTopic, handleMqttMessage);
        isSubscribed = false;
      }
    };

    hashTopic(schoolId, selectedBus).then((topic) => {
      activeTopic = topic;
      subscribeToMqtt();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        subscribeToMqtt();
      } else {
        unsubscribeFromMqtt();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeFromMqtt();
    };
  }, [selectedBus, schoolId]);

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
                <Bus size={18} color="#fbbf24" />
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
                  <Bus size={13} color="#3b82f6" /> Current Location
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

                {/* Client-side Zero-Bandwidth countdown indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', background: 'var(--input-bg)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                  <RefreshCw size={10} className={isConnecting ? "animate-spin" : ""} color="var(--text-faint)" />
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600 }}>
                    {isOffline 
                      ? 'Connection offline. Refresh paused.'
                      : isConnecting 
                        ? 'Fetching latest location…'
                        : `Next dynamic refresh in ${countdown}s`
                    }
                  </span>
                </div>
              </div>
            )}

            {/* Detailed Google Maps iframe — shows when driver has pushed lat/lng */}
            {trackingData?.lat && trackingData?.lng ? (
              <>
                <div style={{ position: 'relative' }}>
                  <iframe
                    key={`map-${trackingData.lat}-${trackingData.lng}`}
                    src={`https://maps.google.com/maps?q=${trackingData.lat},${trackingData.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                    style={{
                      width: '100%', height: '350px', borderRadius: '14px',
                      border: isLive ? '2px solid rgba(16,185,129,0.25)' : '2px solid var(--card-border)',
                      display: 'block',
                    }}
                    title="Bus Live Location"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                  <button
                    onClick={() => setMapFullscreen(true)}
                    title="Expand map"
                    style={{
                      position: 'absolute', top: '12px', right: '12px',
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
                      key={`fs-map-${trackingData.lat}-${trackingData.lng}`}
                      src={`https://maps.google.com/maps?q=${trackingData.lat},${trackingData.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                      title="Bus Live Location (Full Screen)"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>,
                  document.body
                )}
              </>
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
                    {isOffline ? 'Connection offline. Refresh paused.'
                      : isConnecting ? 'Connecting to live tracking…'
                      : fbError ? 'Live tracking unavailable'
                      : fbReady 
                        ? (isTripEnded 
                            ? `Route completed. Checking again in ${countdown}s.` 
                            : `Driver hasn't started the route yet. Checking again in ${countdown}s.`)
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
