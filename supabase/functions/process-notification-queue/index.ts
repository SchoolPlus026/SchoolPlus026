import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FCM_BASE_URL = "https://fcm.googleapis.com/v1/projects";

async function getFCMAccessToken(serviceAccountKey: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const pemBody = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", derBuffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );

  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${signature}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.access_token) {
    throw new Error("Failed to obtain FCM access token");
  }
  return tokenData.access_token;
}

interface FCMResult {
  token: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

async function sendFCMMessage(
  projectId: string, token: string, title: string, body: string, route: string, accessToken: string
): Promise<FCMResult> {
  const resp = await fetch(`${FCM_BASE_URL}/${projectId}/messages:send`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: title.substring(0, 100), body: body.substring(0, 200) },
        android: { priority: "high", notification: { click_action: "FLUTTER_NOTIFICATION_CLICK", sound: "default" } },
        data: { route: route || "/", type: "master_notification" },
      },
    }),
  });
  const result = await resp.json();
  if (!resp.ok) {
    const errorCode = result?.error?.details?.[0]?.errorCode ?? result?.error?.status ?? "UNKNOWN";
    return { token, success: false, errorCode, errorMessage: JSON.stringify(result.error) };
  }
  return { token, success: true };
}

async function sendFCMMulticast(
  projectId: string, tokens: string[], title: string, body: string, route: string, accessToken: string
): Promise<FCMResult[]> {
  return await Promise.all(
    tokens.map((token) =>
      sendFCMMessage(projectId, token, title, body, route || "", accessToken)
    )
  );
}

serve(async (req) => {
  const startTime = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    const serviceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!projectId || !serviceAccountRaw || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing env variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const serviceAccountKey = JSON.parse(serviceAccountRaw);
    let accessToken;
    try {
      accessToken = await getFCMAccessToken(serviceAccountKey);
    } catch (tokenErr) {
      throw new Error("Could not authenticate with FCM: " + tokenErr.message);
    }

    // Fetch and claim up to 100 pending notifications atomically using the claim_pending_notifications RPC
    const { data: pendingRecords, error: fetchErr } = await supabase
      .rpc("claim_pending_notifications", { p_limit: 100 });

    if (fetchErr) throw fetchErr;

    if (!pendingRecords || pendingRecords.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No pending notifications" }), { headers: corsHeaders });
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const record of pendingRecords) {
      try {
        let tokensQuery;

        if (record.user_id) {
          tokensQuery = supabase.from("user_device_tokens").select("id, fcm_token").eq("user_id", record.user_id);
        } else if (record.target_role === 'all') {
          if (record.school_id) {
            tokensQuery = supabase.from("user_device_tokens").select("id, fcm_token").eq("school_id", record.school_id);
          } else {
            tokensQuery = supabase.from("user_device_tokens").select("id, fcm_token");
          }
        } else {
          const usersQuery = supabase.from("users").select("id").eq("role", record.target_role);
          if (record.school_id) usersQuery.eq("school_id", record.school_id);
          
          const { data: users, error: usersError } = await usersQuery;
          if (usersError) throw usersError;
          
          const userIds = (users ?? []).map((u: any) => u.id);
          if (userIds.length === 0) {
            await supabase.from("app_notifications_queue").update({ status: 'sent', error_log: 'No users found' }).eq("id", record.id);
            continue;
          }
          tokensQuery = supabase.from("user_device_tokens").select("id, fcm_token").in("user_id", userIds);
        }

        const { data: tokenRows, error: tokenError } = await tokensQuery;
        if (tokenError) throw tokenError;

        if (!tokenRows || tokenRows.length === 0) {
          await supabase.from("app_notifications_queue").update({ status: 'sent', error_log: 'No tokens found' }).eq("id", record.id);
          continue;
        }

        const tokens = tokenRows.map((row: any) => row.fcm_token);
        const batches: string[][] = [];
        for (let i = 0; i < tokens.length; i += 500) {
          batches.push(tokens.slice(i, i + 500));
        }

        const results: FCMResult[] = [];
        for (const batch of batches) {
          const batchResults = await sendFCMMulticast(projectId, batch, record.title, record.body, record.route || "", accessToken);
          results.push(...batchResults);
        }

        const STALE_ERROR_CODES = new Set(["UNREGISTERED", "INVALID_ARGUMENT", "NOT_FOUND"]);
        const staleTokens = results.filter(r => !r.success && r.errorCode && STALE_ERROR_CODES.has(r.errorCode)).map(r => r.token);

        if (staleTokens.length > 0) {
          await supabase.from("user_device_tokens").delete().in("fcm_token", staleTokens);
        }

        const failed = results.filter(r => !r.success);
        const status = failed.length === results.length ? 'failed' : 'sent';
        const error_log = failed.length > 0 ? JSON.stringify(failed.map(f => f.errorMessage)) : null;

        await supabase.from("app_notifications_queue").update({ status, error_log }).eq("id", record.id);
        
        totalSent += (results.length - failed.length);
        totalFailed += failed.length;

      } catch (innerErr: any) {
        // Mark this specific record as failed
        await supabase.from("app_notifications_queue").update({ status: 'failed', error_log: innerErr.message }).eq("id", record.id);
        totalFailed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: pendingRecords.length, sent: totalSent, failed: totalFailed }), { headers: corsHeaders });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  } finally {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const duration = Date.now() - startTime;
        await supabaseAdmin.from("edge_function_usage").insert({
          function_name: "process-notification-queue",
          execution_time_ms: duration
        });
      } catch (logErr: any) {
        console.error("Logging failed inside finally block:", logErr.message);
      }
    }
  }
});
