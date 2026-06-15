import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../config/supabaseClient';

export function useThrottledRefresh() {
  const queryClient = useQueryClient();
  const { schoolSettings, platformSettings, lastRefreshedAt, setLastRefreshedAt } = useAppStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [cooldownLeft, setCooldownLeft] = React.useState(0);

  const isFree = schoolSettings?.subscription_tier === 'Free' || schoolSettings?.plan_type === 'free' || !schoolSettings?.subscription_tier;
  const cooldownSec = isFree
    ? (platformSettings?.free_tier_refresh_cooldown ?? 30)
    : (platformSettings?.premium_tier_refresh_cooldown ?? 10);

  React.useEffect(() => {
    if (!lastRefreshedAt) return;
    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - lastRefreshedAt) / 1000);
      const remaining = cooldownSec - elapsedSec;
      if (remaining <= 0) {
        setCooldownLeft(0);
        clearInterval(interval);
      } else {
        setCooldownLeft(remaining);
      }
    }, 1000);

    // Initial check
    const elapsedSec = Math.floor((Date.now() - lastRefreshedAt) / 1000);
    const remaining = cooldownSec - elapsedSec;
    if (remaining > 0) {
      setCooldownLeft(remaining);
    } else {
      setCooldownLeft(0);
    }

    return () => clearInterval(interval);
  }, [lastRefreshedAt, cooldownSec]);

  const handleRefresh = async () => {
    if (cooldownLeft > 0 || refreshing) return;
    
    setRefreshing(true);
    setLastRefreshedAt(Date.now());

    try {
      const store = useAppStore.getState();
      if (store.user) {
        // Fetch platform settings
        const { data: platSettings } = await supabase
          .from('platform_settings')
          .select('free_tier_refresh_cooldown, premium_tier_refresh_cooldown, night_mode_enabled, night_start_time, night_end_time, free_tier_cache_hours, premium_tier_cache_hours')
          .single();
        if (platSettings) {
          store.setPlatformSettings(platSettings);
          store.setPlatformSettingsLastFetched(Date.now());
        }

        // Fetch school settings
        if (store.schoolSettings?.school_id) {
          const { data: settings } = await supabase
            .from('school_settings')
            .select('*')
            .eq('school_id', store.schoolSettings.school_id)
            .single();
          if (settings) {
            store.setSchoolSettings(settings);
            store.setProfileLastFetched(Date.now());
          }
        }
      }
    } catch (err) {
      console.warn('Failed to refresh dynamic settings:', err.message);
    }

    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 600);
  };

  return {
    refreshing,
    cooldownLeft,
    handleRefresh
  };
}
