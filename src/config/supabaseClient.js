import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Remember to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY 
// in your GitHub Actions Secrets later for the headless compilation to work!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Invokes a Supabase Edge Function safely.
 *
 * - If the function runs but returns a business-logic error (data.error),
 *   we throw that message directly so the UI shows the correct error.
 * - If the network/cloud call fails entirely (CORS, offline, etc.) AND we
 *   are on localhost, we attempt a local fallback to http://localhost:54321.
 * - If neither works, we throw with a meaningful message.
 */
export const safeInvokeEdgeFn = async (fnName, body = {}) => {
  try {
    // 1. Invoke the cloud Edge Function
    const { data, error } = await supabase.functions.invoke(fnName, { body });

    // If Supabase SDK itself throws a network/fetch error (FunctionsHttpError etc.)
    if (error) {
      // FunctionsHttpError means the function returned a non-2xx response.
      // In that case, the response body usually has { error: "..." }.
      // Try to extract the message from the error object.
      const msg = error?.message || error?.context?.json?.error || error?.context?.text || String(error);
      throw new Error(msg);
    }

    // Business-logic error returned inside the 200 response body
    if (data?.error) throw new Error(data.error);

    return data;

  } catch (cloudErr) {
    // ── Determine if this is a network-level failure (function unreachable)
    // vs. a function-level failure (function ran but threw an error).
    // Network-level errors are things like "Failed to fetch", "NetworkError", etc.
    // Function-level errors already have a meaningful message from above.

    const errorMsg = cloudErr?.message || '';
    const isNetworkError =
      errorMsg.includes('Failed to fetch') ||
      errorMsg.includes('NetworkError') ||
      errorMsg.includes('network') ||
      errorMsg.includes('ERR_CONNECTION') ||
      errorMsg.includes('ECONNREFUSED');

    // If it's NOT a network error, the function ran but returned an error.
    // Re-throw the meaningful error directly — don't show a local fallback message.
    if (!isNetworkError) {
      throw cloudErr;
    }

    console.warn(`Cloud Edge Function '${fnName}' unreachable, trying local fallback...`);

    // 2. Fallback to local Edge Function if on local network
    const hostname = window.location.hostname;
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname);

    if (isLocal) {
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

        const localData = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(localData?.error || `Local function returned HTTP ${response.status}`);
        }
        if (localData?.error) throw new Error(localData.error);

        return localData;
      } catch (localErr) {
        console.error('Local fallback also failed:', localErr);
        // Only show the "start local server" message if we are actually on localhost
        throw new Error(
          'Cannot reach the Edge Function. ' +
          'If you are testing locally, please run: supabase functions serve'
        );
      }
    }

    // Not local and cloud failed — generic network error
    throw new Error('Network error: Could not reach the server. Please check your internet connection.');
  }
};
