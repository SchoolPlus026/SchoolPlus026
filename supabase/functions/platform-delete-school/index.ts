import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    // ── 1. Verify caller is platform_admin ────────────────────────────────────
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // ── 1.5. Check role in public.users (don't rely on JWT metadata which may be stale) ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (dbError || !dbUser) throw new Error('Could not verify user role in database');
    if (dbUser.role !== 'platform_admin') throw new Error('Forbidden: Only platform admins can delete schools');

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { school_id, platform_admin_password } = await req.json();
    if (!school_id)              throw new Error('Missing school_id');
    if (!platform_admin_password) throw new Error('Missing platform_admin_password for confirmation');

    // ── 3. Re-authenticate the platform admin's password (server-side) ────────
    // This is the security gate — the password is never stored client-side.
    // If wrong password, abort before touching any data.
    const { error: reAuthError } = await supabaseAnon.auth.signInWithPassword({
      email:    user.email!,
      password: platform_admin_password,
    });
    if (reAuthError) throw new Error('Password confirmation failed — deletion aborted');

    // ── 4. Use service role for destructive operations ────────────────────────
    // (supabaseAdmin already initialized above)

    // ── 5. Collect auth user IDs before deleting the profiles ─────────────────
    const { data: userProfiles } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', school_id);

    const authUserIds = (userProfiles || []).map((u: any) => u.id);

    // ── 6. Cascade delete all relational data via RPC ─────────────────────────
    const { error: deleteError } = await supabaseAdmin.rpc('platform_delete_school', {
      p_school_id: school_id,
    });
    if (deleteError) throw new Error(`DB deletion failed: ${deleteError.message}`);

    // ── 7. Delete Auth users (must happen after profile rows are gone) ─────────
    for (const uid of authUserIds) {
      const { error: authDelError } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (authDelError) {
        console.error(`Failed to delete auth user ${uid}:`, authDelError.message);
        // Non-fatal: profile is already deleted, auth cleanup can be done manually
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `School ${school_id} and ${authUserIds.length} user(s) permanently deleted.`,
      deleted_user_count: authUserIds.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('platform-delete-school error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200, // Changed from 400 so supabase client parses JSON body instead of throwing generic error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
