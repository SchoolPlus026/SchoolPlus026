import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://nnaqayemfogpfehiaifw.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYXFheWVtZm9ncGZlaGlhaWZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE4NTc5NCwiZXhwIjoyMDkxNzYxNzk0fQ.oCnaDPw0iuPykcvTwEL4EPZLHbB1_JeAJyjPGfmYEW8';

async function runMigration() {
  const sqlPath = path.resolve('database/v104_student_leave_notifications.sql');
  console.log(`Reading SQL from: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing SQL migration on Supabase...');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/run_sql`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    console.log('Migration executed successfully!');
    const result = await res.text();
    console.log('Result:', result);
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
}

runMigration();
