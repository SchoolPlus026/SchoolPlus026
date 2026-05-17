/**
 * webauthn-verify/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — WebAuthn Ceremony Verifier
 *
 * Purpose:
 *   Handles BOTH Registration Finish and Authentication Finish ceremonies.
 *   Verifies the client's signed response against the stored challenge and
 *   the stored public key. On success:
 *     - Registration: saves the new credential to user_passkeys
 *     - Authentication: updates sign_count + last_used_at, returns a
 *       short-lived OTP magic link which the client uses to create a
 *       Supabase session (bridging WebAuthn → Supabase Auth session)
 *
 * Called by: Frontend
 *   POST body for Registration:  { type: "registration", userId, credential, friendlyName }
 *   POST body for Authentication: { type: "authentication", userId, credential }
 *
 * Security:
 *   - Challenge is verified and immediately deleted (single-use)
 *   - sign_count monotonicity is checked to detect cloned authenticators
 *   - Uses service_role internally; no user JWT needed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RP_ID     = Deno.env.get("WEBAUTHN_RP_ID")     ?? "schoolpro-d95a8.web.app";
const RP_ORIGIN = Deno.env.get("WEBAUTHN_RP_ORIGIN") ?? "https://schoolpro-d95a8.web.app";

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
    const { type, userId, credential, friendlyName } = body;

    if (!type || !userId || !credential) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, userId, credential" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // ── Fetch the stored challenge for this user ──────────────────────────────
    const { data: challengeRow, error: challengeError } = await supabaseAdmin
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("owner_key", userId)
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError || !challengeRow) {
      return new Response(
        JSON.stringify({ error: "No pending challenge found. Please start the ceremony again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // ── Verify challenge has not expired ──────────────────────────────────────
    if (new Date(challengeRow.expires_at) < new Date()) {
      // Purge it and reject
      await supabaseAdmin.from("webauthn_challenges").delete().eq("id", challengeRow.id);
      return new Response(
        JSON.stringify({ error: "Challenge expired. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const expectedChallenge = challengeRow.challenge;

    // ── IMMEDIATELY delete the challenge (single-use — prevents replay attacks) ─
    await supabaseAdmin.from("webauthn_challenges").delete().eq("id", challengeRow.id);

    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRATION VERIFY
    // ─────────────────────────────────────────────────────────────────────────
    if (type === "registration") {
      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
          requireUserVerification: true,
        });
      } catch (verifyErr) {
        console.error("[webauthn-verify] Registration verification failed:", verifyErr);
        return new Response(
          JSON.stringify({ error: "Biometric verification failed. Please try again." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (!verification.verified || !verification.registrationInfo) {
        return new Response(
          JSON.stringify({ error: "Registration not verified by authenticator." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { credential: regCredential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;

      // ── Save new passkey to database ────────────────────────────────────────
      const { error: insertError } = await supabaseAdmin.from("user_passkeys").insert({
        user_id:       userId,
        credential_id: regCredential.id,
        public_key:    Buffer.from(regCredential.publicKey).toString("base64url"),
        sign_count:    regCredential.counter,
        device_type:   credentialDeviceType,
        backed_up:     credentialBackedUp,
        transports:    credential.response?.transports ?? [],
        friendly_name: friendlyName ?? "My Device",
        last_used_at:  new Date().toISOString(),
      });

      if (insertError) {
        console.error("[webauthn-verify] Failed to save passkey:", insertError.message);
        return new Response(
          JSON.stringify({ error: "Failed to save biometric credential. Please try again." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Biometric login enabled successfully!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUTHENTICATION VERIFY
    // ─────────────────────────────────────────────────────────────────────────
    if (type === "authentication") {
      // Fetch stored credential record from DB
      const credentialId = credential.id;

      const { data: storedPasskey, error: pkError } = await supabaseAdmin
        .from("user_passkeys")
        .select("*")
        .eq("user_id", userId)
        .eq("credential_id", credentialId)
        .single();

      if (pkError || !storedPasskey) {
        return new Response(
          JSON.stringify({ error: "Credential not recognized. Please use a registered device." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // Decode stored public key from base64url → Uint8Array for simplewebauthn
      const publicKeyBytes = Uint8Array.from(
        atob(storedPasskey.public_key.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0)
      );

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
          requireUserVerification: true,
          credential: {
            id: storedPasskey.credential_id,
            publicKey: publicKeyBytes,
            counter: storedPasskey.sign_count,
            transports: storedPasskey.transports ?? [],
          },
        });
      } catch (verifyErr) {
        console.error("[webauthn-verify] Authentication verification failed:", verifyErr);
        return new Response(
          JSON.stringify({ error: "Biometric verification failed. Please use your password." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (!verification.verified) {
        return new Response(
          JSON.stringify({ error: "Authentication assertion not verified." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // ── Update sign_count and last_used_at (replay attack mitigation) ────────
      await supabaseAdmin
        .from("user_passkeys")
        .update({
          sign_count:   verification.authenticationInfo.newCounter,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", storedPasskey.id);

      // ── Issue a Supabase session for the authenticated user ──────────────────
      // Strategy: generate a one-time magic link OTP via service_role.
      // The client exchanges this token for a real Supabase session.
      const { data: otpData, error: otpError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: (await supabaseAdmin.auth.admin.getUserById(userId)).data.user?.email ?? "",
        options: { redirectTo: undefined },
      });

      if (otpError || !otpData?.properties?.hashed_token) {
        console.error("[webauthn-verify] Failed to generate session link:", otpError?.message);
        return new Response(
          JSON.stringify({ error: "Authentication succeeded but session creation failed. Please use password login." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      // Return the hashed token — client calls supabase.auth.verifyOtp() with it
      return new Response(
        JSON.stringify({
          success: true,
          token_hash:  otpData.properties.hashed_token,
          email:       otpData.user?.email,
          userId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown type: "${type}". Must be "registration" or "authentication".` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (err) {
    console.error("[webauthn-verify] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
