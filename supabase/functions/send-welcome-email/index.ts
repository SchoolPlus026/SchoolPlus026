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
    const { email, name, username, password, role, schoolName } = await req.json();

    if (!email || !name || !username || !password || !role) {
      throw new Error('Missing required fields for welcome email.');
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

    // Translate role for human-friendly display
    const readableRole = role.charAt(0).toUpperCase() + role.slice(1);

    const welcomeTemplateIdRaw = Deno.env.get('BREVO_WELCOME_TEMPLATE_ID');
    const templateId = welcomeTemplateIdRaw ? parseInt(welcomeTemplateIdRaw, 10) : null;

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(
        templateId
          ? {
              templateId,
              to: [{ email: email, name: name }],
              params: {
                name,
                username,
                password,
                role: readableRole,
                schoolName: schoolName || 'your school',
                appFrontendUrl,
                // Uppercase versions as fallback
                NAME: name,
                USERNAME: username,
                PASSWORD: password,
                ROLE: readableRole,
                SCHOOL_NAME: schoolName || 'your school',
                APP_FRONTEND_URL: appFrontendUrl
              }
            }
          : {
              sender: { name: 'SchoolOS+ Platform', email: senderEmail },
              to: [{ email: email, name: name }],
              subject: `Welcome to School OS+ at ${schoolName || 'Your School'}`,
              htmlContent: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; borderRadius: 8px;">
                  <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">Welcome to School OS+!</h2>
                  <p>Dear <strong>${name}</strong>,</p>
                  <p>Your staff account has been created successfully at <strong>${schoolName || 'your school'}</strong>.</p>
                  
                  <div style="background-color: #f3f4f6; padding: 15px; borderRadius: 6px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1f2937;">Your Credentials:</h3>
                    <p style="margin: 5px 0;"><strong>Role:</strong> ${readableRole}</p>
                    <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
                    <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
                  </div>
                  
                  <p style="color: #ef4444; font-weight: bold;">Important Security Note:</p>
                  <p>Please log in to your account and change your temporary password immediately to ensure account privacy.</p>
                  
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${appFrontendUrl}/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; borderRadius: 6px; font-weight: bold;">Go to Login Portal</a>
                  </p>
                  
                  <p>If you have any issues logging in, please contact your school administrator.</p>
                  <br/>
                  <p>Best regards,<br/><strong>SchoolOS+ Team</strong></p>
                </div>
              `
            }
      )
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Brevo API returned error: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true, message: 'Welcome email sent.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[send-welcome-email] Error:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || err.toString() }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
