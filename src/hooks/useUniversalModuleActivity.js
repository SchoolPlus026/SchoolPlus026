import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';

export function useUniversalModuleActivity(moduleName) {
  const { user, role, schoolSettings } = useAppStore();
  const queryClient = useQueryClient();

  const { data: activityData = { hasActivity: false, pendingCount: 0, unseenCount: 0 }, isLoading } = useQuery({
    queryKey: ['module-activity', moduleName, user?.id, schoolSettings?.school_id],
    queryFn: async () => {
      if (!user?.id || !schoolSettings?.school_id || !moduleName) {
        return { hasActivity: false, pendingCount: 0, unseenCount: 0 };
      }

      // 1. Fetch last_viewed_at
      const { data: viewData } = await supabase
        .from('user_module_views')
        .select('last_viewed_at')
        .eq('user_id', user.id)
        .eq('module_name', moduleName)
        .maybeSingle();
      
      const lastViewedAt = viewData?.last_viewed_at || '1970-01-01T00:00:00Z';
      
      let pendingCount = 0;
      let unseenCount = 0;

      // 2. Module specific logic
      switch (moduleName) {
        case 'leaves':
          if (role === 'admin') {
            const { count } = await supabase.from('leaves').select('*', { count: 'exact', head: true })
              .eq('school_id', schoolSettings.school_id)
              .eq('status', 'pending');
            pendingCount = count || 0;
          } else if (role === 'teacher') {
            if (user.class) {
              const { data: students } = await supabase.from('users').select('id').eq('role', 'student').eq('class', user.class).eq('school_id', schoolSettings.school_id);
              if (students && students.length > 0) {
                const { count } = await supabase.from('leaves').select('*', { count: 'exact', head: true })
                  .eq('status', 'pending')
                  .in('user_id', students.map(s => s.id));
                pendingCount = count || 0;
              }
            }
          }
          if (role === 'student' || role === 'teacher' || role === 'staff') {
            // Unseen leaves activity for the applicant
            const { count } = await supabase.from('leaves').select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gt('created_at', lastViewedAt); // Ideally we'd use updated_at for status changes, assuming created_at for now if updated_at isn't available. Wait, status mutation triggers a push notification, so unseen items might not rely on updated_at if not present. Let's just track new created items.
            unseenCount = count || 0;
          }
          break;

        case 'complaint_box':
          if (role === 'admin') {
            const { count } = await supabase.from('complaint_box').select('*', { count: 'exact', head: true })
              .eq('school_id', schoolSettings.school_id)
              .eq('status', 'pending');
            pendingCount = count || 0;
          } else if (role === 'teacher') {
            const { count } = await supabase.from('complaint_box').select('*', { count: 'exact', head: true })
              .eq('recipient_id', user.id)
              .eq('status', 'pending');
            pendingCount = count || 0;
            
            const { count: uncount } = await supabase.from('complaint_box').select('*', { count: 'exact', head: true })
              .eq('sender_id', user.id)
              .eq('status', 'replied')
              .gt('replied_at', lastViewedAt);
            unseenCount = uncount || 0;
          } else if (role === 'student') {
            const { count } = await supabase.from('complaint_box').select('*', { count: 'exact', head: true })
              .eq('sender_id', user.id)
              .eq('status', 'replied')
              .gt('replied_at', lastViewedAt);
            unseenCount = count || 0;
          }
          break;

        case 'fees':
          // Currently, fees do not have a specific 'pending verification' workflow. 
          // Red dot should not trigger just because a transaction exists.
          pendingCount = 0;
          unseenCount = 0;
          break;

        case 'notices':
          const { count: ncount } = await supabase.from('notices').select('*', { count: 'exact', head: true })
            .eq('school_id', schoolSettings.school_id)
            .gt('created_at', lastViewedAt);
          unseenCount = ncount || 0;
          break;

        case 'achievers':
          if (role === 'student') {
            const { count: acount } = await supabase.from('student_achievements').select('*', { count: 'exact', head: true })
              .eq('student_id', user.id)
              .eq('is_active', true)
              .gt('awarded_at', lastViewedAt);
            unseenCount = acount || 0;
          } else {
            const { count: acount2 } = await supabase.from('student_achievements').select('*', { count: 'exact', head: true })
              .eq('school_id', schoolSettings.school_id)
              .eq('is_active', true)
              .gt('awarded_at', lastViewedAt);
            unseenCount = acount2 || 0;
          }
          break;
          
        case 'lost_found':
          // 1. Unseen newly reported items for the school
          const { count: lfcount } = await supabase.from('lost_and_found').select('*', { count: 'exact', head: true })
            .eq('school_id', schoolSettings.school_id)
            .is('claimed_by', null)
            .gt('created_at', lastViewedAt);
          unseenCount = lfcount || 0;
          
          // 2. Actionable: Someone claimed an item reported by ME
          const { count: claimCount } = await supabase.from('lost_and_found').select('*', { count: 'exact', head: true })
            .eq('reported_by', user.id)
            .eq('status', 'claimed');
          pendingCount = claimCount || 0;
          break;
          
        default:
          break;
      }

      return {
        hasActivity: pendingCount > 0 || unseenCount > 0,
        pendingCount,
        unseenCount
      };
    },
    enabled: !!user?.id && !!schoolSettings?.school_id && !!moduleName,
    refetchInterval: 30000 // 30s
  });

  const markViewedMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !schoolSettings?.school_id) return;
      
      const { data } = await supabase.from('user_module_views')
        .select('id')
        .eq('user_id', user.id)
        .eq('module_name', moduleName)
        .maybeSingle();

      if (data?.id) {
        await supabase.from('user_module_views').update({ last_viewed_at: new Date().toISOString() }).eq('id', data.id);
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
      queryClient.invalidateQueries({ queryKey: ['module-activity', moduleName] });
    }
  });

  return {
    ...activityData,
    isLoading,
    markViewed: () => markViewedMutation.mutate()
  };
}
