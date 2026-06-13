import { supabase } from '../config/supabaseClient';

/**
 * FCM Push Notification Utility (Placeholder)
 * 
 * TODO: In a production Firebase environment using standard backend protocols, 
 * this function will format the payload and execute a server-side Edge Function call 
 * to the Firebase HTTP v1 API.
 * 
 * This natively triggers a physical push notification to iOS/Android devices subscribed to the topic.
 */

export const triggerFCMNotification = async (noticeTitle, scope, schoolId) => {
  try {
    const { error } = await supabase.from('app_notifications_queue').insert({
      school_id: schoolId,
      target_role: scope === 'all' ? 'all' : (scope === 'teachers' ? 'teacher' : 'student'),
      title: 'New Notice Board Post',
      body: noticeTitle,
      route: '/notices',
      is_ephemeral: false, // Notices must replicate to the bell table
      status: 'pending'
    });
    if (error) throw error;
    console.log(`[FCM] Notice notification queued successfully for scope: ${scope}`);
    return true;
  } catch (err) {
    console.error('[FCM] Failed to queue notice notification:', err.message);
    return false;
  }
};
