import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log("=== LISTING ALL USERS IN DB ===");

  const { data: pUsers, error: pError } = await supabase
    .from('users')
    .select('id, email, username, role, name, school_id');
  
  if (pError) {
    console.error("Error querying public.users:", pError.message);
  } else {
    console.log(`\nFound ${pUsers.length} users in public.users:`);
    console.table(pUsers.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      name: u.name,
      school_id: u.school_id
    })));
  }

  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error("Error listing auth.users:", authError.message);
  } else {
    console.log(`\nFound ${users.length} users in auth.users:`);
    console.table(users.map(u => ({
      id: u.id,
      email: u.email,
      provider: u.app_metadata?.provider || u.app_metadata?.providers || 'none',
      identities: u.identities ? u.identities.map(id => id.provider) : [],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at
    })));
  }
}

main().catch(console.error);
