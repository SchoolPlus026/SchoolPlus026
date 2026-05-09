import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      school_name, school_code, city, state, board, school_type, student_strength,
      admin_name, admin_email, admin_phone, admin_username, admin_password, plan_type,
    } = await req.json();

    // Validate required fields
    if (!school_name || !school_code || !admin_name || !admin_email || !admin_username || !admin_password) {
      throw new Error('Missing required registration fields.');
    }
    if (admin_password.length < 6) throw new Error('Password must be at least 6 characters.');

    // Service role client — bypasses RLS entirely
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const finalSchoolCode = school_code.trim().toUpperCase();
    const finalPlanType   = plan_type || 'trial';

    // ── 1. Check duplicate school code ──────────────────────────────────────
    const { data: existingSchool } = await supabaseAdmin
      .from('school_settings')
      .select('school_id')
      .eq('school_code', finalSchoolCode)
      .single();
    if (existingSchool) throw new Error(`School code "${finalSchoolCode}" is already in use.`);

    // ── 2. Check duplicate username ──────────────────────────────────────────
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', admin_username.trim().toLowerCase())
      .single();
    if (existingUser) throw new Error(`Username "${admin_username}" is already taken.`);

    // ── 3. Check duplicate email ─────────────────────────────────────────────
    const { data: existingEmail } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', admin_email.trim().toLowerCase())
      .limit(1);
    // Also check auth — auth.admin.listUsers with filter is unreliable, so we skip and
    // let createUser fail naturally if the email is taken.

    // ── 4. Compute trial start ───────────────────────────────────────────────
    const now = new Date();
    const trialStartDate = finalPlanType === 'trial' ? now.toISOString() : null;

    // ── 5. Create school_settings with subscription_status = 'Pending' ───────
    const { data: school, error: schoolErr } = await supabaseAdmin
      .from('school_settings')
      .insert({
        name:                  school_name.trim(),
        school_code:           finalSchoolCode,
        subscription_tier:     finalPlanType === 'premium' ? 'Premium' : finalPlanType === 'trial' ? 'Trial' : 'Free',
        subscription_status:   'Pending',   // <─ key: marks school as pending
        plan_type:             finalPlanType,
        billing_cycle:         null,
        trial_start_date:      trialStartDate,
        subscription_end_date: null,
      })
      .select('school_id')
      .single();

    if (schoolErr) throw new Error(`Failed to create school record: ${schoolErr.message}`);
    const newSchoolId = school.school_id;

    // ── 6. Create Auth User ──────────────────────────────────────────────────
    const { data: authUserData, error: createUserErr } = await supabaseAdmin.auth.admin.createUser({
      email:         admin_email.trim().toLowerCase(),
      password:      admin_password,
      email_confirm: true,
      user_metadata: { role: 'admin', school_id: newSchoolId },
    });

    if (createUserErr) {
      // Rollback school
      await supabaseAdmin.from('school_settings').delete().eq('school_id', newSchoolId);
      throw new Error(`Failed to create account: ${createUserErr.message}`);
    }
    const newUserId = authUserData.user.id;

    // ── 7. Insert user profile ───────────────────────────────────────────────
    const { error: profileErr } = await supabaseAdmin
      .from('users')
      .insert({
        id:        newUserId,
        school_id: newSchoolId,
        role:      'admin',
        username:  admin_username.trim().toLowerCase(),
        name:      admin_name.trim(),
      });

    if (profileErr) {
      // Rollback both
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from('school_settings').delete().eq('school_id', newSchoolId);
      throw new Error(`Failed to create user profile: ${profileErr.message}`);
    }

    // ── 8. Insert school_registrations row (status: pending) ─────────────────
    const { error: regErr } = await supabaseAdmin
      .from('school_registrations')
      .insert({
        school_name:      school_name.trim(),
        school_code:      finalSchoolCode,
        city:             city?.trim() || null,
        state:            state || null,
        board:            board || null,
        school_type:      school_type || 'private',
        student_strength: student_strength ? parseInt(student_strength, 10) : null,
        admin_name:       admin_name.trim(),
        admin_email:      admin_email.trim().toLowerCase(),
        admin_phone:      admin_phone?.trim() || null,
        admin_username:   admin_username.trim().toLowerCase(),
        admin_password:   null, // never store plaintext password
        plan_type:        finalPlanType,
        terms_accepted:   true,
        status:           'pending',
        school_id:        newSchoolId, // link to the created school
      });

    if (regErr) {
      // Non-fatal: provisioning is done. Just log.
      console.warn('[register-school] Could not insert school_registrations row:', regErr.message);
    }

    return new Response(JSON.stringify({ success: true, school_id: newSchoolId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[register-school] Error:', err.message || err);
    return new Response(JSON.stringify({ error: err.message || err.toString() }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
