import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Bus, MapPin, School, Clock, Loader2, RefreshCw, Navigation, WifiOff, Maximize2, Minimize2, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import ModuleGuard from '../../components/ModuleGuard';
import { decodeBusCSV } from '../../utils/csvCodec';
import mqttClient from '../../utils/mqttClient';
import { decryptPayload, hashTopic } from '../../utils/cryptoPayload';

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
  const { schoolSettings } = useAppStore();
  const [selectedBus,   setSelectedBus]   = useState('');
  const [trackingData,  setTrackingData]  = useState(undefined); // undefined = not yet received
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [isOffline,     setIsOffline]     = useState(!navigator.onLine);

  const schoolId = schoolSettings?.school_id;

  // Monitor online status
  useEffect(() => {
    const handleOnline  = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Bus list (with version-id event-driven cache) ─────────────────────────
  const { data: buses = [], isLoading: busesLoading, error: busListError, refetch: refetchBusList } = useQuery({
    queryKey: ['bus-list', schoolId],
    queryFn: async () => {
      console.log('[LiveBusTracker] fetching bus list for school:', schoolId);
      
      const cacheKey = `sp_bus_list_${schoolId}`;
      const versionKey = `sp_bus_list_version_${schoolId}`;
      const serverVersion = localStorage.getItem('sp_bus_list_server_version') || '';

      // Check version-id cache
      try {
        const cachedStr = localStorage.getItem(cacheKey);
        const localVersion = localStorage.getItem(versionKey) || '';
        
        if (cachedStr && localVersion && serverVersion && localVersion === serverVersion) {
          console.log('[LiveBusTracker] Reusing matching version-id cached bus list:', localVersion);
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
          if (serverVersion) {
            localStorage.setItem(versionKey, serverVersion);
          }
        } catch (e) {
          console.warn('[LiveBusTracker] localStorage cache write error:', e.message);
        }
      }

      console.log('[LiveBusTracker] bus list fetched:', data);
      return data || [];
    },
    enabled: !!schoolId,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 2,
  });

  // ─── Check server version vs local version on interaction ────────────────
  const checkBusListVersionAndFetch = useCallback(() => {
    if (!schoolId) return;
    const serverVersion = localStorage.getItem('sp_bus_list_server_version') || '';
    const localVersion  = localStorage.getItem(`sp_bus_list_version_${schoolId}`) || '';

    if (serverVersion && serverVersion !== localVersion) {
      console.log('[LiveBusTracker] Bus list version mismatch detected. Refetching from Supabase...');
      refetchBusList();
    }
  }, [schoolId, refetchBusList]);

  // Check version on mount and when returning from background
  useEffect(() => {
    checkBusListVersionAndFetch();
    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        checkBusListVersionAndFetch();
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [checkBusListVersionAndFetch]);

  // Listen to school config MQTT channel for real-time version_id broadcasts
  useEffect(() => {
    if (!schoolId) return;
    let configTopic = null;

    const handleConfigMessage = (payloadStr) => {
      try {
        const payload = JSON.parse(payloadStr);
        if (payload?.type === 'bus_list_updated' && payload?.version_id) {
          console.log('[LiveBusTracker] Received new config version:', payload.version_id);
          localStorage.setItem('sp_bus_list_server_version', payload.version_id);
          checkBusListVersionAndFetch();
        }
      } catch (e) {
        console.warn('[LiveBusTracker] Config message parse error:', e.message);
      }
    };

    const setupConfigChannel = async () => {
      const rawString = `schoolos:${schoolId}:config`;
      const encoder = new TextEncoder();
      const data = encoder.encode(rawString);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      configTopic = `schoolconfig/${hexHash.substring(0, 32)}`;

      mqttClient.subscribe(configTopic, handleConfigMessage);
    };

    setupConfigChannel();

    return () => {
      if (configTopic) mqttClient.unsubscribe(configTopic, handleConfigMessage);
    };
  }, [schoolId, checkBusListVersionAndFetch]);

  // ─── MQTT Real-Time WebSocket Subscription for Selected Bus ──────────────
  useEffect(() => {
    if (!selectedBus || !schoolId) {
      setTrackingData(undefined);
      return;
    }

    let activeTopic = null;
    const secretKey = `${schoolId}_secret_key`;

    const handleMqttMessage = async (encryptedPayload) => {
      // Empty payload means broker retained message was cleared (route inactive)
      if (!encryptedPayload) {
        console.log('[LiveBusTracker] Retained topic cleared by broker');
        setTrackingData(null);
        return;
      }

      try {
        const decryptedCsv = await decryptPayload(encryptedPayload, secretKey);
        const val = decodeBusCSV(decryptedCsv);
        if (val) {
          console.log('[LiveBusTracker] Real-time MQTT telemetry received:', val);
          if (val.status === 'trip_ended') {
            setTrackingData({ ...val, status: 'trip_ended' });
          } else {
            setTrackingData(val);
          }

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
        console.log('[LiveBusTracker] Subscribing to MQTT bus topic:', activeTopic);
        mqttClient.subscribe(activeTopic, handleMqttMessage);
        isSubscribed = true;
      }
    };

    const unsubscribeFromMqtt = () => {
      if (isSubscribed && activeTopic) {
        console.log('[LiveBusTracker] Unsubscribing from MQTT topic:', activeTopic);
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

  const isLive       = trackingData?.status === 'en_route';
  const isTripEnded  = trackingData?.status === 'trip_ended';
  const isSignalLost = trackingData?.status === 'signal_lost';

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
              onClick={checkBusListVersionAndFetch}
              onMouseDown={checkBusListVersionAndFetch}
              onFocus={checkBusListVersionAndFetch}
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
                : isSignalLost
                  ? <span style={{ fontSize: '10px', fontWeight: 800, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '20px', padding: '3px 10px' }}>🟡 Signal Lost</span>
                  : isTripEnded
                    ? <span style={{ fontSize: '10px', fontWeight: 800, background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)', borderRadius: '20px', padding: '3px 10px' }}>✅ Done</span>
                    : null
              }
            </div>

            {/* Signal Lost Warning Banner */}
            {isSignalLost && (
              <div style={{
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: '12px', padding: '12px 14px', marginBottom: '14px',
                display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>
                  Driver network signal lost. Waiting to reconnect… Showing last known location.
                </span>
              </div>
            )}

            {/* Location name + timestamp — shown when live or signal lost */}
            {(isLive || isSignalLost) && (
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
                      border: isLive ? '2px solid rgba(16,185,129,0.25)' : isSignalLost ? '2px solid rgba(245,158,11,0.3)' : '2px solid var(--card-border)',
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
                    {isOffline ? 'Connection offline.'
                      : isTripEnded 
                        ? 'Route completed for today.'
                        : 'Driver has not started the route yet.'}
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
