import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRegistrationResponse, verifyAuthenticationResponse } from "npm:@simplewebauthn/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rpID = "app.schoolos.plus"; 
const origin = `https://${rpID}`; // Will match assetlinks / Android app links
// Android app links usually have origin like android:apk-key-hash:... but Capacitor passkey 
// plugin handles origins depending on configuration. We'll pass the actual expected origin
// or bypass origin check if necessary for Android by accepting multiple origins.
// Wait, the Capacitor Passkey plugin uses the app's associated domain as the origin.
// For Android, it relies on Digital Asset Links. So origin will be the https URL.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, userId, sessionKey, response } = await req.json();
    const challengeKey = sessionKey || userId;

    // Get challenge
    const { data: challenges, error: challengeError } = await supabase
      .from("webauthn_challenges")
      .select("challenge, type")
      .eq("owner_key", challengeKey)
      .eq("type", action)
      .order("created_at", { ascending: false })
      .limit(1);

    if (challengeError || !challenges || challenges.length === 0) {
      throw new Error("Challenge not found or expired");
    }

    const expectedChallenge = challenges[0].challenge;

    // Delete challenge
    await supabase.from("webauthn_challenges").delete().eq("owner_key", challengeKey);

    if (action === "registration") {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: [origin, `http://localhost`, `capacitor://localhost`, `http://localhost:5173`],
        expectedRPID: rpID,
        requireUserVerification: false
      });

      if (verification.verified && verification.registrationInfo) {
        const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

        const base64UrlEncode = (buffer: Uint8Array) => {
          return btoa(String.fromCharCode.apply(null, [...buffer]))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        };

        const { error: insertError } = await supabase.from("user_passkeys").insert({
          user_id: userId,
          credential_id: base64UrlEncode(credentialID),
          public_key: base64UrlEncode(credentialPublicKey),
          sign_count: counter,
          device_type: "platform"
        });

        if (insertError) throw insertError;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } else if (action === "authentication") {
      // Decode base64url back to Uint8Array for verification
      const base64UrlDecode = (str: string) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const binary_string = atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
      };

      // Get the passkey based on credential ID
      const credential_id = response.id;
      
      const { data: passkeys, error: passkeysError } = await supabase
        .from("user_passkeys")
        .select("*")
        .eq("credential_id", credential_id);

      if (passkeysError || !passkeys || passkeys.length === 0) {
        throw new Error("Passkey not found");
      }

      const passkey = passkeys[0];

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: [origin, `http://localhost`, `capacitor://localhost`, `http://localhost:5173`],
        expectedRPID: rpID,
        authenticator: {
          credentialID: base64UrlDecode(passkey.credential_id),
          credentialPublicKey: base64UrlDecode(passkey.public_key),
          counter: passkey.sign_count,
        },
        requireUserVerification: false
      });

      if (verification.verified) {
        const { authenticationInfo } = verification;

        // Update counter
        await supabase.from("user_passkeys")
          .update({ sign_count: authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
          .eq("id", passkey.id);

        // Fetch user email via Admin API
        const { data: userObj, error: userError } = await supabase.auth.admin.getUserById(passkey.user_id);
        if (userError || !userObj.user?.email) {
          throw new Error("Linked user has no email address.");
        }
        
        const userEmail = userObj.user.email;

        // Generate magic link using admin API to log the user in
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: userEmail
        });

        if (linkError) throw linkError;

        return new Response(JSON.stringify({ 
          success: true, 
          email: userEmail,
          token_hash: linkData.properties?.hashed_token || linkData.properties?.email_otp
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    throw new Error("Verification failed");
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
