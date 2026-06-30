import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// PINNED to v11 — v11+ changed verifyAuthenticationResponse to use `credential` not `authenticator`
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from "npm:@simplewebauthn/server@11";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rpName = "SchoolOS+";
// CRITICAL: rpID must match android:host in AndroidManifest, capacitor.config.json CapacitorPasskey.origin,
// and the domain that serves /.well-known/assetlinks.json
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

    const { action, userId, email, username } = await req.json();

    // ── REGISTRATION ──────────────────────────────────────────────────────────
    if (action === "register") {
      if (!userId) throw new Error("userId is required for registration");

      const userIDBytes = new TextEncoder().encode(userId);

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: userIDBytes,
        userName: email || userId,
        attestationType: "none",
        authenticatorSelection: {
          // "preferred" = stores credential in Google Password Manager (survives reboots/device switches).
          // Android shows a "Create a passkey" bottom sheet once during enrollment so the user can
          // confirm which account it's bound to — this is the standard, expected FIDO2 UX.
          // After enrollment the LOGIN flow goes directly to the fingerprint scanner.
          residentKey: "preferred",
          userVerification: "preferred",
          authenticatorAttachment: "platform",
        },
      });

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
      // STRATEGY:
      // 1. If userId is given directly → use it.
      // 2. If only username/email is given → look it up in public.users (server has service-role).
      // 3. If neither is given → discoverable credential flow (Android selects from password manager).
      //
      // Providing allowCredentials (via userId) is REQUIRED when the credential was registered with
      // residentKey="discouraged" (old enrollments). It also speeds up Android's credential lookup
      // even for "preferred" (discoverable) credentials.

      let resolvedUserId = userId || null;

      // Resolve userId from username/email if not directly provided
      if (!resolvedUserId && username) {
        const trimmed = username.trim();

        if (trimmed.includes("@")) {
          // Email lookup in public.users
          const { data: userRow } = await supabase
            .from("users")
            .select("id")
            .eq("email", trimmed)
            .maybeSingle();
          resolvedUserId = userRow?.id || null;
        }


        if (!resolvedUserId) {
          // Try username lookup in public.users
          const { data: userRow } = await supabase
            .from("users")
            .select("id")
            .eq("username", trimmed)
            .maybeSingle();
          resolvedUserId = userRow?.id || null;
        }

        console.log(`[webauthn-start] Resolved userId for username "${username}":`, resolvedUserId);
      }

      // Build allowCredentials if we know the user
      let allowCredentials: { id: string; transports: string[] }[] | undefined = undefined;

      if (resolvedUserId) {
        const { data: passkeys, error: pkErr } = await supabase
          .from("user_passkeys")
          .select("credential_id")
          .eq("user_id", resolvedUserId);

        if (pkErr) console.error("[webauthn-start] passkey lookup error:", pkErr.message);

        if (passkeys && passkeys.length > 0) {
          allowCredentials = passkeys.map((pk: { credential_id: string }) => ({
            id: pk.credential_id,
            transports: ["internal"],
          }));
          console.log(`[webauthn-start] Built allowCredentials with ${allowCredentials.length} credential(s)`);
        } else {
          console.warn("[webauthn-start] No passkeys found for resolvedUserId:", resolvedUserId);
        }
      } else {
        console.log("[webauthn-start] No userId resolved — using discoverable credential flow");
      }

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred",
      });

      // session key ties the challenge to the right user for verification
      const sessionKey = resolvedUserId || `anon_${crypto.randomUUID()}`;

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
