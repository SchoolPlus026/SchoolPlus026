import { supabase } from '../config/supabaseClient';

/**
 * Logs a critical action to the global audit_logs table.
 * 
 * @param {string} actionType - E.g. 'DELETE_USER', 'SUBMIT_TICKET'
 * @param {string} schoolId - The ID of the school where the action occurred
 * @param {object} targetData - Additional metadata (e.g. { userId, email })
 */
export const logAuditAction = async (actionType, schoolId, targetData = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Must be authenticated

    await supabase.from('audit_logs').insert([{
      action_type: actionType,
      performed_by: user.id,
      school_id: schoolId,
      target_data: targetData
    }]);
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
};
