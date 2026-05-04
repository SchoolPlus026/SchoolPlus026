import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Business rule: 1 month = 28 days, 1 year = 365 days
const PLAN_DURATIONS: Record<string, number> = {
  monthly: 28,
  yearly:  365,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    // ── 1. Verify the calling user ────────────────────────────────────────────
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // ── 2. Look up their school_id from the users table ───────────────────────
    const { data: profile, error: profileError } = await supabaseClient
      .from('users')
      .select('school_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('User profile not found');
    if (profile.role !== 'admin') throw new Error('Only school admins can upgrade their own plan');

    const schoolId = profile.school_id;

    // ── 3. Parse and validate billing_cycle ───────────────────────────────────
    const { billing_cycle } = await req.json();
    if (!billing_cycle || !PLAN_DURATIONS[billing_cycle]) {
      throw new Error(`Invalid billing_cycle. Must be 'monthly' (28 days) or 'yearly' (365 days)`);
    }

    // ── 4. Calculate new subscription_end_date ────────────────────────────────
    const daysToAdd = PLAN_DURATIONS[billing_cycle];
    const now = new Date();
    const endDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    // ── 5. Update school_settings using service role ──────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: updateError } = await supabaseAdmin
      .from('school_settings')
      .update({
        plan_type:             'premium',
        subscription_tier:     'Premium',
        billing_cycle:         billing_cycle,
        subscription_end_date: endDate.toISOString(),
        trial_start_date:      null, // clear any previous trial date
      })
      .eq('school_id', schoolId);

    if (updateError) throw new Error(`Failed to update plan: ${updateError.message}`);

    return new Response(JSON.stringify({
      success: true,
      plan_type:             'premium',
      billing_cycle:         billing_cycle,
      subscription_end_date: endDate.toISOString(),
      days_added:            daysToAdd,
      message: `Plan upgraded to Premium (${billing_cycle}). Valid until ${endDate.toLocaleDateString('en-GB')}.`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('school-self-upgrade error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
