import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function main() {
  console.log("=== SCANNING DATABASE USERS ===");
  
  // 1. Fetch public.users for target emails
  const emailsToCheck = [
    'schoolpro026@gmail.com',
    'shubhamofficial026@gmail.com',
    'teacher_hajare@school.com',
    'admin120@school.com'
  ];
  
  console.log("\n--- Checking public.users ---");
  for (const email of emailsToCheck) {
    const { data: pUsers, error: pError } = await supabase
      .from('users')
      .select('id, email, username, role, name, school_id')
      .ilike('email', email);
    
    if (pError) {
      console.error(`Error querying public.users for ${email}:`, pError.message);
    } else {
      console.log(`Email: ${email} -> Found ${pUsers.length} records in public.users:`);
      console.table(pUsers);
    }
  }

  // 2. Fetch auth.users (via service role client we can list users)
  console.log("\n--- Checking auth.users via supabase.auth.admin.listUsers() ---");
  try {
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.error("Error listing auth.users:", authError.message);
    } else {
      const filteredUsers = users.filter(u => 
        emailsToCheck.some(e => u.email && u.email.toLowerCase() === e.toLowerCase())
      );
      console.log(`Found ${filteredUsers.length} matching records in auth.users:`);
      
      const userSummary = filteredUsers.map(u => ({
        id: u.id,
        email: u.email,
        providers: u.app_metadata?.providers || u.app_metadata?.provider || 'none',
        identities_count: u.identities ? u.identities.length : 0,
        identities: u.identities ? u.identities.map(id => id.provider) : [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at
      }));
      console.table(userSummary);
    }
  } catch (err) {
    console.error("Exception listing auth.users:", err.message);
  }
}

main().catch(console.error);
