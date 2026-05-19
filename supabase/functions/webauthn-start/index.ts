import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// PINNED to v11 — v11+ changed verifyAuthenticationResponse to use `credential` not `authenticator`
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from "npm:@simplewebauthn/server@11";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CRITICAL: rpID MUST match the android:host in AndroidManifest App Links intent-filter
// AND the CapacitorPasskey.origin in capacitor.config.json
// AND the domain serving /.well-known/assetlinks.json
const rpName = "SchoolOS+";
const rpID = Deno.env.get("RP_ID") || "schoolpro-d95a8.web.app";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, userId, email } = await req.json();

    // ── REGISTRATION ──────────────────────────────────────────────────────────
    if (action === "register") {
      if (!userId) throw new Error("userId is required for registration");

      // v11 requires userID as Uint8Array
      const userIDBytes = new TextEncoder().encode(userId);

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: userIDBytes,
        userName: email || userId,
        attestationType: "none",
        authenticatorSelection: {
          // "discouraged" = device-bound credential (no Google account binding)
          // This means Android goes STRAIGHT to fingerprint without the
          // "Create a passkey / select account" email dialog.
          // During login, we identify the user by their registered credential_id.
          residentKey: "discouraged",
          userVerification: "preferred",
          authenticatorAttachment: "platform",
        },
      });

      // Store challenge for later verification
      const { error: dbError } = await supabase
        .from("webauthn_challenges")
        .insert({
          owner_key: userId,
          challenge: options.challenge,
          type: "registration",
        });

      if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AUTHENTICATION ────────────────────────────────────────────────────────
    if (action === "authenticate") {
      // userId MAY be provided if the login screen already knows the user.
      // When not provided, we fall back to a session key (anonymous auth).
      let allowCredentials: { id: string; transports: string[] }[] | undefined = undefined;

      if (userId) {
        const { data: passkeys } = await supabase
          .from("user_passkeys")
          .select("credential_id")
          .eq("user_id", userId);

        if (passkeys && passkeys.length > 0) {
          allowCredentials = passkeys.map((pk: { credential_id: string }) => ({
            id: pk.credential_id,
            transports: ["internal"],
          }));
        }
      }

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred",
      });

      // Use userId as the challenge owner key, or a fallback for anonymous flows
      const sessionKey = userId || `anon_${crypto.randomUUID()}`;

      const { error: dbError } = await supabase
        .from("webauthn_challenges")
        .insert({
          owner_key: sessionKey,
          challenge: options.challenge,
          type: "authentication",
        });

      if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

      return new Response(JSON.stringify({ options, sessionKey }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Invalid action: "${action}"`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webauthn-start] ERROR:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
