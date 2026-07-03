import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const id = body.school_id || body.registration_id;
    const { action, rejection_reason, override_school_code, override_plan_type, verification_config } = body;

    if (!id || !action) throw new Error('school_id/registration_id and action are required');
    if (!['approve', 'reject', 'request_verification'].includes(action)) {
      throw new Error('action must be approve, reject, or request_verification');
    }

    // Service role client — bypasses RLS entirely
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch the registration
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('school_registrations')
      .select('*')
      .eq('id', id)
      .single();

    if (regErr || !reg) throw new Error('Registration not found');
    
    // Allow reviewing if currently pending OR if currently verification_requested
    if (reg.status !== 'pending' && reg.status !== 'verification_requested') {
      throw new Error(`Registration is already ${reg.status}`);
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || 'schoolosplus@gmail.com';
    let appFrontendUrl = Deno.env.get('APP_FRONTEND_URL') || 'https://schoolosplus.in';
    if (appFrontendUrl.includes('schoolpro-d95a8.web.app')) {
      appFrontendUrl = 'https://schoolosplus.in';
    }

    // ── 1. REQUEST VERIFICATION (GRANULAR) ────────────────────────────────────
    if (action === 'request_verification') {
      const reason = rejection_reason?.trim() || 'Please edit the requested fields and/or upload verification photos.';
      const config = verification_config || { fields: [], photos: [] };
      
      const { error: updateRegErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status:           'verification_requested',
          rejection_reason: reason,
          verification_config: config,
        })
        .eq('id', id);
      if (updateRegErr) throw new Error(`Failed to update registration: ${updateRegErr.message}`);

      if (reg.school_id) {
        const { error: schoolErr } = await supabaseAdmin
          .from('school_settings')
          .update({ 
            subscription_status: 'VerificationRequested',
            verification_reason: reason,
            verification_config: config,
          })
          .eq('school_id', reg.school_id);
        if (schoolErr) throw new Error(`Failed to update school settings: ${schoolErr.message}`);
      }

      // Format granular requested items for email display
      let requestedItemsHtml = '';
      if (config.fields && config.fields.length > 0) {
        requestedItemsHtml += `<p style="margin: 5px 0;"><strong>Fields to Edit:</strong></p><ul style="margin: 5px 0 15px 20px; padding: 0;">`;
        config.fields.forEach((f: string) => {
          const readable = f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          requestedItemsHtml += `<li>${readable}</li>`;
        });
        requestedItemsHtml += `</ul>`;
      }
      if (config.photos && config.photos.length > 0) {
        requestedItemsHtml += `<p style="margin: 5px 0;"><strong>Verification Photos to Upload:</strong></p><ul style="margin: 5px 0 15px 20px; padding: 0;">`;
        config.photos.forEach((p: string) => {
          const readable = p === 'selfie' ? 'School Admin Selfie (Camera required)' : 'Event Photo / Premise Photo';
          requestedItemsHtml += `<li>${readable}</li>`;
        });
        requestedItemsHtml += `</ul>`;
      }

      // Send Request Verification Email
      if (brevoApiKey) {
        try {
          const resubmitLink = `${appFrontendUrl}/register-verify?id=${reg.id}`;
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': brevoApiKey,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              sender: { name: 'SchoolOS+ Platform', email: senderEmail },
              to: [{ email: reg.admin_email, name: reg.admin_name }],
              subject: `Action Required: Verify School Registration - ${reg.school_name}`,
              htmlContent: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                  <h2 style="color: #d97706; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">Verification Action Required</h2>
                  <p>Dear <strong>${reg.admin_name}</strong>,</p>
                  <p>The Platform Administrator has requested additional verification details or corrections for your registration for <strong>${reg.school_name}</strong>.</p>
                  
                  <div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 15px; border-radius: 4px; margin: 20px 0; color: #92400e;">
                    <strong>Instructions / Reason:</strong><br/>
                    ${reason}
                  </div>

                  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1f2937; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">Requested Items:</h3>
                    ${requestedItemsHtml || '<p>Edit registration details.</p>'}
                  </div>

                  <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1f2937;">Your Account Credentials:</h3>
                    <p style="margin: 5px 0;"><strong>School Code:</strong> ${reg.school_code}</p>
                    <p style="margin: 5px 0;"><strong>Username:</strong> ${reg.admin_username}</p>
                    <p style="margin: 5px 0;"><strong>Password:</strong> ${reg.admin_password || '[Your configured password]'}</p>
                  </div>

                  <p>Please click the button below to open your secure, unique resubmission portal and provide the requested details.</p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${resubmitLink}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">Open Resubmission Portal</a>
                  </p>
                  <p style="font-size: 11px; color: #6b7280; word-break: break-all;">Or copy and paste this link in your browser:<br/>${resubmitLink}</p>
                  <p>Best regards,<br/><strong>SchoolOS+ Team</strong></p>
                </div>
              `
            })
          });
        } catch (e) {
          console.error('Error sending verification request email:', e);
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Verification requested.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. REJECT ─────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const reason = rejection_reason?.trim() || 'No reason provided';

      const { error: updateRegErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status:           'rejected',
          admin_password:   null, // Clear password on final rejection
          rejection_reason: reason,
        })
        .eq('id', id);
      if (updateRegErr) throw new Error(`Failed to update registration: ${updateRegErr.message}`);

      if (reg.school_id) {
        await supabaseAdmin
          .from('school_settings')
          .update({ subscription_status: 'Rejected' })
          .eq('school_id', reg.school_id);
      }

      // Send Rejection Email
      if (brevoApiKey) {
        try {
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': brevoApiKey,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              sender: { name: 'SchoolOS+ Platform', email: senderEmail },
              to: [{ email: reg.admin_email, name: reg.admin_name }],
              subject: `Registration Declined: ${reg.school_name}`,
              htmlContent: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                  <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Registration Declined</h2>
                  <p>Dear <strong>${reg.admin_name}</strong>,</p>
                  <p>We regret to inform you that your registration for <strong>${reg.school_name}</strong> has been declined by the Platform Administrator.</p>
                  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin: 20px 0; color: #991b1b;">
                    <strong>Reason for rejection:</strong><br/>
                    ${reason}
                  </div>
                  <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1f2937;">Registration Information:</h3>
                    <p style="margin: 5px 0;"><strong>School Code:</strong> ${reg.school_code}</p>
                    <p style="margin: 5px 0;"><strong>Username:</strong> ${reg.admin_username}</p>
                  </div>
                  <p>If you have any questions or would like to appeal this decision, please contact support.</p>
                  <p>Best regards,<br/><strong>SchoolOS+ Team</strong></p>
                </div>
              `
            })
          });
        } catch (e) {
          console.error('Error triggering Brevo rejection email:', e);
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Registration rejected.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. APPROVE ────────────────────────────────────────────────────────────
    if (action === 'approve') {
      if (!reg.school_id) throw new Error('Registration has no linked school_id. Cannot approve.');

      const finalCode = override_school_code || reg.school_code;
      const finalPlan = override_plan_type || reg.plan_type || 'trial';

      // Activate the school by updating subscription_status from 'Pending' to 'Paid'
      const { error: schoolErr } = await supabaseAdmin
        .from('school_settings')
        .update({
          subscription_status: 'Paid',
          school_code:         finalCode,
          plan_type:           finalPlan,
          subscription_tier:   finalPlan === 'premium' ? 'Premium' : finalPlan === 'trial' ? 'Trial' : 'Free',
          trial_start_date:    finalPlan === 'trial' ? new Date().toISOString() : undefined,
          verification_reason: null // Clear reason on success
        })
        .eq('school_id', reg.school_id);
      if (schoolErr) throw new Error(`Failed to activate school: ${schoolErr.message}`);

      // Send Approval Email
      if (brevoApiKey) {
        try {
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'api-key': brevoApiKey,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              sender: { name: 'SchoolOS+ Platform', email: senderEmail },
              to: [{ email: reg.admin_email, name: reg.admin_name }],
              subject: `School OS+ Approved: ${reg.school_name}`,
              htmlContent: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                  <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">Registration Approved!</h2>
                  <p>Dear <strong>${reg.admin_name}</strong>,</p>
                  <p>We are excited to inform you that your registration for <strong>${reg.school_name}</strong> has been approved by the Platform Administrator.</p>
                  <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1f2937;">Your Account Details:</h3>
                    <p style="margin: 5px 0;"><strong>School Code:</strong> ${finalCode}</p>
                    <p style="margin: 5px 0;"><strong>Username:</strong> ${reg.admin_username}</p>
                    <p style="margin: 5px 0;"><strong>Password:</strong> ${reg.admin_password || '[Your configured password]'}</p>
                    <p style="margin: 5px 0;"><strong>Plan:</strong> ${finalPlan.toUpperCase()}</p>
                    <p style="margin: 5px 0;"><strong>Status:</strong> Active</p>
                  </div>
                  <p>You can now log in to the School OS+ dashboard and begin configuring your school environment.</p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${appFrontendUrl}/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Go to Login Portal</a>
                  </p>
                  <p>If you have any questions, please contact our support team.</p>
                  <br/>
                  <p>Best regards,<br/><strong>SchoolOS+ Team</strong></p>
                </div>
              `
            })
          });
        } catch (e) {
          console.error('Error triggering Brevo approval email:', e);
        }
      }

      // Update registration record and clear password after sending email
      const { error: updateRegErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status:         'approved',
          school_code:    finalCode,
          plan_type:      finalPlan,
          admin_password: null, // Clear plaintext password now that approval is complete
        })
        .eq('id', id);
      if (updateRegErr) throw new Error(`Failed to update registration: ${updateRegErr.message}`);

      return new Response(JSON.stringify({ success: true, message: 'School approved and activated.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');

  } catch (err: any) {
    console.error('[approve-school-registration] Error:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || err.toString() }), {
      status: 200, // keep 200 for client-friendly json parsing
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
