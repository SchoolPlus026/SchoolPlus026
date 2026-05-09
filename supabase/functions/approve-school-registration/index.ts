// approve-school-registration — v1.0.37
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Email via Resend (fallback: just log if RESEND_API_KEY not set) ───────────
async function sendWelcomeEmail(opts: {
  to: string;
  school_name: string;
  school_code: string;
  admin_name: string;
  admin_username: string;
  admin_password: string;
  login_url: string;
}) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.log('[approve] RESEND_API_KEY not set — skipping email, credentials:', JSON.stringify(opts));
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🎉 Welcome to SchoolOS+!</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Your school has been approved and is ready to use.</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:15px;">Dear <strong>${opts.admin_name}</strong>,</p>
      <p style="color:#374151;font-size:15px;">Your school registration for <strong>${opts.school_name}</strong> has been approved by our platform team. Here are your login credentials:</p>
      
      <div style="background:#f1f5f9;border-radius:12px;padding:20px 24px;margin:24px 0;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Your Login Details</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;width:140px;">School Code</td>
            <td style="padding:6px 0;color:#1e293b;font-weight:700;font-family:monospace;font-size:14px;">${opts.school_code}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Username</td>
            <td style="padding:6px 0;color:#1e293b;font-weight:700;font-family:monospace;font-size:14px;">${opts.admin_username}</td>
          </tr>
        </table>
      </div>

      <p style="color:#1e293b;font-size:14px;font-weight:600;">Please use the password you created during the registration process to log in.</p>

      <a href="${opts.login_url}" style="display:inline-block;margin:16px 0;background:#4f46e5;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">Login to SchoolOS+ →</a>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:12px;margin:0;">This email was sent because your school was registered on SchoolOS+. If you did not register, please ignore this email.</p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'SchoolOS+ <noreply@schoolos.app>',
      to: [opts.to],
      subject: `✅ ${opts.school_name} — Your SchoolOS+ Account is Ready!`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[approve] Email send failed:', res.status, body);
  } else {
    console.log('[approve] Welcome email sent to', opts.to);
  }
}

async function sendRejectionEmail(opts: {
  to: string;
  school_name: string;
}) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.log('[approve] RESEND_API_KEY not set — skipping rejection email');
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;background:#f8fafc;padding:32px 0;">
  <div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#f43f5e,#e11d48);padding:32px 40px;">
      <h1 style="color:#fff;margin:0;font-size:24px;">Registration Declined</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:15px;">Your registration request for <strong>${opts.school_name}</strong> was declined.</p>
      <p style="color:#64748b;font-size:13px;">If you believe this is an error, please contact our support team.</p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'SchoolOS+ <noreply@schoolos.app>',
      to: [opts.to],
      subject: `Registration Update: ${opts.school_name}`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[approve] Rejection email failed:', res.status, body);
  } else {
    console.log('[approve] Rejection email sent to', opts.to);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Auth: must be a platform_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser();
    if (authErr || !user) throw new Error('Unauthorized');

    // 3. Service role client — hoisted here so it can be used for role verification below
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify caller is platform_admin via DB (authoritative) — NOT JWT user_metadata
    // JWT user_metadata.role is set at signup and can be stale or absent.
    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (callerProfile?.role !== 'platform_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only platform admins can approve registrations.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse body
    const {
      registration_id,
      action,              // 'approve' | 'reject'
      rejection_reason,    // required when action === 'reject'
      // Optional overrides (P.A. can tweak before approval)
      override_school_code,
      override_plan_type,
    } = await req.json();

    if (!registration_id || !action) throw new Error('registration_id and action are required');
    if (!['approve', 'reject'].includes(action)) throw new Error('action must be approve or reject');
    if (action === 'reject' && !rejection_reason?.trim()) throw new Error('rejection_reason is required for rejection');

    // 4. Fetch the registration
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('school_registrations')
      .select('*')
      .eq('id', registration_id)
      .single();

    if (regErr || !reg) throw new Error('Registration not found');
    if (reg.status !== 'pending') throw new Error(`Registration is already ${reg.status}`);

    // ── REJECT PATH ──────────────────────────────────────────────────────────
    if (action === 'reject') {
      await supabaseAdmin
        .from('school_registrations')
        .update({
          status: 'rejected',
          rejection_reason: rejection_reason.trim(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          admin_password: null, // Clear password on reject
        })
        .eq('id', registration_id);

      try {
        await sendRejectionEmail({ to: reg.admin_email, school_name: reg.school_name });
      } catch (emailErr) {
        console.error('[approve] Failed to send rejection email:', emailErr);
      }

      return new Response(JSON.stringify({ success: true, message: 'Registration rejected.' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── APPROVE PATH ─────────────────────────────────────────────────────────
    const finalSchoolCode   = (override_school_code || reg.school_code).toUpperCase();
    const finalPlanType     = override_plan_type    || reg.plan_type || 'trial';
    const actualPassword    = reg.admin_password;

    if (!actualPassword) throw new Error('Original admin password not found in registration record.');

    // 5. Invoke platform-create-school (reuse existing provisioning logic)
    // Use service_role to ensure completely bypassing RLS during provisioning
    const provisionRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-create-school`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({
        school_name:       reg.school_name,
        school_code:       finalSchoolCode,
        subscription_tier: finalPlanType === 'premium' ? 'Premium' : finalPlanType === 'trial' ? 'Trial' : 'Free',
        plan_type:         finalPlanType,
        billing_cycle:     null,
        admin_name:        reg.admin_name,
        admin_username:    reg.admin_username,
        admin_email:       reg.admin_email,
        admin_password:    actualPassword,
      }),
    });

    const provisionData = await provisionRes.json();
    if (!provisionRes.ok || provisionData.error) {
      throw new Error(provisionData.error || 'Provisioning failed');
    }

    // 6. Mark registration as approved and clear the plaintext password
    await supabaseAdmin
      .from('school_registrations')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        admin_password: null,
      })
      .eq('id', registration_id);

    // 7. Send welcome email
    const loginUrl = Deno.env.get('APP_LOGIN_URL') || 'https://schoolpro-d95a8.web.app/login';
    try {
      await sendWelcomeEmail({
        to:             reg.admin_email,
        school_name:    reg.school_name,
        school_code:    finalSchoolCode,
        admin_name:     reg.admin_name,
        admin_username: reg.admin_username,
        admin_password: '', // Unused in new template
        login_url:      loginUrl,
      });
    } catch (emailErr) {
      console.error('[approve] Failed to send welcome email:', emailErr);
    }

    return new Response(JSON.stringify({
      success:     true,
      school_id:   provisionData.school_id,
      message:     `School "${reg.school_name}" approved and provisioned.`,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[approve-school-registration] Error:', err.message);
    // Return 400 so the client receives the JSON body, as 500s are obscured by FunctionsHttpError
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

