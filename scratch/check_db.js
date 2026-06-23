const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function checkDb() {
  console.log("=== DIAGNOSTIC DATABASE CHECK ===");

  async function fetchTable(path, label) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      console.log(`\n--- ${label} ---`);
      console.table(data);
    } catch (err) {
      console.error(`Error fetching ${label}:`, err.message);
    }
  }

  await fetchTable('edge_function_usage?select=id,function_name,execution_time_ms,called_at&order=called_at.desc&limit=10', 'Edge Function Usage Logs');
}

checkDb();





