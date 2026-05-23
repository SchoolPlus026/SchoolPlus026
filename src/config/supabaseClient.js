import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Remember to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY 
// in your GitHub Actions Secrets later for the headless compilation to work!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Invokes a Supabase Edge Function, falling back to a local serve URL (http://<hostname>:54321)
 * if the cloud function call fails during local network or offline development testing.
 */
export const safeInvokeEdgeFn = async (fnName, body = {}) => {
  try {
    // 1. Try invoking the cloud Edge Function
    const { data, error } = await supabase.functions.invoke(fnName, {
      body
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (cloudErr) {
    console.warn(`Cloud Edge Function ${fnName} invocation failed, trying local fallback:`, cloudErr);

    // 2. Fallback to local Edge Function if running on local network/localhost
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
      try {
        const localUrl = `http://${hostname}:54321/functions/v1/${fnName}`;
        const response = await fetch(localUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey
          },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error || `HTTP ${response.status}`);
        }
        const localData = await response.json();
        if (localData?.error) throw new Error(localData.error);
        return localData;
      } catch (localErr) {
        console.error('Local fallback failed:', localErr);
        throw new Error('Failed to send a request to the Edge Function. Please ensure your local Supabase Edge Functions are running (supabase functions serve) and accessible on your network.');
      }
    }
    throw new Error(cloudErr.message || 'Failed to send a request to the Edge Function.');
  }
};
