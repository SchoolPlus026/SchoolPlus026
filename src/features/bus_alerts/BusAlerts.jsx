import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { rtdb } from '../../config/firebaseClient';
import { ref, set } from 'firebase/database';
import { useAppStore } from '../../store/useAppStore';
import { Bus, Navigation, Loader2, Wifi, WifiOff, Clock, CheckCircle2, MapPinOff } from 'lucide-react';
import ModuleGuard from '../../components/ModuleGuard';
import { Geolocation } from '@capacitor/geolocation';

// ─── Constants ───────────────────────────────────────────────────────────────
const GEOCODE_INTERVAL_MS = 30000; // 30s push to Firebase (Nominatim safe rate)
const LS_KEY = 'schoolos_bus_tracking'; // localStorage persistence key

// ─── Helper: normalise bus_number → Firebase key ─────────────────────────────
// MUST stay identical to the key used in LiveBusTracker.jsx
function toBusKey(busNumber) {
  return `bus_${String(busNumber).trim().toLowerCase().replace(/\s+/g, '_')}`;
}

// ─── Helper: parse Nominatim address into a human-readable string ─────────────
function parseAddress(data) {
  if (!data) return null;
  const a = data.address || {};
  console.log('[Nominatim] raw address object:', JSON.stringify(a));

  const local =
    a.neighbourhood ||
    a.suburb        ||
    a.village       ||
    a.road          ||
    a.residential   ||
    a.hamlet        ||
    a.quarter       ||
    null;

  const city = a.city || a.town || a.municipality || a.county || null;

  console.log(`[Nominatim] localArea="${local}"  city="${city}"`);

  if (local && city && local.toLowerCase() !== city.toLowerCase()) {
    return `${local}, ${city}`;
  }
  if (local) return local;
  if (city)  return city;
  // Final fallback: use first segment of display_name
  const fallback = data.display_name?.split(',')[0]?.trim() || null;
  console.warn('[Nominatim] using display_name fallback:', fallback);
  return fallback;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BusAlerts() {
  const { user, role, schoolSettings } = useAppStore();

  const [isActive,      setIsActive]      = useState(false);
  const [isStarting,    setIsStarting]    = useState(false);
  const [locationName,  setLocationName]  = useState('Acquiring location...');
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [gpsError,      setGpsError]      = useState(null);

  const coordsRef       = useRef(null);   // latest GPS coords buffer
  const geocodeTimerRef = useRef(null);   // setInterval handle
  const watchIdRef      = useRef(null);   // Capacitor watchPosition id

  // ─── Bus assignment ─────────────────────────────────────────────────────
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
  const busKey   = assignment?.bus_number ? toBusKey(assignment.bus_number) : null;

  // ─── Online/offline ─────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ─── Firebase push ──────────────────────────────────────────────────────
  const pushToFirebase = useCallback(async (payload) => {
    if (!schoolId || !busKey || !rtdb) {
      console.warn('[Firebase] push skipped — missing schoolId/busKey/rtdb', { schoolId, busKey, rtdb: !!rtdb });
      return;
    }
    const path = `tracking/${schoolId}/${busKey}`;
    console.log('[Firebase] pushing to:', path, payload);
    try {
      await set(ref(rtdb, path), payload);
      console.log('[Firebase] push OK');
    } catch (e) {
      console.error('[Firebase] push FAILED:', e.message);
    }
  }, [schoolId, busKey]);

  // ─── Reverse geocode ────────────────────────────────────────────────────
  const reverseGeocode = useCallback(async (lat, lng) => {
    console.log(`[Geocode] requesting for ${lat}, ${lng}`);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
        { headers: { 'User-Agent': 'SchoolOS-BusSafeDrop/1.0 (schoolosplus@gmail.com)' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const name = parseAddress(data);
      console.log('[Geocode] result:', name);
      return name;
    } catch (e) {
      console.error('[Geocode] FAILED:', e.message);
      return null;
    }
  }, []);

  // ─── Geocode + push loop (called immediately + every 30s) ───────────────
  const runGeocodeAndPush = useCallback(async () => {
    if (!coordsRef.current) {
      console.warn('[Loop] skipped — no coords yet');
      return;
    }
    if (!isOnline) {
      console.warn('[Loop] skipped — offline');
      return;
    }
    const { lat, lng } = coordsRef.current;
    const name = await reverseGeocode(lat, lng);

    // If Nominatim fails, fall back to coordinate string rather than skipping the push
    const locationLabel = name || `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    setLocationName(locationLabel);
    setLastUpdated(new Date());
    await pushToFirebase({
      location_name:   locationLabel,
      status:          'en_route',
      last_updated_ts: Date.now(),
      bus_number:      assignment?.bus_number || '',
      driver_name:     assignment?.driver_name || user?.email || '',
    });
  }, [isOnline, reverseGeocode, pushToFirebase, assignment, user]);

  // ─── GPS Permission + Start flow ─────────────────────────────────────────
  // Strategy: always attempt Geolocation.requestPermissions() first.
  // The Capacitor plugin handles both native and web contexts internally.
  // We do NOT gate on Capacitor.isNativePlatform() because in live-reload
  // mode that returns false even inside the APK's WebView.
  const startTracking = useCallback(async () => {
    setGpsError(null);
    setIsStarting(true);

    // ── Step 1: Request permission via Capacitor plugin ──────────────────
    console.log('[GPS] requesting permissions via Capacitor plugin...');
    try {
      const permResult = await Geolocation.requestPermissions({ permissions: ['location'] });
      console.log('[GPS] permission result:', JSON.stringify(permResult));

      const granted =
        permResult.location === 'granted' ||
        permResult.coarseLocation === 'granted';

      if (!granted) {
        console.error('[GPS] permission denied by user');
        setGpsError(
          'Location permission was denied. Please go to your device Settings → Apps → SchoolOS+ → Permissions → Location and set it to "Allow".'
        );
        setIsStarting(false);
        return; // halt — isActive stays false
      }
    } catch (permErr) {
      // On desktop browsers / HTTPS dev: requestPermissions may throw.
      // We log it and continue — getCurrentPosition will trigger the browser dialog.
      console.warn('[GPS] requestPermissions threw (may be browser context):', permErr.message);
    }

    // ── Step 2: Seed initial position immediately ─────────────────────────
    console.log('[GPS] getting initial position...');
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      console.log('[GPS] initial position:', coordsRef.current);
    } catch (posErr) {
      console.warn('[GPS] initial getCurrentPosition failed:', posErr.message);
      // Non-fatal — watchPosition will supply coords
    }

    // ── Step 3: Start continuous native position watch ────────────────────
    console.log('[GPS] starting watchPosition...');
    try {
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000 },
        (position, err) => {
          if (err) {
            console.error('[GPS] watchPosition callback error:', err.message);
            setGpsError(`GPS Error: ${err.message}`);
            return;
          }
          if (position?.coords) {
            const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            console.log('[GPS] position update:', coords);
            coordsRef.current = coords;
          }
        }
      );
      watchIdRef.current = id;
      console.log('[GPS] watchPosition started, id:', id);
    } catch (watchErr) {
      console.error('[GPS] watchPosition threw:', watchErr.message);
      setGpsError(
        `GPS failed to start: ${watchErr.message}. Make sure your device GPS is turned on.`
      );
      setIsStarting(false);
      return; // halt
    }

    // ── Step 4: Activate session ──────────────────────────────────────────
    localStorage.setItem(LS_KEY, 'true');
    setIsActive(true);
    setIsStarting(false);
    console.log('[Session] tracking STARTED — schoolId:', schoolId, 'busKey:', busKey);

    // Fire first geocode+push immediately, then every 30s
    runGeocodeAndPush();
    if (geocodeTimerRef.current) clearInterval(geocodeTimerRef.current);
    geocodeTimerRef.current = setInterval(runGeocodeAndPush, GEOCODE_INTERVAL_MS);
  }, [runGeocodeAndPush, schoolId, busKey]);

  // ─── Stop tracking ───────────────────────────────────────────────────────
  const stopTracking = useCallback(() => {
    console.log('[Session] stopping tracking...');

    // 1. Kill interval + GPS watch (synchronous)
    if (geocodeTimerRef.current) {
      clearInterval(geocodeTimerRef.current);
      geocodeTimerRef.current = null;
    }
    if (watchIdRef.current != null) {
      Geolocation.clearWatch({ id: watchIdRef.current }).catch((e) =>
        console.warn('[GPS] clearWatch error:', e.message)
      );
      watchIdRef.current = null;
    }

    // 2. Wipe local persistence
    localStorage.removeItem(LS_KEY);
    coordsRef.current = null;

    // 3. Update React state IMMEDIATELY (no await — UI must flip instantly)
    setIsActive(false);
    setLocationName('Acquiring location...');
    setLastUpdated(null);
    setGpsError(null);

    // 4. Push trip_ended in the background
    console.log('[Session] pushing trip_ended to Firebase...');
    pushToFirebase({
      location_name:   'Trip Ended',
      status:          'trip_ended',
      last_updated_ts: Date.now(),
      bus_number:      assignment?.bus_number || '',
      driver_name:     assignment?.driver_name || user?.email || '',
    });

    console.log('[Session] tracking STOPPED');
  }, [pushToFirebase, assignment, user]);

  // ─── Auto-resume on mount if session was active ──────────────────────────
  useEffect(() => {
    if (assignment && localStorage.getItem(LS_KEY) === 'true' && !isActive) {
      console.log('[Session] restoring persisted tracking session...');
      startTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current) clearInterval(geocodeTimerRef.current);
      if (watchIdRef.current != null) {
        Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {});
      }
    };
  }, []);

  // ─── Derived button state ────────────────────────────────────────────────
  const startDisabled = isActive || isStarting || !assignment || assignmentLoading;
  const stopDisabled  = !isActive || isStarting;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ModuleGuard moduleName="bus_alerts" alwaysVisible={role === 'driver'}>
      <div className="fade-in max-w-md mx-auto pb-12 px-4">

        {/* ── Header ── */}
        <div style={{
          borderRadius: '20px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          padding: '24px', marginTop: '24px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bus size={24} color="#fbbf24" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '18px', margin: 0 }}>Bus Tracker</h2>
            <p style={{ color: 'rgba(253,230,138,0.7)', fontSize: '12px', margin: '2px 0 0' }}>Live Tracking Control</p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
            borderRadius: '20px',
            background: isOnline ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {isOnline ? <Wifi size={13} color="#10b981" /> : <WifiOff size={13} color="#ef4444" />}
            <span style={{ fontSize: '11px', fontWeight: 700, color: isOnline ? '#10b981' : '#ef4444' }}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* ── Assignment Card ── */}
        {assignmentLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
            <Loader2 className="animate-spin mx-auto" size={24} color="#fbbf24" />
          </div>
        ) : assignment ? (
          <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #fbbf24' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Your Assignment
            </div>
            <div style={{ fontWeight: 900, fontSize: '22px', color: 'var(--text-main)' }}>
              Bus No. {assignment.bus_number}
            </div>
            {assignment.route_name && (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {assignment.route_name}
              </div>
            )}
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '6px', fontFamily: 'monospace' }}>
              Firebase key: {busKey || '—'}
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #ef4444', textAlign: 'center' }}>
            <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '14px', margin: 0 }}>
              ⚠️ No bus assigned. Contact your school admin.
            </p>
          </div>
        )}

        {/* ── Live Status Card ── */}
        {isActive && (
          <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #10b981', background: 'rgba(16,185,129,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: '#10b981', flexShrink: 0, marginTop: '5px',
                boxShadow: '0 0 0 4px rgba(16,185,129,0.2)', animation: 'pulse 2s infinite',
              }} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  📍 Current Location (Live)
                </div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-main)', marginTop: '4px' }}>
                  {locationName}
                </div>
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

        {/* ── GPS / Permission Error ── */}
        {gpsError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '14px', padding: '14px 16px', marginBottom: '16px',
          }}>
            <MapPinOff size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
            <p style={{ margin: 0, color: '#ef4444', fontSize: '13px', fontWeight: 600, lineHeight: 1.5 }}>
              {gpsError}
            </p>
          </div>
        )}

        {/* ── Permission request in-progress indicator ── */}
        {isStarting && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)',
            borderRadius: '14px', padding: '14px 16px', marginBottom: '16px',
          }}>
            <Loader2 size={18} className="animate-spin" color="#6366f1" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#6366f1', fontWeight: 600 }}>
              Requesting GPS permission…
            </span>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* START ROUTE */}
          <button
            id="btn-start-route"
            onClick={startTracking}
            disabled={startDisabled}
            style={{
              padding: '36px 20px', borderRadius: '24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              background: startDisabled ? 'var(--input-bg)' : '#10b981',
              border: `4px solid ${startDisabled ? 'var(--card-border)' : '#059669'}`,
              color: startDisabled ? 'var(--text-faint)' : '#fff',
              transition: 'all 0.2s ease',
              cursor: startDisabled ? 'not-allowed' : 'pointer',
              opacity: startDisabled ? 0.6 : 1,
            }}
          >
            {isStarting ? <Loader2 size={44} className="animate-spin" /> : <Navigation size={44} />}
            <span style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isStarting ? 'Starting…' : 'Start Route'}
            </span>
            <span style={{ fontSize: '12px', opacity: 0.85 }}>
              {isStarting ? 'Acquiring GPS lock…' : 'Begins live location broadcast'}
            </span>
          </button>

          {/* END ROUTE */}
          <button
            id="btn-end-route"
            onClick={stopTracking}
            disabled={stopDisabled}
            style={{
              padding: '36px 20px', borderRadius: '24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              background: stopDisabled ? 'var(--input-bg)' : '#f59e0b',
              border: `4px solid ${stopDisabled ? 'var(--card-border)' : '#d97706'}`,
              color: stopDisabled ? 'var(--text-faint)' : '#fff',
              transition: 'all 0.2s ease',
              cursor: stopDisabled ? 'not-allowed' : 'pointer',
              opacity: stopDisabled ? 0.6 : 1,
            }}
          >
            <CheckCircle2 size={44} />
            <span style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              End Route
            </span>
            <span style={{ fontSize: '12px', opacity: 0.85 }}>
              Broadcasts "Trip Ended" to all
            </span>
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-faint)', marginTop: '24px' }}>
          Location updates every 30 seconds · Powered by OpenStreetMap
        </p>
      </div>
    </ModuleGuard>
  );
}
