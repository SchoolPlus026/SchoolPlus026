import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePlan } from './usePlan';

export function isNightTime() {
  const settings = useAppStore.getState().platformSettings;
  if (!settings || settings.night_mode_enabled === false) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Convert time strings (e.g., "23:00" and "05:30") to minutes from midnight
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
    return parts[0] * 60 + parts[1];
  };

  const startMin = parseTimeToMinutes(settings.night_start_time || '23:00');
  const endMin = parseTimeToMinutes(settings.night_end_time || '05:30');

  if (startMin > endMin) {
    // Overnight window: e.g., 23:00 to 05:30
    return currentMinutes >= startMin || currentMinutes < endMin;
  } else {
    // Standard window: e.g., 01:00 to 05:00
    return currentMinutes >= startMin && currentMinutes < endMin;
  }
}

export function useTieredCache(defaults = {}) {
  const { isFree } = usePlan();
  const nightTime = isNightTime();

  if (nightTime) {
    // Night-Time Shutdown Mode: Disable polling, long staleTime to block network calls
    return {
      staleTime: defaults.nightStaleTime ?? 60 * 60 * 1000, // 1 hour cache at night
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    };
  }

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
