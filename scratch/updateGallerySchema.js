import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
(async () => {
  const { error } = await supabase.rpc('run_sql', {
    sql: `
      ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS visibility_scope text DEFAULT 'Entire School';
      ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS target_class text;
    `
  });
  console.log('Error:', error);
})();
