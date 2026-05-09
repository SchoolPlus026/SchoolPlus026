import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(opts: { to: string, subject: string, html: string }) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.log('[approve-school-registration] RESEND_API_KEY not set — skipping email');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[approve-school-registration] Email send failed:', res.status, body);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const id = body.school_id || body.registration_id;
    const { action, override_school_code, override_plan_type, rejection_reason } = body;

    if (!id || !action) throw new Error('school_id and action are required');

    // 1. Initialize Admin Client directly
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 2. Fetch Data
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('school_registrations')
      .select('*')
      .eq('id', id)
      .single();

    if (regErr || !reg) throw new Error('Registration not found');
    if (reg.status !== 'pending') throw new Error(`Registration is already ${reg.status}`);

    // ── REJECT ─────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { error: updateErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status: 'rejected',
          admin_password: null,
          rejection_reason: rejection_reason || 'No reason provided',
        })
        .eq('id', id);
      
      if (updateErr) throw new Error(`Failed to update registration: ${updateErr.message}`);

      const html = `
      <!DOCTYPE html><html><body style="font-family:sans-serif;padding:32px;">
        <h2>Registration Declined</h2>
        <p>Your registration request for <strong>${reg.school_name}</strong> was declined.</p>
      </body></html>`;

      await sendEmail({
        to: reg.admin_email,
        subject: `Registration Update: ${reg.school_name}`,
        html,
      });

      return new Response(JSON.stringify({ success: true, message: 'Registration rejected.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── APPROVE ────────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const finalSchoolCode = (override_school_code || reg.school_code).toUpperCase();
      const finalPlanType = override_plan_type || reg.plan_type || 'trial';
      const actualPassword = reg.admin_password;

      if (!actualPassword) throw new Error('Original admin password not found in registration record.');

      // Check if school code exists
      const { data: existingSchool } = await supabaseAdmin
        .from('school_settings')
        .select('school_id')
        .eq('school_code', finalSchoolCode)
        .single();
      if (existingSchool) throw new Error(`School code "${finalSchoolCode}" is already in use.`);

      // Check if username exists
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', reg.admin_username)
        .single();
      if (existingUser) throw new Error(`Username "${reg.admin_username}" is already taken.`);

      // Insert school into schools table (school_settings)
      const { data: school, error: schoolErr } = await supabaseAdmin
        .from('school_settings')
        .insert({
          name: reg.school_name,
          school_code: finalSchoolCode,
          subscription_tier: finalPlanType === 'premium' ? 'Premium' : finalPlanType === 'trial' ? 'Trial' : 'Free',
          subscription_status: 'Paid',
          plan_type: finalPlanType,
        })
        .select('school_id')
        .single();
      
      if (schoolErr) throw new Error(`Failed to create school: ${schoolErr.message}`);
      const newSchoolId = school.school_id;

      // Create Auth User
      const { data: authUserData, error: createUserErr } = await supabaseAdmin.auth.admin.createUser({
        email: reg.admin_email,
        password: actualPassword,
        email_confirm: true,
        user_metadata: { role: 'school_admin', school_id: newSchoolId }
      });

      if (createUserErr) {
        await supabaseAdmin.from('school_settings').delete().eq('school_id', newSchoolId);
        throw new Error(`Failed to create auth user: ${createUserErr.message}`);
      }
      const newUserId = authUserData.user.id;

      // Insert admin into profiles table (users)
      const { error: profileErr } = await supabaseAdmin
        .from('users')
        .insert({
          id: newUserId,
          school_id: newSchoolId,
          role: 'admin',
          username: reg.admin_username,
          name: reg.admin_name,
        });

      if (profileErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        await supabaseAdmin.from('school_settings').delete().eq('school_id', newSchoolId);
        throw new Error(`Failed to create user profile: ${profileErr.message}`);
      }

      // Update school_registrations
      const { error: updateRegErr } = await supabaseAdmin
        .from('school_registrations')
        .update({
          status: 'approved',
          admin_password: null,
        })
        .eq('id', id);
      
      if (updateRegErr) throw new Error(`Failed to update registration: ${updateRegErr.message}`);

      // Send Welcome Email
      const loginUrl = Deno.env.get('APP_LOGIN_URL') || 'https://schoolpro-d95a8.web.app/login';
      const html = `
      <!DOCTYPE html><html><body style="font-family:sans-serif;padding:32px;">
        <h2>🎉 Welcome to SchoolOS+!</h2>
        <p>Dear <strong>${reg.admin_name}</strong>,</p>
        <p>Your school registration for <strong>${reg.school_name}</strong> has been approved.</p>
        <div style="background:#f1f5f9;padding:16px;margin:16px 0;border-radius:8px;">
          <p style="margin:0;"><strong>School Code:</strong> ${finalSchoolCode}</p>
          <p style="margin:8px 0 0 0;"><strong>Username:</strong> ${reg.admin_username}</p>
        </div>
        <p style="color:#e11d48;font-weight:bold;">Please use the password you created during the registration process to log in.</p>
        <a href="${loginUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Login to SchoolOS+ →</a>
      </body></html>`;

      await sendEmail({
        to: reg.admin_email,
        subject: `✅ ${reg.school_name} — Your SchoolOS+ Account is Ready!`,
        html,
      });

      return new Response(JSON.stringify({ success: true, message: 'School approved and provisioned.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Invalid action');

  } catch (err) {
    console.error('[approve-school-registration] Error:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || err.toString() }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
