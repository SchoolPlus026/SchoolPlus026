/**
 * notify-update/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by the CI/CD pipeline (build-apk.yml) immediately after a new APK
 * is uploaded to Supabase Storage and registered in app_versions.
 * Sends a high-priority FCM push notification to ALL enrolled device tokens
 * so users learn about the update without needing to open the app.
 *
 * Secrets required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   FCM_PROJECT_ID          — Firebase project ID (e.g. "schoolpro-d95a8")
 *   FCM_SERVICE_ACCOUNT_KEY — Full JSON of the Firebase service account key file
 *   SUPABASE_URL            — Auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Auto-injected by Supabase
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const FCM_BASE_URL = 'https://fcm.googleapis.com/v1/projects';

// ── Get a short-lived OAuth2 Bearer token for FCM HTTP v1 API ────────────────
// Uses FCM_SERVICE_ACCOUNT_KEY (same approach as send-notice-notification)
async function getFCMAccessToken(serviceAccountKey: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const pemBody = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    derBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${signature}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResp.json();

  if (!tokenResp.ok || !tokenData.access_token) {
    console.error('[notify-update] Failed to get FCM access token:', tokenData);
    throw new Error('Failed to obtain FCM access token: ' + JSON.stringify(tokenData));
  }

  return tokenData.access_token;
}

// ── Send a single FCM message via HTTP v1 API ────────────────────────────────
async function sendFCMMessage(
  projectId: string,
  token: string,
  versionName: string,
  releaseNotes: string,
  accessToken: string
): Promise<{ token: string; success: boolean; errorCode?: string }> {
  const resp = await fetch(`${FCM_BASE_URL}/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: '🚀 Update Available',
          body: `SchoolOS+ ${versionName} is ready to install.`,
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            android_channel_id: 'updates',
          },
        },
        data: {
          type: 'APP_UPDATE',
          version_name: versionName,
          release_notes: releaseNotes.substring(0, 200),
        },
      },
    }),
  });

  const result = await resp.json();

  if (!resp.ok) {
    const errorCode = result?.error?.details?.[0]?.errorCode ?? result?.error?.status ?? 'UNKNOWN';
    console.warn(`[notify-update] Token failed (${errorCode}):`, token.substring(0, 20) + '…');
    return { token, success: false, errorCode };
  }

  return { token, success: true };
}

Deno.serve(async (req) => {
  try {
    // ── 1. Parse payload from CI/CD ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const version_name  = body.version_name  ?? 'New Version';
    const release_notes = body.release_notes ?? 'A new update is available. Please update to get the latest improvements.';

    // ── 2. Validate required secrets ─────────────────────────────────────────
    const projectId        = Deno.env.get('FCM_PROJECT_ID');
    const serviceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_KEY');
    const supabaseUrl      = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!projectId || !serviceAccountRaw) {
      const missing = [!projectId && 'FCM_PROJECT_ID', !serviceAccountRaw && 'FCM_SERVICE_ACCOUNT_KEY'].filter(Boolean);
      console.error('[notify-update] Missing secrets:', missing.join(', '));
      return json({ error: 'Server misconfiguration: missing secrets', missing }, 500);
    }

    // ── 3. Fetch ALL device tokens from the correct table ────────────────────
    // Table: public.user_device_tokens  Column: fcm_token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: tokenRows, error } = await supabase
      .from('user_device_tokens')    // ← FIXED: was 'device_tokens'
      .select('fcm_token')           // ← FIXED: was 'token'
      .eq('platform', 'android')
      .not('fcm_token', 'is', null);

    if (error) {
      console.error('[notify-update] DB query error:', error.message);
      return json({ error: error.message }, 500);
    }

    const tokens: string[] = (tokenRows ?? [])
      .map((r: { fcm_token: string }) => r.fcm_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      console.info('[notify-update] No device tokens found. Skipping FCM send.');
      return json({ message: 'No device tokens registered. No notifications sent.' });
    }

    console.info(`[notify-update] Sending update notification to ${tokens.length} device(s) for ${version_name}`);

    // ── 4. Get FCM OAuth2 access token ───────────────────────────────────────
    const serviceAccountKey = JSON.parse(serviceAccountRaw);
    const accessToken = await getFCMAccessToken(serviceAccountKey);

    // ── 5. Fan-out in parallel ────────────────────────────────────────────────
    const results = await Promise.all(
      tokens.map((token) => sendFCMMessage(projectId, token, version_name, release_notes, accessToken))
    );

    // ── 6. Clean up stale tokens ─────────────────────────────────────────────
    const STALE_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND']);
    const staleTokens = results
      .filter((r) => !r.success && r.errorCode && STALE_CODES.has(r.errorCode))
      .map((r) => r.token);

    if (staleTokens.length > 0) {
      console.info(`[notify-update] Removing ${staleTokens.length} stale token(s).`);
      await supabase.from('user_device_tokens').delete().in('fcm_token', staleTokens);
    }

    const sent   = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.info(`[notify-update] Done. Sent: ${sent}, Failed: ${failed}`);

    return json({
      success: true,
      version: version_name,
      tokens_notified: tokens.length,
      fcm_sent: sent,
      fcm_failed: failed,
      stale_removed: staleTokens.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-update] Unhandled error:', msg);
    return json({ error: msg }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
