import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log("=== DETAILED DIAGNOSTIC FOR ADMIN120 AND HAJARE ===");

  // 1. Check all users in public.users where username is admin120 or Hajare
  const { data: pUsers, error: pError } = await supabase
    .from('users')
    .select('id, email, username, role, name, school_id')
    .in('username', ['admin120', 'Hajare', 'teacher_hajare']);
  
  console.log("\n--- public.users ---");
  console.table(pUsers);

  // 2. Fetch all auth users
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  
  console.log("\n--- auth.users matching admin120, Hajare, or their emails ---");
  const matching = users.filter(u => 
    (u.email && (
      u.email.includes('admin120') || 
      u.email.includes('hajare') || 
      u.email.includes('schoolpro') || 
      u.email.includes('shubhamofficial')
    )) || 
    (u.user_metadata && (
      u.user_metadata.username === 'admin120' || 
      u.user_metadata.username === 'Hajare'
    ))
  );

  console.table(matching.map(u => ({
    id: u.id,
    email: u.email,
    raw_user_metadata: JSON.stringify(u.user_metadata),
    providers: u.app_metadata?.providers || u.app_metadata?.provider || 'none',
    identities: u.identities ? u.identities.map(id => id.provider + ':' + id.identity_data?.email) : [],
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at
  })));
}

main().catch(console.error);
