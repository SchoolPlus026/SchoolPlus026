import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { usePlan } from './usePlan';
import { isNightTime } from './useTieredCache';

export function useAllModuleActivities() {
  const { user, role, schoolSettings } = useAppStore();
  const { isFree } = usePlan();
  const night = isNightTime();

  return useQuery({
    queryKey: ['all-module-activities', user?.id, schoolSettings?.school_id, role],
    queryFn: async () => {
      if (!user?.id || !schoolSettings?.school_id || !role) {
        return {};
      }

      const { data, error } = await supabase.rpc('check_all_module_activities', {
        p_user_id: user.id,
        p_school_id: schoolSettings.school_id,
        p_role: role
      });

      if (error) {
        console.error('Error fetching all module activities:', error.message);
        return {};
      }

      return data || {};
    },
    enabled: !!user?.id && !!schoolSettings?.school_id && !!role,
    // Paid plan polls every 60s; Free plan or night-time does not poll in background
    refetchInterval: (isFree || night) ? false : 60000,
    staleTime: night ? 3600000 : 30000, // 1h stale time at night, 30s otherwise
  });
}

export function useMarkModuleViewed(moduleName) {
  const { user, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id || !schoolSettings?.school_id || !moduleName) return;

      const { data } = await supabase.from('user_module_views')
        .select('id')
        .eq('user_id', user.id)
        .eq('module_name', moduleName)
        .maybeSingle();

      if (data?.id) {
        await supabase.from('user_module_views')
          .update({ last_viewed_at: new Date().toISOString() })
          .eq('id', data.id);
      } else {
        await supabase.from('user_module_views').insert({
          school_id: schoolSettings.school_id,
          user_id: user.id,
          module_name: moduleName,
          last_viewed_at: new Date().toISOString()
        });
      }
    },
    onSuccess: () => {
      // Invalidate the consolidated query key so it refetches immediately and clears the badge
      queryClient.invalidateQueries({ queryKey: ['all-module-activities'] });
    }
  });
}
