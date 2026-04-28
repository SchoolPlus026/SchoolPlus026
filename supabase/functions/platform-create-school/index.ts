import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Verify the caller is a platform_admin ──────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use anon client to verify the calling user's JWT
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify caller role from user_metadata
    const callerRole = user.user_metadata?.role;
    if (callerRole !== 'platform_admin' && callerRole !== 'app_manager') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only platform admins can create schools.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 2. Parse request body ─────────────────────────────────────────────────
    const {
      school_name,
      school_code,
      subscription_tier,
      plan_type,          // 'free' | 'trial' | 'premium'
      billing_cycle,      // 'monthly' | 'yearly' | null
      admin_name,
      admin_username,
      admin_email,
      admin_password,
    } = await req.json();

    // Validate required fields
    const missing = ['school_name', 'school_code', 'admin_name', 'admin_username', 'admin_email', 'admin_password']
      .filter(f => !{ school_name, school_code, admin_name, admin_username, admin_email, admin_password }[f]);
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (admin_password.length < 6) {
      return new Response(JSON.stringify({ error: 'Admin password must be at least 6 characters.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 3. Service Role client — bypasses RLS for admin operations ────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 4. Check for duplicate school_code ────────────────────────────────────
    const { data: existingSchool } = await supabaseAdmin
      .from('school_settings')
      .select('school_id')
      .eq('school_code', school_code.toUpperCase())
      .single();

    if (existingSchool) {
      return new Response(JSON.stringify({ error: `School code "${school_code.toUpperCase()}" is already in use.` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 5. Check for duplicate username ──────────────────────────────────────
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', admin_username)
      .single();

    if (existingUser) {
      return new Response(JSON.stringify({ error: `Username "${admin_username}" is already taken.` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Business logic: compute billing dates ────────────────────────────────
    const effectivePlanType: string = plan_type || 'free';
    const now = new Date();
    let trialStartDate: string | null = null;
    let subscriptionEndDate: string | null = null;

    if (effectivePlanType === 'trial') {
      trialStartDate = now.toISOString();
    } else if (effectivePlanType === 'premium') {
      const days = billing_cycle === 'yearly' ? 365 : 28; // 1 month = 28 days
      subscriptionEndDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    // ── 6. Create school_settings row ─────────────────────────────────────────
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('school_settings')
      .insert({
        name:                  school_name.trim(),
        school_code:           school_code.trim().toUpperCase(),
        subscription_tier:     subscription_tier || 'Free',
        subscription_status:   'Paid',
        plan_type:             effectivePlanType,
        billing_cycle:         billing_cycle || null,
        trial_start_date:      trialStartDate,
        subscription_end_date: subscriptionEndDate,
      })
      .select('school_id')
      .single();

    if (schoolError) {
      return new Response(JSON.stringify({ error: `Failed to create school: ${schoolError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const newSchoolId = school.school_id;

    // ── 7. Create admin user in Supabase Auth (service role) ──────────────────
    const { data: authUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email.trim(),
      password: admin_password,
      email_confirm: true,        // Skip email confirmation — admin-created accounts are pre-verified
      user_metadata: {
        school_id: newSchoolId,
        role: 'admin',
      },
    });

    if (createUserError) {
      // Rollback: delete the school we just created
      await supabaseAdmin.from('school_settings').delete().eq('school_id', newSchoolId);
      return new Response(JSON.stringify({ error: `Failed to create admin user: ${createUserError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const newUserId = authUserData.user.id;

    // ── 8. Create public.users row ────────────────────────────────────────────
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newUserId,
        school_id: newSchoolId,
        role: 'admin',
        username: admin_username.trim(),
        name: admin_name.trim(),
      });

    if (profileError) {
      // Rollback both: delete auth user and school
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from('school_settings').delete().eq('school_id', newSchoolId);
      return new Response(JSON.stringify({ error: `Failed to create user profile: ${profileError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 9. Success ────────────────────────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      school_id: newSchoolId,
      school_code: school_code.toUpperCase(),
      admin_id: newUserId,
      message: `School "${school_name}" created successfully. Admin can log in with username: "${admin_username}" and the provided password.`,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Unexpected error: ${err.message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
