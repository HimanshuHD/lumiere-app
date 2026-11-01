import type { User } from '@supabase/supabase-js';

export function isCatalogAdmin(user: Pick<User, 'app_metadata'> | null): boolean {
  return user?.app_metadata?.role === 'admin';
}
