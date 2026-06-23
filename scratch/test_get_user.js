import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function test() {
  console.log("Initializing Supabase Client with service role key...");
  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  try {
    console.log("Calling auth.getUser()...");
    const { data, error } = await supabaseClient.auth.getUser();
    console.log("Data:", data);
    console.log("Error:", error);
  } catch (err) {
    console.error("Caught error:", err.message);
  }
}

test();
