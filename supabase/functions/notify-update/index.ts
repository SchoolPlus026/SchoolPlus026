/**
 * notify-update/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by the CI/CD pipeline (build-apk.yml) immediately after a new APK
 * is uploaded to Supabase Storage and registered in app_versions.
 * Sends a high-priority FCM push notification to ALL enrolled device tokens
 * so users learn about the update without needing to open the app.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const FIREBASE_SERVER_KEY = Deno.env.get('FIREBASE_SERVER_KEY') ?? '';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  try {
    // ── Parse payload from CI/CD ──────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const version_name   = body.version_name   ?? 'New Version';
    const release_notes  = body.release_notes  ?? 'A new update is available.';

    // ── Fetch all enrolled device tokens ─────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: tokenRows, error } = await supabase
      .from('device_tokens')
      .select('token')
      .not('token', 'is', null);

    if (error) {
      console.error('[notify-update] DB query error:', error.message);
      return json({ error: error.message }, 500);
    }

    const tokens: string[] = (tokenRows ?? []).map((r: { token: string }) => r.token).filter(Boolean);

    if (tokens.length === 0) {
      return json({ message: 'No device tokens registered. No notifications sent.' });
    }

    console.info(`[notify-update] Sending to ${tokens.length} device(s) for ${version_name}`);

    if (!FIREBASE_SERVER_KEY) {
      return json({ error: 'FIREBASE_SERVER_KEY secret is not set on this project.' }, 500);
    }

    // ── Send FCM notification (Legacy HTTP API) ───────────────────────────────
    // Sends to all tokens in one request (max 1000 per FCM batch call)
    const fcmPayload = {
      registration_ids: tokens,
      notification: {
        title: 'Update Available',
        body: `SchoolOS+ ${version_name} is ready to install.`,
        sound: 'default',
        android_channel_id: 'updates',
      },
      data: {
        type: 'APP_UPDATE',
        version_name,
        release_notes,
      },
      priority: 'high',
      content_available: true,
    };

    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FIREBASE_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
    });

    const fcmData = await fcmRes.json();
    console.info('[notify-update] FCM response:', JSON.stringify(fcmData));

    return json({
      success: true,
      version: version_name,
      tokens_notified: tokens.length,
      fcm_success: fcmData.success,
      fcm_failure: fcmData.failure,
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
