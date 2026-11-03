import type { Database } from './database.generated';
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/shared/config';

export const supabase = createClient<Database>(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
