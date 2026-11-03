import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/shared/config';

export const supabase = createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
