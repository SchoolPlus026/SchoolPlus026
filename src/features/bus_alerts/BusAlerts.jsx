import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { rtdb } from '../../config/firebaseClient';
import { ref, set } from 'firebase/database';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Navigation, MapPin, Loader2, Wifi, WifiOff, Clock, CheckCircle2 } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';

const GEOCODE_INTERVAL_MS = 30000; // 30s — safe for Nominatim (1 req/s limit)
const GPS_POLL_INTERVAL_MS = 5000;  // 5s — local only, zero API calls

export default function BusAlerts() {
  const { user, schoolSettings } = useAppStore();
  const [isActive, setIsActive]     = useState(false);
  const [locationName, setLocationName] = useState('Acquiring location...');
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [isOnline, setIsOnline]         = useState(navigator.onLine);
  const [gpsError, setGpsError]         = useState(null);

  const latestCoordsRef  = useRef(null); // GPS buffer — updated every 5s locally
  const geocodeTimerRef  = useRef(null);
  const gpsWatchIdRef    = useRef(null);

  // Fetch this driver's bus assignment from Supabase
  const { data: assignment, isLoading: assignmentLoading } = useQuery({
    queryKey: ['bus-assignment', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bus_assignments')
        .select('bus_number, route_name, driver_name')
        .eq('driver_id', user.id)
        .eq('is_active', true)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
    enabled: !!user?.id,
  });

  const schoolId = schoolSettings?.school_id;
  const busId    = assignment?.bus_number
    ? `bus_${assignment.bus_number.toLowerCase().replace(/\s+/g, '_')}`
    : null;

  // Online/Offline detection
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  // Push payload to Firebase RTDB
  const pushToFirebase = useCallback(async (payload) => {
    if (!schoolId || !busId) return;
    const trackingRef = ref(rtdb, `tracking/${schoolId}/${busId}`);
    await set(trackingRef, payload);
  }, [schoolId, busId]);

  // Reverse geocode coords → human-readable area name
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`,
        { headers: { 'User-Agent': 'SchoolOS-BusSafeDrop/1.0 (schoolosplus@gmail.com)' } }
      );
      if (!res.ok) throw new Error('Geocode fetch failed');
      const data = await res.json();
      // Extract area-level name: neighbourhood > suburb > city_district > town > city
      const a = data.address || {};
      return a.neighbourhood || a.suburb || a.city_district || a.town || a.city || a.county || data.display_name?.split(',')[0] || 'En Route';
    } catch {
      return null; // Silently fail — show last known location
    }
  }, []);

  // Main geocode + Firebase push loop (every 30s)
  const runGeocodeAndPush = useCallback(async () => {
    if (!latestCoordsRef.current || !isOnline) return;
    const { lat, lng } = latestCoordsRef.current;
    const name = await reverseGeocode(lat, lng);
    if (name) {
      setLocationName(name);
      setLastUpdated(new Date());
      await pushToFirebase({
        location_name:   name,
        status:          'en_route',
        last_updated_ts: Date.now(),
        bus_number:      assignment?.bus_number || '',
        driver_name:     assignment?.driver_name || user?.email || '',
      });
    }
  }, [isOnline, reverseGeocode, pushToFirebase, assignment, user]);

  const startTracking = useCallback(() => {
    setGpsError(null);
    // Start GPS watch (local buffer only — no API)
    if (navigator.geolocation) {
      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => { latestCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        (err) => setGpsError(`GPS Error: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: GPS_POLL_INTERVAL_MS }
      );
    }
    // Kick off immediately, then every 30s
    runGeocodeAndPush();
    geocodeTimerRef.current = setInterval(runGeocodeAndPush, GEOCODE_INTERVAL_MS);
    setIsActive(true);
  }, [runGeocodeAndPush]);

  const stopTracking = useCallback(async () => {
    clearInterval(geocodeTimerRef.current);
    if (gpsWatchIdRef.current != null) navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    // Push final "trip ended" status
    await pushToFirebase({
      location_name:   'Trip Ended',
      status:          'trip_ended',
      last_updated_ts: Date.now(),
      bus_number:      assignment?.bus_number || '',
      driver_name:     assignment?.driver_name || user?.email || '',
    });
    setIsActive(false);
    setLocationName('Acquiring location...');
    setLastUpdated(null);
    latestCoordsRef.current = null;
  }, [pushToFirebase, assignment, user]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(geocodeTimerRef.current);
    if (gpsWatchIdRef.current != null) navigator.geolocation.clearWatch(gpsWatchIdRef.current);
  }, []);

  return (
    <ModuleGuard moduleName="bus_alerts" alwaysVisible={user.role === 'driver'}>
      <div className="fade-in max-w-md mx-auto pb-12 px-4">

        {/* Header */}
        <div style={{ borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '24px', marginTop: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={24} color="#fbbf24" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '18px', margin: 0 }}>Bus Safe Drop</h2>
            <p style={{ color: 'rgba(253,230,138,0.7)', fontSize: '12px', margin: '2px 0 0' }}>Live Tracking Control</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: isOnline ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
            {isOnline ? <Wifi size={13} color="#10b981" /> : <WifiOff size={13} color="#ef4444" />}
            <span style={{ fontSize: '11px', fontWeight: 700, color: isOnline ? '#10b981' : '#ef4444' }}>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        {/* Assignment Card */}
        {assignmentLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: '24px' }}><Loader2 className="animate-spin mx-auto" size={24} color="#fbbf24" /></div>
        ) : assignment ? (
          <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #fbbf24' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Your Assignment</div>
            <div style={{ fontWeight: 900, fontSize: '22px', color: 'var(--text-main)' }}>Bus No. {assignment.bus_number}</div>
            {assignment.route_name && <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{assignment.route_name}</div>}
          </div>
        ) : (
          <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #ef4444', textAlign: 'center' }}>
            <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '14px', margin: 0 }}>⚠️ No bus assigned. Contact your school admin.</p>
          </div>
        )}

        {/* Live Status Card (visible only when active) */}
        {isActive && (
          <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #10b981', background: 'rgba(16,185,129,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', flexShrink: 0, marginTop: '5px', boxShadow: '0 0 0 4px rgba(16,185,129,0.2)', animation: 'pulse 2s infinite' }} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>📍 Current Location (Live)</div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-main)', marginTop: '4px' }}>{locationName}</div>
                {lastUpdated && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <Clock size={11} color="var(--text-faint)" />
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                      Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {gpsError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', color: '#ef4444', fontSize: '13px', fontWeight: 600 }}>{gpsError}</div>}

        {/* Big Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button
            onClick={startTracking}
            disabled={isActive || !assignment || assignmentLoading}
            id="btn-start-route"
            style={{ padding: '36px 20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: (isActive || !assignment) ? 'var(--input-bg)' : '#10b981', border: `4px solid ${(isActive || !assignment) ? 'var(--card-border)' : '#059669'}`, color: (isActive || !assignment) ? 'var(--text-faint)' : '#fff', transition: 'all 0.2s ease', cursor: (isActive || !assignment) ? 'not-allowed' : 'pointer', opacity: (isActive || !assignment) ? 0.6 : 1 }}
          >
            <Navigation size={44} />
            <span style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Start Route</span>
            <span style={{ fontSize: '12px', opacity: 0.85 }}>Begins live location broadcast</span>
          </button>

          <button
            onClick={stopTracking}
            disabled={!isActive}
            id="btn-end-route"
            style={{ padding: '36px 20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', background: !isActive ? 'var(--input-bg)' : '#f59e0b', border: `4px solid ${!isActive ? 'var(--card-border)' : '#d97706'}`, color: !isActive ? 'var(--text-faint)' : '#fff', transition: 'all 0.2s ease', cursor: !isActive ? 'not-allowed' : 'pointer', opacity: !isActive ? 0.6 : 1 }}
          >
            <CheckCircle2 size={44} />
            <span style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>End Route</span>
            <span style={{ fontSize: '12px', opacity: 0.85 }}>Broadcasts "Trip Ended" to all</span>
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-faint)', marginTop: '24px' }}>
          Location updates every 30 seconds · Powered by OpenStreetMap
        </p>
      </div>
    </ModuleGuard>
  );
}
