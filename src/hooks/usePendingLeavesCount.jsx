import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { useTieredCache } from './useTieredCache';

export function usePendingLeavesCount() {
  const { user, role, schoolSettings } = useAppStore();
  const cacheConfig = useTieredCache({
    freeStaleTime: 10 * 60 * 1000,
    premiumStaleTime: 30 * 1000,
    premiumRefetchInterval: 60000
  });

  return useQuery({
    queryKey: ['pending_leaves_count', role, user?.id, schoolSettings?.school_id],
    queryFn: async () => {
      if (!schoolSettings?.school_id) return 0;
      
      if (role === 'admin') {
        const { count, error } = await supabase
          .from('leaves')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', schoolSettings.school_id)
          .eq('status', 'pending');
          
        if (error) throw error;
        return count || 0;
      } 
      
      if (role === 'teacher') {
         // Need to find all students in this teacher's class
         const { data: teacherData } = await supabase
            .from('users')
            .select('class')
            .eq('id', user.id)
            .single();
            
         if (!teacherData || !teacherData.class) return 0;
         
         const { data: students } = await supabase
            .from('users')
            .select('id')
            .eq('role', 'student')
            .eq('class', teacherData.class)
            .eq('school_id', schoolSettings.school_id);
            
         if (!students || students.length === 0) return 0;
         
         const studentIds = students.map(s => s.id);
         
         const { count, error } = await supabase
            .from('leaves')
            .select('*', { count: 'exact', head: true })
            .eq('school_id', schoolSettings.school_id)
            .eq('status', 'pending')
            .in('user_id', studentIds);
            
         if (error) throw error;
         return count || 0;
      }
      
      return 0;
    },
    enabled: !!user?.id && !!schoolSettings?.school_id && (role === 'admin' || role === 'teacher'),
    ...cacheConfig
  });
}
