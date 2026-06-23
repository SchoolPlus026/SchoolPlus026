/**
 * send-notice-notification/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — Phase 2: Automatic Push Notifications
 *
 * Triggered by: Supabase Database Webhook on INSERT into public.notices
 * Webhook payload shape (Supabase sends the full Postgres record):
 *   { type: "INSERT", table: "notices", record: { id, school_id, title,
 *     content, date, scope, photo_url, created_at }, ... }
 *
 * Flow:
 *   1. Parse the new notice record from the webhook payload.
 *   2. Query user_device_tokens for all users in the same school,
 *      filtered by the notice `scope` (all | students | teachers).
 *   3. Get a short-lived FCM OAuth2 access token by signing a JWT
 *      with the FCM_SERVICE_ACCOUNT_KEY secret.
 *   4. Fan-out FCM HTTP v1 API sends (one per token).
 *   5. Remove stale tokens that FCM reports as invalid/unregistered.
 *
 * Secrets required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   FCM_PROJECT_ID          — Firebase project ID (string, e.g. "schoolos-abc12")
 *   FCM_SERVICE_ACCOUNT_KEY — Full JSON of the Firebase service account key file
 *   SUPABASE_URL            — Auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Auto-injected by Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 * Updated: 2026-04-26 (Triggering GitHub Action deployment)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── CORS headers (required for Supabase webhook caller) ─────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── FCM HTTP v1 API endpoint ─────────────────────────────────────────────────
const FCM_BASE_URL = "https://fcm.googleapis.com/v1/projects";

// ─── Get a short-lived OAuth2 Bearer token for FCM ───────────────────────────
// FCM HTTP v1 uses service-account OAuth, NOT the legacy server key.
// We create and sign a JWT manually since Deno doesn't have google-auth-library.
async function getFCMAccessToken(serviceAccountKey: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header and payload (base64url encoded)
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  // Parse the PEM private key → DER binary
  const pemBody = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  // Import the key for RS256 signing
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    derBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the JWT
  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for an access token
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResp.json();

  if (!tokenResp.ok || !tokenData.access_token) {
    console.error("[FCM] Failed to get access token:", tokenData);
    throw new Error("Failed to obtain FCM access token: " + JSON.stringify(tokenData));
  }

  return tokenData.access_token;
}

// ─── Send a single FCM message via HTTP v1 API ───────────────────────────────
interface FCMResult {
  token: string;
  success: boolean;
  errorCode?: string;
}

async function sendFCMMessage(
  projectId: string,
  token: string,
  title: string,
  body: string,
  accessToken: string,
  extraData?: Record<string, string>
): Promise<FCMResult> {
  const resp = await fetch(`${FCM_BASE_URL}/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: title.substring(0, 100),   // FCM title limit
          body: body.substring(0, 200),     // FCM body limit
        },
        android: {
          priority: "high",
          notification: {
            click_action: "FLUTTER_NOTIFICATION_CLICK", // standard deep link intent
            sound: "default",
          },
        },
        // Pass structured data for future deep-linking
        data: {
          type: "notice",
          ...extraData,
        },
      },
    }),
  });

  const result = await resp.json();

  if (!resp.ok) {
    // FCM error codes we care about for cleanup
    const errorCode = result?.error?.details?.[0]?.errorCode ?? result?.error?.status ?? "UNKNOWN";
    console.warn(`[FCM] Token failed (${errorCode}):`, token.substring(0, 20) + "…");
    return { token, success: false, errorCode };
  }

  return { token, success: true };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Parse webhook payload ──────────────────────────────────────────────
    const body = await req.json();

    // Supabase Database Webhooks send: { type, table, schema, record, old_record }
    const notice = body?.record;

    if (!notice?.id) {
      console.warn("[FCM] No record in webhook payload — possibly a test ping.");
      return new Response(
        JSON.stringify({ ok: true, message: "No record — test ping acknowledged." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.info(`[FCM] Processing notice: "${notice.title}" (school: ${notice.school_id}, scope: ${notice.scope})`);

    // ── 2. Validate required env secrets ─────────────────────────────────────
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    const serviceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!projectId || !serviceAccountRaw || !supabaseUrl || !serviceRoleKey) {
      const missing = [
        !projectId && "FCM_PROJECT_ID",
        !serviceAccountRaw && "FCM_SERVICE_ACCOUNT_KEY",
        !supabaseUrl && "SUPABASE_URL",
        !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
      ].filter(Boolean);
      console.error("[FCM] Missing secrets:", missing.join(", "));
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: missing secrets", missing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const serviceAccountKey = JSON.parse(serviceAccountRaw);

    // ── 3. Build Supabase client (service role bypasses RLS) ─────────────────
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 4. Fetch device tokens filtered by school + scope ────────────────────
    // The notices.scope column can be: 'all' | 'students' | 'teachers'
    // We JOIN user_device_tokens → users to filter by role when scope != 'all'.
    let tokensQuery;

    if (notice.scope === "all") {
      // Send to EVERY device token in this school
      tokensQuery = supabase
        .from("user_device_tokens")
        .select("id, fcm_token")
        .eq("school_id", notice.school_id);
    } else {
      // scope is 'students' or 'teachers' — filter by user role
      // We query via a join: user_device_tokens.user_id → users.id
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id")
        .eq("school_id", notice.school_id)
        .eq("role", notice.scope === "students" ? "student" : "teacher");

      if (usersError) throw usersError;

      const userIds = (users ?? []).map((u: { id: string }) => u.id);

      if (userIds.length === 0) {
        console.info("[FCM] No users found for scope:", notice.scope);
        return new Response(
          JSON.stringify({ ok: true, sent: 0, reason: "no_users_for_scope" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      tokensQuery = supabase
        .from("user_device_tokens")
        .select("id, fcm_token")
        .in("user_id", userIds);
    }

    const { data: tokenRows, error: tokenError } = await tokensQuery;

    if (tokenError) throw tokenError;

    if (!tokenRows || tokenRows.length === 0) {
      console.info("[FCM] No device tokens found for this school/scope.");
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no_tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.info(`[FCM] Found ${tokenRows.length} token(s) to notify.`);

    // ── 5. Get FCM access token (one OAuth call for all messages) ─────────────
    const accessToken = await getFCMAccessToken(serviceAccountKey);

    // ── 6. Fan-out: send to all tokens in parallel ────────────────────────────
    const noticeTitle = `📢 ${notice.title}`;
    const noticeBody  = notice.content ?? "";
    const extraData   = {
      notice_id:  notice.id,
      school_id:  notice.school_id ?? "",
      notice_date: notice.date ?? "",
    };

    const results: FCMResult[] = await Promise.all(
      tokenRows.map((row: { id: string; fcm_token: string }) =>
        sendFCMMessage(projectId, row.fcm_token, noticeTitle, noticeBody, accessToken, extraData)
      )
    );

    // ── 7. Clean up stale / unregistered tokens ───────────────────────────────
    // FCM returns UNREGISTERED or NOT_FOUND for tokens that are no longer valid
    // (app uninstalled, token rotated, etc.). Remove them to keep the table clean.
    const STALE_ERROR_CODES = new Set([
      "UNREGISTERED",
      "INVALID_ARGUMENT",
      "NOT_FOUND",
    ]);

    const staleTokenRows = results
      .filter((r) => !r.success && r.errorCode && STALE_ERROR_CODES.has(r.errorCode))
      .map((r) => r.token);

    if (staleTokenRows.length > 0) {
      console.info(`[FCM] Removing ${staleTokenRows.length} stale token(s).`);
      const { error: deleteError } = await supabase
        .from("user_device_tokens")
        .delete()
        .in("fcm_token", staleTokenRows);

      if (deleteError) {
        // Non-fatal — log and continue
        console.warn("[FCM] Failed to delete stale tokens:", deleteError.message);
      }
    }

    // ── 8. Return summary ─────────────────────────────────────────────────────
    const sent    = results.filter((r) => r.success).length;
    const failed  = results.filter((r) => !r.success).length;

    console.info(`[FCM] Done. Sent: ${sent}, Failed: ${failed}, Cleaned: ${staleTokenRows.length}`);

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        failed,
        stale_removed: staleTokenRows.length,
        total: tokenRows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    console.error("[FCM] Unhandled error in Edge Function:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
