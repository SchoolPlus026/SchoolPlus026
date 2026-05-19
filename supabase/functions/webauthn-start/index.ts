import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateRegistrationOptions, generateAuthenticationOptions } from "npm:@simplewebauthn/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rpName = "SchoolOS+";
// CRITICAL: rpID MUST exactly match the Android App Links host in AndroidManifest.xml
// and the 'origin' value in capacitor.config.json → CapacitorPasskey.
// Error [50152] = RP ID cannot be validated = mismatch between this value and the
// domain Android Credential Manager has verified via assetlinks.json.
const rpID = Deno.env.get("RP_ID") || "schoolpro-d95a8.web.app";
const originEnv = Deno.env.get("EXPECTED_ORIGIN") || `https://${rpID}`;
const origin = originEnv.split(','); // Convert comma-separated string to array 

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

    if (action === "register") {
      // Generate registration options
      const user = {
        id: userId,
        username: email || userId,
      };

      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: new TextEncoder().encode(userId),
        userName: user.username,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
          authenticatorAttachment: "platform"
        }
      });

      // Save challenge to db
      // Use normalized type 'registration' to match what webauthn-verify queries for
      const { error } = await supabase.from("webauthn_challenges").insert({
        owner_key: userId,
        challenge: options.challenge,
        type: "registration"
      });

      if (error) throw error;

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else if (action === "authenticate") {
      // Generate authentication options
      let allowCredentials = undefined;

      // If userId is provided, we can scope it. Otherwise, rely on resident keys (Passkeys)
      if (userId) {
        const { data: passkeys, error: passkeysError } = await supabase
          .from("user_passkeys")
          .select("credential_id")
          .eq("user_id", userId);

        if (!passkeysError && passkeys) {
          allowCredentials = passkeys.map((pk) => ({
            id: pk.credential_id,
            transports: ["internal"],
          }));
        }
      }

      // Generate options
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred"
      });

      // Save challenge. Use a generic owner_key if userId is missing (like 'anonymous')
      // Wait, verify will need to find the challenge. We can pass the challenge back to the client
      // or the client can send back the challenge id? WebAuthn doesn't return the challenge.
      // So we must store it with a session or generic identifier, but for an API we usually just
      // store the challenge by its value or let the client pass a session ID.
      // Let's use a temporary string that the client passes as 'sessionId' or 'owner_key'
      const sessionKey = userId || req.headers.get("x-client-info") || "anonymous_auth";

      const { error } = await supabase.from("webauthn_challenges").insert({
        owner_key: sessionKey,
        challenge: options.challenge,
        type: "authentication"
      });

      if (error) throw error;

      return new Response(JSON.stringify({ options, sessionKey }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    throw new Error("Invalid action");
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


