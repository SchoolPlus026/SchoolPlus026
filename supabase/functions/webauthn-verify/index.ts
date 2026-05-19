import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// PINNED to v11 — matching webauthn-start. v11+ uses `credential` not `authenticator`.
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@11";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CRITICAL: rpID MUST exactly match the Android App Links host in AndroidManifest.xml
const rpID = Deno.env.get("RP_ID") || "schoolpro-d95a8.web.app";

// All valid origins for this app.
// Android native Credential Manager sends: android:apk-key-hash:<base64url-sha256>
// Compute: echo -n "hex_of_sha256" | xxd -r -p | base64 | tr '+/' '-_' | tr -d '='
// SHA-256: AF:9B:00:A8:D9:C2:CC:11:EF:54:88:CC:B3:DC:39:02:EF:31:50:B9:CA:07:41:1E:3F:B1:D9:3F:92:A1:D3:D3
const ANDROID_APK_ORIGIN = "android:apk-key-hash:r5sAqNnCzBHvVIjMs9w5Au8xULnKB0EeP7HZP5Kh09M";

const ALLOWED_ORIGINS = [
  `https://${rpID}`,                 // Firebase Hosting web origin
  "https://schoolpro-d95a8.web.app", // Explicit (matches rpID)
  "http://localhost",                // Local dev
  "http://localhost:5173",           // Vite dev server
  "capacitor://localhost",           // Capacitor WebView
  ANDROID_APK_ORIGIN,               // Native Android Credential Manager
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, userId, sessionKey, response } = await req.json();
    const challengeKey = sessionKey || userId;

    if (!challengeKey) throw new Error("Missing challengeKey (userId or sessionKey)");
    if (!response) throw new Error("Missing response payload");

    // ── Fetch & consume the challenge ────────────────────────────────────────
    const { data: challenges, error: challengeError } = await supabase
      .from("webauthn_challenges")
      .select("id, challenge, type")
      .eq("owner_key", challengeKey)
      .eq("type", action)
      .order("created_at", { ascending: false })
      .limit(1);

    if (challengeError) {
      throw new Error(`Challenge DB error: ${challengeError.message}`);
    }
    if (!challenges || challenges.length === 0) {
      throw new Error(`No challenge found for owner_key="${challengeKey}" type="${action}"`);
    }

    const expectedChallenge = challenges[0].challenge;

    // Delete the used challenge immediately (prevents replay attacks)
    await supabase
      .from("webauthn_challenges")
      .delete()
      .eq("id", challenges[0].id);

    // ── REGISTRATION ─────────────────────────────────────────────────────────
    if (action === "registration") {
      console.log("[webauthn-verify] Verifying registration for userId:", userId);
      console.log("[webauthn-verify] Allowed origins:", ALLOWED_ORIGINS);

      let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
      try {
        verification = await verifyRegistrationResponse({
          response,
          expectedChallenge,
          expectedOrigin: ALLOWED_ORIGINS,
          expectedRPID: rpID,
          requireUserVerification: false,
        });
      } catch (verifyErr: unknown) {
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error("[webauthn-verify] verifyRegistrationResponse threw:", msg);
        throw new Error(`Registration verification failed: ${msg}`);
      }

      console.log("[webauthn-verify] verified:", verification.verified);

      if (!verification.verified || !verification.registrationInfo) {
        throw new Error("Registration not verified");
      }

      const { registrationInfo } = verification;

      // v11 API: credentialID is Base64URLString, credentialPublicKey is Uint8Array
      // Convert public key Uint8Array → base64url string for DB storage
      const base64UrlEncode = (bytes: Uint8Array): string =>
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "");

      // In @simplewebauthn/server v11, registrationInfo has:
      //   credential.id         (Base64URLString)
      //   credential.publicKey  (Uint8Array)
      //   credential.counter    (number)
      // Older naming (credentialID, credentialPublicKey, counter) may still exist as aliases.
      const credId = (registrationInfo as any).credential?.id ?? (registrationInfo as any).credentialID;
      const credPubKey = (registrationInfo as any).credential?.publicKey ?? (registrationInfo as any).credentialPublicKey;
      const counter = (registrationInfo as any).credential?.counter ?? (registrationInfo as any).counter ?? 0;

      if (!credId || !credPubKey) {
        throw new Error("registrationInfo is missing credentialID or credentialPublicKey");
      }

      const publicKeyB64 = typeof credPubKey === "string"
        ? credPubKey
        : base64UrlEncode(credPubKey as Uint8Array);

      const { error: insertError } = await supabase.from("user_passkeys").insert({
        user_id: userId,
        credential_id: credId,
        public_key: publicKeyB64,
        sign_count: counter,
        device_type: "platform",
      });

      if (insertError) throw new Error(`Failed to save passkey: ${insertError.message}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AUTHENTICATION ────────────────────────────────────────────────────────
    if (action === "authentication") {
      const credential_id = response?.id;
      if (!credential_id) {
        throw new Error("Response is missing credential id");
      }

      console.log("[webauthn-verify] Verifying authentication, credential_id:", credential_id);

      const { data: passkeys, error: passkeysError } = await supabase
        .from("user_passkeys")
        .select("*")
        .eq("credential_id", credential_id)
        .limit(1);

      if (passkeysError) throw new Error(`Passkey lookup failed: ${passkeysError.message}`);
      if (!passkeys || passkeys.length === 0) throw new Error("Passkey not found — please re-enroll");

      const passkey = passkeys[0];

      // v11 API: decode stored base64url strings back to Uint8Array
      const base64UrlDecode = (str: string): Uint8Array => {
        const base64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(
          str.length + (4 - (str.length % 4)) % 4,
          "="
        );
        return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      };

      let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
      try {
        verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge,
          expectedOrigin: ALLOWED_ORIGINS,
          expectedRPID: rpID,
          requireUserVerification: false,
          // v11 API uses `credential` (not `authenticator`)
          credential: {
            id: passkey.credential_id,          // Base64URLString
            publicKey: base64UrlDecode(passkey.public_key), // Uint8Array
            counter: passkey.sign_count,
          },
        });
      } catch (verifyErr: unknown) {
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error("[webauthn-verify] verifyAuthenticationResponse threw:", msg);
        throw new Error(`Authentication verification failed: ${msg}`);
      }

      if (!verification.verified) {
        throw new Error("Authentication not verified");
      }

      // Update sign count
      await supabase
        .from("user_passkeys")
        .update({
          sign_count: verification.authenticationInfo.newCounter,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", passkey.id);

      // Fetch user email for magic-link login
      const { data: userObj, error: userError } = await supabase.auth.admin.getUserById(passkey.user_id);
      if (userError || !userObj?.user?.email) {
        throw new Error("Could not fetch user email for authentication");
      }

      const userEmail = userObj.user.email;

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
      });

      if (linkError) throw new Error(`Magic link generation failed: ${linkError.message}`);

      return new Response(
        JSON.stringify({
          success: true,
          email: userEmail,
          token_hash: linkData.properties?.hashed_token || linkData.properties?.email_otp,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Invalid action: "${action}"`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webauthn-verify] ERROR:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
