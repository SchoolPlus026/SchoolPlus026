import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name, username, schoolName } = await req.json();

    if (!email || !name || !username) {
      throw new Error('Missing required fields for username recovery.');
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || 'schoolosplus@gmail.com';
    const appFrontendUrl = Deno.env.get('APP_FRONTEND_URL') || 'https://www.schoolosplus.in';

    if (!brevoApiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'BREVO_API_KEY is not configured in Supabase Secrets. Email not sent.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'SchoolOS+ Platform', email: senderEmail },
        to: [{ email: email, name: name }],
        subject: `School OS+ Username Recovery`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; borderRadius: 8px;">
            <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">Username Recovery Request</h2>
            <p>Dear <strong>${name}</strong>,</p>
            <p>We received a request to recover your username for <strong>${schoolName || 'your school'}</strong>.</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; borderRadius: 6px; margin: 20px 0; text-align: center;">
              <p style="margin: 5px 0; font-size: 16px;">Your username is: <strong style="color: #4f46e5; font-size: 18px;">${username}</strong></p>
            </div>
            
            <p style="text-align: center; margin: 30px 0;">
              <a href="${appFrontendUrl}/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; borderRadius: 6px; font-weight: bold;">Go to Login Portal</a>
            </p>
            
            <p>If you did not request this recovery, you can safely ignore this email.</p>
            <br/>
            <p>Best regards,<br/><strong>SchoolOS+ Team</strong></p>
          </div>
        `
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Brevo API returned error: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true, message: 'Recovery email sent.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[send-username-email] Error:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || err.toString() }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
