// approve-school-registration — simplified (Sandbox Architecture)
// The school, auth user, and profile are already created at registration.
// This function ONLY updates statuses when the Platform Admin approves/rejects.
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
    const { action, rejection_reason } = body;

    if (!id || !action) throw new Error('school_id and action are required');
    if (!['approve', 'reject'].includes(action)) throw new Error('action must be approve or reject');

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
    if (reg.status !== 'pending') throw new Error(`Registration is already ${reg.status}`);

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { error: updateRegErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status:           'rejected',
          admin_password:   null,
          rejection_reason: rejection_reason?.trim() || 'No reason provided',
        })
        .eq('id', id);
      if (updateRegErr) throw new Error(`Failed to update registration: ${updateRegErr.message}`);

      // Also update the school_settings so the school knows they're rejected
      if (reg.school_id) {
        await supabaseAdmin
          .from('school_settings')
          .update({ subscription_status: 'Rejected' })
          .eq('school_id', reg.school_id);
      }

      return new Response(JSON.stringify({ success: true, message: 'Registration rejected.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── APPROVE ───────────────────────────────────────────────────────────────
    if (action === 'approve') {
      if (!reg.school_id) throw new Error('Registration has no linked school_id. Cannot approve.');

      // Activate the school by updating subscription_status from 'Pending' to 'Paid'
      const { error: schoolErr } = await supabaseAdmin
        .from('school_settings')
        .update({
          subscription_status: 'Paid',
          // Set trial start date now if it was a trial plan
          trial_start_date: reg.plan_type === 'trial' ? new Date().toISOString() : undefined,
        })
        .eq('school_id', reg.school_id);
      if (schoolErr) throw new Error(`Failed to activate school: ${schoolErr.message}`);

      // Update registration record
      const { error: updateRegErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status:         'approved',
          admin_password: null,
        })
        .eq('id', id);
      if (updateRegErr) throw new Error(`Failed to update registration: ${updateRegErr.message}`);

      // Send approval email via Brevo API
      const brevoApiKey = Deno.env.get('BREVO_API_KEY');
      const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') || 'schoolosplus@gmail.com';

      if (brevoApiKey) {
        try {
          const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
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
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; borderRadius: 8px;">
                  <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">Registration Approved!</h2>
                  <p>Dear <strong>${reg.admin_name}</strong>,</p>
                  <p>We are excited to inform you that your registration for <strong>${reg.school_name}</strong> has been approved by the Platform Administrator.</p>
                  <div style="background-color: #f3f4f6; padding: 15px; borderRadius: 6px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1f2937;">Your Account Details:</h3>
                    <p style="margin: 5px 0;"><strong>School Code:</strong> ${reg.school_code}</p>
                    <p style="margin: 5px 0;"><strong>Username:</strong> ${reg.admin_username}</p>
                    <p style="margin: 5px 0;"><strong>Status:</strong> Active</p>
                  </div>
                  <p>You can now log in to the School OS+ dashboard and begin configuring your school environment.</p>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="https://schoolosplus.com/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; borderRadius: 6px; font-weight: bold;">Go to Login Portal</a>
                  </p>
                  <p>If you have any questions, please contact our support team.</p>
                  <br/>
                  <p>Best regards,<br/><strong>SchoolOS+ Team</strong></p>
                </div>
              `
            })
          });

          if (!emailResponse.ok) {
            console.error('Failed to send approval email via Brevo:', await emailResponse.text());
          }
        } catch (e) {
          console.error('Error triggering Brevo email:', e);
        }
      } else {
        console.warn('BREVO_API_KEY is not configured in Supabase Secrets. Skipping approval email.');
      }

      return new Response(JSON.stringify({ success: true, message: 'School approved and activated.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');

  } catch (err) {
    console.error('[approve-school-registration] Error:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || err.toString() }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
