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
