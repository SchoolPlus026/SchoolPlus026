import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';

import { useAppStore } from '../../store/useAppStore';
import { Bus, Navigation, Loader2, Wifi, WifiOff, Clock, CheckCircle2, MapPinOff, Maximize2, Minimize2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import ModuleGuard from '../../components/ModuleGuard';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { ensureFirebaseAuthenticated } from '../../utils/firebaseAuth';
import { encodeBusCSV } from '../../utils/csvCodec';
import mqttClient from '../../utils/mqttClient';
import { encryptPayload, hashTopic } from '../../utils/cryptoPayload';
import { resolveReverseGeocode } from '../../utils/reverseGeocode';

// ─── Constants ───────────────────────────────────────────────────────────────
const GEOCODE_INTERVAL_MS = 10000; // 10s high-frequency real-time update interval
const LS_KEY = 'sp_driver_tracking_active'; // localStorage persistence key

// Haversine formula to compute distance in meters between two lat/lng coordinates
function getHaversineDistance(coords1, coords2) {
  if (!coords1 || !coords2) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000; // Earth's mean radius in meters
  const dLat = toRad(coords2.lat - coords1.lat);
  const dLng = toRad(coords2.lng - coords1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1.lat)) *
      Math.cos(toRad(coords2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Helper: normalise bus_number → Firebase key ─────────────────────────────
// MUST stay identical to the key used in LiveBusTracker.jsx
function toBusKey(busNumber) {
  return `bus_${String(busNumber).trim().toLowerCase().replace(/\s+/g, '_')}`;
}

// ─── Helper: parse Nominatim address into a human-readable string ─────────────
// Key priority for rural/semi-urban India:
//   road          → most consistently populated even in small towns
//   neighbourhood → named areas within a city
//   suburb        → city zones
//   residential   → residential area names
//   hamlet        → very small settlements
//   village       → village name
//   town/city     → last resort (city-only result)
function parseAddress(data, lat, lng) {
  if (!data) return null;
  const a = data.address || {};
  console.log('[Nominatim] raw address object:', JSON.stringify(a));

  // Granular local identifier (street / area level)
  const local =
    a.road          ||
    a.neighbourhood ||
    a.suburb        ||
    a.residential   ||
    a.hamlet        ||
    a.village       ||
    null;

  // City / town identifier
  const city = a.city || a.town || a.municipality || a.county || null;

  console.log(`[Nominatim] local="${local}"  city="${city}"`);

  if (local && city && local.toLowerCase() !== city.toLowerCase()) {
    return `${local}, ${city}`;
  }
  if (local && !city) return local;

  // Only city-level data available — append coords for precision
  if (city) {
    const coordStr = lat != null ? ` (GPS: ${Number(lat).toFixed(2)}, ${Number(lng).toFixed(2)})` : '';
    console.warn('[Nominatim] city-only result, appending coords:', city + coordStr);
    return city + coordStr;
  }

  // Absolute fallback: first segment of display_name
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
  const [displayCoords, setDisplayCoords] = useState(null); // {lat, lng} for the map iframe
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [gpsError,      setGpsError]      = useState(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  const [fbReady,       setFbReady]       = useState(false);
  const [fbError,       setFbError]       = useState(null);

  const coordsRef            = useRef(null);   // latest GPS coords buffer
  const geocodeTimerRef      = useRef(null);   // setInterval handle
  const watchIdRef           = useRef(null);   // Capacitor watchPosition id
  const lastPushTimeRef      = useRef(0);      // timestamp of last Firebase push (background sync guard)
  const runGeocodeAndPushRef = useRef(null);   // stable ref so watchPosition callback never goes stale
  
  const lastPushedCoordsRef  = useRef(null);   // coords of last successful Firebase push
  const lastGeocodedCoordsRef = useRef(null);   // coords of last successful Nominatim geocode
  const cachedLocationNameRef = useRef('');     // cached reverse geocoding address label

  // Hardware/permission errors and background workarounds
  const [hardwareErrorModal, setHardwareErrorModal] = useState(null); // 'secure_context' | 'permission_denied' | null
  const [showBatteryModal, setShowBatteryModal] = useState(false);
  const wakeLockRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioIntervalRef = useRef(null);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Screen Wake Lock acquired.');
      } else {
        console.warn('[WakeLock] Screen Wake Lock not supported on this browser.');
      }
    } catch (err) {
      console.warn('[WakeLock] request screen wake lock failed:', err.message);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[WakeLock] Screen Wake Lock released.');
      }
    } catch (err) {
      console.warn('[WakeLock] release screen wake lock failed:', err.message);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (isActive && document.visibilityState === 'visible') {
        // Small delay: the page must be fully visible before WakeLock.request() succeeds
        setTimeout(async () => {
          try {
            if ('wakeLock' in navigator && document.visibilityState === 'visible') {
              wakeLockRef.current = await navigator.wakeLock.request('screen');
              console.log('[WakeLock] Screen Wake Lock re-acquired on visibility change.');
            }
          } catch (err) {
            // Non-fatal — page may have become hidden again between the timeout and the request
          }
        }, 250);
      }
    };

    if (isActive) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  const startSilentAudio = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      
      let ctx = audioContextRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const bufferSize = ctx.sampleRate * 2; // 2 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);

      const playLoop = () => {
        if (!audioContextRef.current || audioContextRef.current.state !== 'running') return;
        try {
          const source = audioContextRef.current.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContextRef.current.destination);
          source.start(0);
        } catch (_) {}
      };

      playLoop();
      if (!audioIntervalRef.current) {
        audioIntervalRef.current = setInterval(playLoop, 1500);
      }
      console.log('[SilentAudio] Web Audio context active.');
    } catch (e) {
      console.warn('[SilentAudio] Web Audio failed:', e.message);
    }
  };

  const stopSilentAudio = () => {
    try {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        console.log('[SilentAudio] Web Audio context closed.');
      }
    } catch (e) {
      console.warn('[SilentAudio] Stop Audio context failed:', e.message);
    }
  };

  // ─── Firebase Authentication Bridge ───────────────────────────────────────
  useEffect(() => {
    async function authFirebase() {
      try {
        console.log('[BusAlerts] Authenticating driver with Firebase...');
        await ensureFirebaseAuthenticated();
        setFbReady(true);
        setFbError(null);
      } catch (err) {
        console.error('[BusAlerts] Firebase auth failed:', err.message);
        setFbError(`Firebase Connection Error: ${err.message}`);
      }
    }
    if (user?.id) {
      authFirebase();
    }
  }, [user?.id]);

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

  // ─── MQTT + Firebase Broadcast ──────────────────────────────────────────
  const pushLocationBroadcast = useCallback(async (payload) => {
    if (!schoolId || !assignment?.bus_number) {
      console.warn('[Broadcast] skipped — missing schoolId or bus_number');
      return;
    }

    const enrichedPayload = {
      lat: coordsRef.current?.lat || null,
      lng: coordsRef.current?.lng || null,
      location_name: cachedLocationNameRef.current || '',
      bus_number: assignment?.bus_number || '',
      driver_name: assignment?.driver_name || user?.email || '',
      ...payload
    };

    const csvString = encodeBusCSV(enrichedPayload);
    const secretKey = `${schoolId}_secret_key`;

    try {
      // 1. MQTT WebSockets Broadcast with RETAIN=1 for late joiners
      const topic = await hashTopic(schoolId, assignment.bus_number);
      const encryptedData = await encryptPayload(csvString, secretKey);

      // Set LWT (Last Will & Testament) for abrupt disconnects / crash / battery death
      const lwtPayload = encodeBusCSV({
        ...enrichedPayload,
        status: 'signal_lost',
        location_name: 'Driver Network Signal Lost',
        last_updated_ts: Date.now()
      });
      const encryptedLwt = await encryptPayload(lwtPayload, secretKey);
      
      const needsLwtReconnect = !mqttClient.lwt || mqttClient.lwt.topic !== topic;
      mqttClient.setWill(topic, encryptedLwt, true);

      if (needsLwtReconnect && mqttClient.isConnected) {
        console.log('[MQTT] Reconnecting to register Will packet on broker...');
        mqttClient.cleanup();
        await mqttClient.connect();
      }

      await mqttClient.publish(topic, encryptedData, true); // retain=true
      console.log('[MQTT] Retained broadcast sent to topic:', topic);
    } catch (e) {
      console.error('[Broadcast] FAILED:', e.message);
    }
  }, [schoolId, busKey, assignment, user]);

  // ─── Geocode + push loop (called immediately + every 10s) ───────────────
  const runGeocodeAndPush = useCallback(async () => {
    if (!coordsRef.current) {
      // Silently skip — coords not yet available (normal on first few ticks or web-only testing)
      return;
    }
    if (!isOnline) {
      console.warn('[Loop] skipped — offline');
      return;
    }
    const { lat, lng } = coordsRef.current;

    // 1. Distance-based throttling (skip write if bus hasn't moved >20m and less than 30s elapsed)
    if (lastPushedCoordsRef.current) {
      const distanceMoved = getHaversineDistance(lastPushedCoordsRef.current, { lat, lng });
      const timeElapsed = Date.now() - lastPushTimeRef.current;
      if (distanceMoved < 20 && timeElapsed < 30 * 1000) {
        console.log(`[GPS] Skipping broadcast — bus static. Moved: ${distanceMoved.toFixed(1)}m, Elapsed: ${Math.floor(timeElapsed / 1000)}s`);
        return;
      }
    }

    // 2. Address Resolution via BigDataCloud (Primary uncapped client API)
    let locationLabel = '';
    if (lastGeocodedCoordsRef.current) {
      const geocodeDistance = getHaversineDistance(lastGeocodedCoordsRef.current, { lat, lng });
      if (geocodeDistance < 150 && cachedLocationNameRef.current) {
        locationLabel = cachedLocationNameRef.current;
      }
    }

    if (!locationLabel) {
      locationLabel = await resolveReverseGeocode(lat, lng, cachedLocationNameRef.current);
      if (locationLabel && !locationLabel.startsWith('En Route (')) {
        lastGeocodedCoordsRef.current = { lat, lng };
        cachedLocationNameRef.current = locationLabel;
      }
    }

    setLocationName(locationLabel);
    setDisplayCoords({ lat, lng }); // update map iframe
    setLastUpdated(new Date());
    lastPushTimeRef.current = Date.now();
    lastPushedCoordsRef.current = { lat, lng };

    await pushLocationBroadcast({
      location_name:   locationLabel,
      status:          'en_route',
      last_updated_ts: Date.now(),
      lat,
      lng,
      bus_number:      assignment?.bus_number || '',
      driver_name:     assignment?.driver_name || user?.email || '',
    });
  }, [isOnline, pushLocationBroadcast, assignment, user]);

  // Keep a stable ref to runGeocodeAndPush so the native watchPosition callback
  // (captured at mount time) always calls the latest version without stale closures.
  useEffect(() => { runGeocodeAndPushRef.current = runGeocodeAndPush; }, [runGeocodeAndPush]);

  // ─── GPS Permission + Start flow ─────────────────────────────────────────
  // Strategy: always attempt Geolocation.requestPermissions() first.
  // The Capacitor plugin handles both native and web contexts internally.
  // We do NOT gate on Capacitor.isNativePlatform() because in live-reload
  // mode that returns false even inside the APK's WebView.
  const startTracking = useCallback(async () => {
    setGpsError(null);
    setHardwareErrorModal(null);
    setIsStarting(true);

    // ── Check Secure Context ──
    if (!window.isSecureContext) {
      console.error('[GPS] Secure context required for Geolocation.');
      setHardwareErrorModal('secure_context');
      setIsStarting(false);
      return;
    }

    // ── Step 0: Ensure Firebase is authenticated before starting ──
    try {
      await ensureFirebaseAuthenticated();
    } catch (authErr) {
      setGpsError(`Firebase Connection Error: ${authErr.message}`);
      setIsStarting(false);
      return;
    }

    // ── Step 1: Request permission via Capacitor plugin on native ──────────────
    if (Capacitor.isNativePlatform()) {
      console.log('[GPS] requesting permissions via Capacitor plugin...');
      try {
        const permResult = await Geolocation.requestPermissions({ permissions: ['location'] });
        console.log('[GPS] permission result:', JSON.stringify(permResult));

        const granted =
          permResult.location === 'granted' ||
          permResult.coarseLocation === 'granted';

        if (!granted) {
          console.error('[GPS] permission denied by user');
          setHardwareErrorModal('permission_denied');
          setGpsError(
            'Location permission was denied. Please go to your device Settings → Apps → SchoolOS+ → Permissions → Location and set it to "Allow".'
          );
          setIsStarting(false);
          return; // halt — isActive stays false
        }
      } catch (permErr) {
        console.warn('[GPS] requestPermissions error:', permErr.message);
      }
    } else {
      console.log('[GPS] Web environment detected — using browser Geolocation API permissions.');
    }

    // ── Step 2: Seed initial position with high-accuracy filter ─────────────
    console.log('[GPS] getting initial position...');
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });

      const accuracy = pos.coords.accuracy || 0;
      console.log(`[GPS] initial position received (lat: ${pos.coords.latitude}, lng: ${pos.coords.longitude}, accuracy: ${accuracy}m)`);

      // Only reject coarse locations on native Android/iOS where a real GPS chip is available.
      // On desktop/web, the browser IP geolocation is the only source — accept it.
      if (Capacitor.isNativePlatform() && accuracy > 3000) {
        console.warn(`[GPS] Initial position rejected — coarse IP geolocation detected (accuracy: ${accuracy}m). Waiting for satellite fix...`);
      } else {
        coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch (posErr) {
      console.warn('[GPS] initial getCurrentPosition failed:', posErr.message);
    }

    // ── Step 3: Start continuous native position watch with accuracy filtering ─
    console.log('[GPS] starting watchPosition...');
    try {
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 3000 },
        (position, err) => {
          if (err) {
            console.warn('[GPS] watchPosition callback error:', err.message);
            if (!coordsRef.current) {
              setGpsError(`GPS Error: ${err.message}`);
            }
            return;
          }
          if (position?.coords) {
            const accuracy = position.coords.accuracy || 0;
            const newCoords = { lat: position.coords.latitude, lng: position.coords.longitude };

            // On native (Android/iOS), reject coarse IP fallbacks — real GPS chip available.
            // On web browsers, accept whatever accuracy the browser provides (no GPS chip).
            if (Capacitor.isNativePlatform() && accuracy > 3000) {
              console.warn(`[GPS] Position update rejected — coarse IP geolocation detected (accuracy: ${accuracy}m). Waiting for satellite fix...`);
              return;
            }

            setGpsError(null);
            console.log(`[GPS] position update accepted (lat: ${newCoords.lat}, lng: ${newCoords.lng}, accuracy: ${accuracy}m)`);
            coordsRef.current = newCoords;

            const now = Date.now();
            if (now - lastPushTimeRef.current >= GEOCODE_INTERVAL_MS) {
              lastPushTimeRef.current = now;
              runGeocodeAndPushRef.current?.();
            }
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
    localStorage.setItem('sp_driver_tracking_start_ts', Date.now().toString());
    localStorage.setItem('sp_driver_tracking_bus_number', assignment?.bus_number || '');
    localStorage.setItem('sp_driver_tracking_route_name', assignment?.route_name || '');
    localStorage.setItem('sp_driver_tracking_driver_name', assignment?.driver_name || user?.email || '');
    setIsActive(true);
    setIsStarting(false);
    console.log('[Session] tracking STARTED — schoolId:', schoolId, 'busKey:', busKey);

    // Check if battery optimization guidance modal should be shown
    if (Capacitor.isNativePlatform() && !localStorage.getItem('sp_battery_opt_dismissed')) {
      setShowBatteryModal(true);
    }

    // Acquire Wake Lock & start Silent Audio Loop to prevent background suspension
    await requestWakeLock();
    startSilentAudio();

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
    localStorage.removeItem('sp_driver_tracking_start_ts');
    localStorage.removeItem('sp_driver_tracking_bus_number');
    localStorage.removeItem('sp_driver_tracking_route_name');
    localStorage.removeItem('sp_driver_tracking_driver_name');
    coordsRef.current = null;

    // Reset caching refs
    lastPushedCoordsRef.current = null;
    lastGeocodedCoordsRef.current = null;
    cachedLocationNameRef.current = '';

    // Clear LWT when user manually stops tracking
    mqttClient.clearWill();

    // Release Wake Lock & stop Silent Audio Loop
    releaseWakeLock();
    stopSilentAudio();

    // 3. Update React state IMMEDIATELY (no await — UI must flip instantly)
    setIsActive(false);
    setLocationName('Acquiring location...');
    setDisplayCoords(null);
    setLastUpdated(null);
    setGpsError(null);

    // 4. Push trip_ended with RETAIN=1 so viewers receive status immediately
    console.log('[Session] pushing trip_ended broadcast...');
    pushLocationBroadcast({
      location_name:   'Trip Ended',
      status:          'trip_ended',
      last_updated_ts: Date.now(),
      bus_number:      assignment?.bus_number || '',
      driver_name:     assignment?.driver_name || user?.email || '',
    });

    // 5. Clear the retained message after a 2s delay so topic resets for clean next start
    if (schoolId && assignment?.bus_number) {
      setTimeout(async () => {
        try {
          const topic = await hashTopic(schoolId, assignment.bus_number);
          await mqttClient.publish(topic, '', true);
          console.log('[MQTT] Cleared retained trip state on broker');
        } catch (e) {}
      }, 2000);
    }

    console.log('[Session] tracking STOPPED');
  }, [pushLocationBroadcast, assignment, user]);

  const createSystemNotice = useCallback(async () => {
    if (!schoolSettings?.school_id) return;
    try {
      const busNum = assignment?.bus_number || 'Assigned Bus';
      const route = assignment?.route_name ? ` (${assignment.route_name})` : '';
      await supabase
        .from('notices')
        .insert({
          school_id: schoolSettings.school_id,
          title:     `System Notice: Bus ${busNum} Route Auto-Ended`,
          content:   `The live tracking session for Bus ${busNum}${route} has been automatically ended after exceeding the maximum duration limit of 2 hours.`,
          date:      new Date().toISOString().split('T')[0],
          scope:     'all',
          photo_url: null,
          author_id: user?.id || null,
          author_role: 'system',
        });
      console.log('[Notice] System notice published for auto-ended route.');
    } catch (err) {
      console.error('[Notice] Failed to create system notice:', err.message);
    }
  }, [schoolSettings?.school_id, assignment?.bus_number, assignment?.route_name, user?.id]);

  // Periodic checker to auto-end route after 2 hours
  useEffect(() => {
    if (!isActive) return;

    const checkInterval = setInterval(() => {
      const startTs = Number(localStorage.getItem('sp_driver_tracking_start_ts') || '0');
      if (startTs > 0 && Date.now() - startTs >= 2 * 60 * 60 * 1000) {
        console.log('[GPS] Session exceeded 2 hours limit. Auto-ending route...');
        stopTracking();
        createSystemNotice();
        alert('Your live tracking session has been automatically ended because it exceeded the 2-hour limit.');
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInterval);
  }, [isActive, stopTracking, createSystemNotice]);

  // ─── Auto-resume on mount if session was active ──────────────────────────
  useEffect(() => {
    if (assignment && localStorage.getItem(LS_KEY) === 'true' && !isActive) {
      const startTs = Number(localStorage.getItem('sp_driver_tracking_start_ts') || '0');
      const elapsed = Date.now() - startTs;
      if (startTs > 0 && elapsed >= 2 * 60 * 60 * 1000) {
        console.log('[Session] persisted session has expired (>2 hours). Cleaning up...');
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem('sp_driver_tracking_start_ts');
        
        pushLocationBroadcast({
          location_name:   'Trip Ended (Timeout)',
          status:          'trip_ended',
          last_updated_ts: Date.now(),
          bus_number:      assignment?.bus_number || '',
          driver_name:     assignment?.driver_name || user?.email || '',
        });

        createSystemNotice();
      } else {
        console.log('[Session] restoring persisted tracking session...');
        startTracking();
      }
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
      releaseWakeLock();
      stopSilentAudio();
    };
  }, []);

  // ─── Derived button state ────────────────────────────────────────────────
  const startDisabled = isActive || isStarting || !assignment || assignmentLoading || !fbReady;
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

            {/* ── Google Maps Mini Map ── keyless embed, works in Android WebView */}
            {displayCoords && (
              <div style={{ position: 'relative', marginTop: '14px' }}>
                <iframe
                  key={`${displayCoords.lat}-${displayCoords.lng}`}
                  src={`https://maps.google.com/maps?q=${displayCoords.lat},${displayCoords.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                  style={{
                    width: '100%', height: '350px', borderRadius: '12px',
                    border: 'none', display: 'block',
                  }}
                  title="Live Location Map"
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
            )}

            {/* ── Full-Screen Map Portal ── */}
            {mapFullscreen && displayCoords && createPortal(
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
                  key={`fs-${displayCoords.lat}-${displayCoords.lng}`}
                  src={`https://maps.google.com/maps?q=${displayCoords.lat},${displayCoords.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  title="Live Location Map (Full Screen)"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>,
              document.body
            )}
          </div>
        )}

        {/* ── Firebase Auth Error ── */}
        {fbError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '14px', padding: '14px 16px', marginBottom: '16px',
          }}>
            <MapPinOff size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: '#ef4444', fontSize: '13px', fontWeight: 600, lineHeight: 1.5 }}>
                {fbError}
              </p>
              <p style={{ margin: '4px 0 0', color: '#fca5a5', fontSize: '11px', lineHeight: 1.4 }}>
                If you are testing locally, make sure the mint-firebase-token Edge Function is running and FCM_SERVICE_ACCOUNT_KEY is configured in Supabase.
              </p>
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
          Location updates every 10 seconds · Real-time via MQTT
        </p>
      </div>

      {hardwareErrorModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(5, 5, 10, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            width: '100%', maxWidth: '400px',
            background: 'linear-gradient(135deg, #10101f, #080811)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '24px', padding: '28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            position: 'relative'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <MapPinOff size={28} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', margin: '0 0 8px' }}>
                {hardwareErrorModal === 'secure_context' ? 'Secure Context Required' : 'Location Permission Denied'}
              </h3>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                {hardwareErrorModal === 'secure_context' 
                  ? 'Live GPS location tracking strictly requires a secure HTTPS connection. Please deploy the web app with SSL or access it via localhost.'
                  : 'SchoolOS+ requires location permissions to broadcast driver coordinates. Please enable location services in your browser settings and try again.'}
              </p>
            </div>
            <button 
              onClick={() => setHardwareErrorModal(null)} 
              style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showBatteryModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(5, 5, 10, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            width: '100%', maxWidth: '420px',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '24px', padding: '28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Clock size={28} color="#fbbf24" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', margin: '0 0 8px' }}>
                Enable Reliable Background Tracking
              </h3>
              <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                For accurate live location tracking, please disable battery optimization for this app in your device settings.
              </p>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: '12px', marginBottom: '20px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
              <strong style={{ color: '#fbbf24' }}>Recommended Setting:</strong><br />
              Settings → Battery → Battery Optimization → SchoolOS+ → <strong>Don't Optimize / Unrestricted</strong>
            </div>
            <button 
              onClick={() => {
                localStorage.setItem('sp_battery_opt_dismissed', 'true');
                setShowBatteryModal(false);
              }} 
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: '#10b981', border: 'none',
                color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              Got It, Continue
            </button>
          </div>
        </div>
      )}
    </ModuleGuard>
  );
}
