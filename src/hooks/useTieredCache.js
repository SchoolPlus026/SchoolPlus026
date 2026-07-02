import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePlan } from './usePlan';

export function isNightTime(customSettings) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Rely completely on platform settings configuration
  const settings = customSettings || useAppStore.getState().platformSettings;
  if (!settings || settings.night_mode_enabled === false) return false;

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
    return parts[0] * 60 + parts[1];
  };

  const startMin = parseTimeToMinutes(settings.night_start_time || '23:30');
  const endMin = parseTimeToMinutes(settings.night_end_time || '05:30');

  if (startMin > endMin) {
    return currentMinutes >= startMin || currentMinutes < endMin;
  } else {
    return currentMinutes >= startMin && currentMinutes < endMin;
  }
}

export function isSchoolOperationalHour() {
  const now = new Date();
  
  // Sundays are never operational
  if (now.getDay() === 0) return false;

  const schoolSettings = useAppStore.getState().schoolSettings;
  if (!schoolSettings) return true; // fallback to true if not loaded yet

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  };

  const startTimeMin = parseTimeToMinutes(schoolSettings.start_time) ?? (8 * 60); // default 8:00 AM
  const endTimeMin = parseTimeToMinutes(schoolSettings.end_time) ?? (14 * 60);   // default 2:00 PM

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Buffer: starts 1.5 hours (90 minutes) before start_time, and ends 1.5 hours (90 minutes) after end_time
  const bufferStart = startTimeMin - 90;
  const bufferEnd = endTimeMin + 90;

  return currentMinutes >= bufferStart && currentMinutes <= bufferEnd;
}

export function useTieredCache(defaults = {}) {
  const { isFree } = usePlan();
  const { role, schoolSettings, platformSettings } = useAppStore();
  const nightTime = isNightTime(platformSettings);

  // 1. Strict Night Mode: 11:30 PM to 5:30 AM
  if (nightTime) {
    return {
      staleTime: defaults.nightStaleTime ?? 60 * 60 * 1000, // 1 hour cache at night
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    };
  }

  // 2. Client-side Egress Restriction: Student and Parent roles never poll background views
  const userRole = (role || '').toLowerCase();
  const isStudentOrParent = userRole === 'student' || userRole === 'parent';
  if (isStudentOrParent) {
    return {
      staleTime: defaults.studentStaleTime ?? 10 * 60 * 1000, // 10 minutes cache
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    };
  }

  // 3. Sundays: Operational modules are 100% OFF (no background polling)
  const isSunday = new Date().getDay() === 0;
  if (isSunday) {
    return {
      staleTime: defaults.sundayStaleTime ?? 30 * 60 * 1000, // 30 minutes cache on Sunday
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    };
  }

  // 4. Resolve Active Engine
  const activeEngine = schoolSettings?.optimization_engine_override || platformSettings?.optimization_engine || 'standard';

  // 5. Strict Minimum Engine: Polling is completely OFF
  if (activeEngine === 'strict_minimum') {
    return {
      staleTime: defaults.freeStaleTime ?? 10 * 60 * 1000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
    };
  }

  // 6. Time-Based Throttling Engine: Polling is OFF outside school hours (plus 1.5h buffers)
  if (activeEngine === 'time_based') {
    const operational = isSchoolOperationalHour();
    if (!operational) {
      return {
        staleTime: defaults.offHoursStaleTime ?? 30 * 60 * 1000, // 30 mins cache outside school hours
        refetchInterval: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: true,
      };
    }
  }

  // 7. Fallback to Standard Tiered Polling
  // Free plan has NO background polling. Paid/Trial tiers get 60s updates.
  return {
    staleTime: isFree 
      ? (defaults.freeStaleTime ?? 10 * 60 * 1000)   // 10 min default for free
      : (defaults.premiumStaleTime ?? 30 * 1000),      // 30s default for premium
    refetchInterval: isFree 
      ? false                                           // NO polling for free
      : (defaults.premiumRefetchInterval ?? 60000),     // 60s default for premium
    refetchOnWindowFocus: !isFree,                      // Only premium refetches on focus
    refetchOnReconnect: !isFree,
    refetchOnMount: true,
  };
}
