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

    if (error) {
      // FunctionsHttpError — try to extract the REAL error message from the response body.
      // The Supabase JS SDK exposes the raw response on error.context.
      let humanMessage = null;

      // Try reading JSON body from the error context (this is where backend { error: "..." } lives)
      try {
        const ctx = error?.context;
        if (ctx && typeof ctx.json === 'function') {
          const json = await ctx.json();
          humanMessage = json?.error || json?.message || null;
        } else if (ctx?.error) {
          humanMessage = ctx.error;
        }
      } catch (_) { /* ignore parse failures */ }

      // Fallback: use the SDK error message — but strip the generic non-2xx prefix
      if (!humanMessage) {
        const raw = error?.message || String(error);
        // Remove SDK boilerplate so only the real reason shows
        humanMessage = raw
          .replace(/Edge Function returned a non-2xx status code\.?\s*/i, '')
          .replace(/FunctionsHttpError:?\s*/i, '')
          .trim() || 'An error occurred. Please try again.';
      }

      throw new Error(humanMessage);
    }

    // Business-logic error returned inside the 200 response body
    if (data?.error) throw new Error(data.error);

    return data;

  } catch (cloudErr) {
    const errorMsg = cloudErr?.message || '';

    const isNetworkError =
      errorMsg.includes('Failed to fetch') ||
      errorMsg.includes('NetworkError') ||
      errorMsg.includes('network') ||
      errorMsg.includes('ERR_CONNECTION') ||
      errorMsg.includes('ECONNREFUSED');

    // If it's NOT a network error, the function ran but returned a meaningful error — re-throw as-is.
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
          headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
          body: JSON.stringify(body)
        });
        const localData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(localData?.error || `Server error (HTTP ${response.status})`);
        if (localData?.error) throw new Error(localData.error);
        return localData;
      } catch (localErr) {
        console.error('Local fallback also failed:', localErr);
        throw new Error('Cannot reach the server. If testing locally, run: supabase functions serve');
      }
    }

    throw new Error('Network error: Could not reach the server. Please check your internet connection.');
  }
};
