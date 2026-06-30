/**
 * mint-firebase-token/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — Firebase Auth Token Minter
 * Trigger CI/CD deploy for Google OAuth configuration alignment.
 *
 * Purpose: Bridge Supabase Auth → Firebase Auth for the Bus Safe Drop module.
 *   Parent/Teacher apps call this once when opening the Live Tracking screen.
 *   This function verifies the Supabase JWT, extracts school_id, and mints a
 *   Firebase Custom Token embedding school_id + role as custom claims.
 *   The client then calls signInWithCustomToken(fbAuth, token) to authenticate
 *   with Firebase RTDB, which is gated by Firebase Security Rules on school_id.
 *
 * Invoked by: Parent/Teacher client app (HTTP POST with Bearer token)
 *
 * Secrets required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   FCM_SERVICE_ACCOUNT_KEY  — Full JSON of the Firebase service account key
 *   FCM_PROJECT_ID           — Firebase project ID
 *   SUPABASE_URL             — Auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Auto-injected by Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Sign a Firebase Custom Token (RS256 JWT) ─────────────────────────────────
// Firebase Custom Tokens are JWTs signed with the service account private key,
// targeted at: https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit
async function mintFirebaseCustomToken(
  serviceAccountKey: Record<string, string>,
  uid: string,
  claims: Record<string, unknown>
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    sub: serviceAccountKey.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600, // 1 hour expiry
    uid,
    claims,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const pemBody = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    derBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return `${signingInput}.${signature}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Authenticate the caller via Supabase JWT ───────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseUrl       = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");

    if (!serviceAccountRaw) {
      console.error("[MintToken] FCM_SERVICE_ACCOUNT_KEY secret is missing.");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: missing FCM_SERVICE_ACCOUNT_KEY" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Create a user-scoped client to verify the caller's JWT
    const supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      console.error("[MintToken] Auth verification failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid Supabase session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // ── 2. Fetch role + school_id from the users table (source of truth) ──────
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("role, school_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[MintToken] Profile fetch failed:", profileError?.message);
      return new Response(
        JSON.stringify({ error: "Could not resolve user profile" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Only drivers, parents, teachers, admins can access live tracking
    const ALLOWED_ROLES = ["driver", "teacher", "admin", "student", "staff"];
    if (!ALLOWED_ROLES.includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Role not permitted to access live tracking" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // ── 3. Mint the Firebase Custom Token ────────────────────────────────────
    const serviceAccountKey = JSON.parse(serviceAccountRaw);

    const firebaseToken = await mintFirebaseCustomToken(
      serviceAccountKey,
      user.id, // Firebase UID = Supabase user ID for clean cross-referencing
      {
        school_id: profile.school_id,
        role: profile.role,
      }
    );

    console.info(`[MintToken] Minted Firebase token for user ${user.id} (role: ${profile.role}, school: ${profile.school_id})`);

    return new Response(
      JSON.stringify({
        firebase_token: firebaseToken,
        school_id: profile.school_id,
        role: profile.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    console.error("[MintToken] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
