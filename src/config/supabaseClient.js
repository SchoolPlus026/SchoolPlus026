import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Remember to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY 
// in your GitHub Actions Secrets later for the headless compilation to work!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
