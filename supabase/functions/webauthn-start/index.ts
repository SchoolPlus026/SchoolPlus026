/**
 * webauthn-start/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — WebAuthn Ceremony Initiator
 *
 * Purpose:
 *   Handles BOTH the Registration and Authentication ceremony start.
 *   Generates a cryptographic challenge (server-side), stores it in the
 *   webauthn_challenges table with a 5-minute TTL, and returns the
 *   ceremony options to the client.
 *
 * Called by: Frontend (no JWT required for this step — challenge is public)
 *   POST body for Registration:  { type: "registration", userId: string, username: string }
 *   POST body for Authentication: { type: "authentication", userId: string }
 *
 * Returns:
 *   Registration:   WebAuthn PublicKeyCredentialCreationOptions
 *   Authentication: WebAuthn PublicKeyCredentialRequestOptions
 *
 * Security note: --no-verify-jwt is used because the registration start
 *   happens before the user has a session (they prove identity via biometric).
 *   The challenge is unpredictable and short-lived — this is safe per WebAuthn spec.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from "npm:@simplewebauthn/server@10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Your app's domain — used as the Relying Party ID.
// Must match exactly what the client uses (protocol-less).
const RP_ID   = Deno.env.get("WEBAUTHN_RP_ID")   ?? "schoolpro-d95a8.web.app";
const RP_NAME = Deno.env.get("WEBAUTHN_RP_NAME")  ?? "SchoolOS+";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { type, userId, username } = body;

    if (!type || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, userId" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // ── Inline cleanup: purge stale challenges for this user to prevent bloat ──
    await supabaseAdmin
      .from("webauthn_challenges")
      .delete()
      .eq("owner_key", userId)
      .lt("expires_at", new Date().toISOString());

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRATION START
    // ─────────────────────────────────────────────────────────────────────────
    if (type === "registration") {
      // Fetch already-registered credentials to exclude them (prevent re-registration)
      const { data: existingPasskeys } = await supabaseAdmin
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId);

      const excludeCredentials = (existingPasskeys ?? []).map((pk) => ({
        id: pk.credential_id,
        transports: pk.transports ?? [],
      }));

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: new TextEncoder().encode(userId),
        userName: username ?? userId,
        // Prevent duplicate registrations on the same device
        excludeCredentials,
        authenticatorSelection: {
          // 'platform' = device-native biometrics (Touch ID, Face ID, fingerprint)
          authenticatorAttachment: "platform",
          // Require biometric verification (not just PIN)
          userVerification: "required",
          // 'preferred' allows synced passkeys (Google/Apple) when available
          residentKey: "preferred",
        },
        // Timeout: 60 seconds for the user to complete the biometric gesture
        timeout: 60000,
      });

      // Store challenge (TTL 5 min)
      const { error: challengeError } = await supabaseAdmin
        .from("webauthn_challenges")
        .insert({
          owner_key: userId,
          challenge: options.challenge,
          type: "registration",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });

      if (challengeError) {
        console.error("[webauthn-start] Failed to store challenge:", challengeError.message);
        throw new Error("Failed to initiate registration. Please try again.");
      }

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUTHENTICATION START
    // ─────────────────────────────────────────────────────────────────────────
    if (type === "authentication") {
      // Fetch the user's registered credentials to build allowCredentials list
      const { data: passkeys, error: pkError } = await supabaseAdmin
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId);

      if (pkError || !passkeys || passkeys.length === 0) {
        return new Response(
          JSON.stringify({ error: "No biometric credentials registered for this account." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      const allowCredentials = passkeys.map((pk) => ({
        id: pk.credential_id,
        transports: pk.transports ?? [],
      }));

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials,
        userVerification: "required",
        timeout: 60000,
      });

      // Store challenge
      const { error: challengeError } = await supabaseAdmin
        .from("webauthn_challenges")
        .insert({
          owner_key: userId,
          challenge: options.challenge,
          type: "authentication",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });

      if (challengeError) {
        console.error("[webauthn-start] Failed to store auth challenge:", challengeError.message);
        throw new Error("Failed to initiate authentication. Please try again.");
      }

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown type: "${type}". Must be "registration" or "authentication".` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (err) {
    console.error("[webauthn-start] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
