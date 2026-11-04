import type { AuthUser } from '../domain/auth.ts';

export function isCatalogAdmin(user: Pick<AuthUser, 'app_metadata'> | null): boolean {
  return user?.app_metadata?.role === 'admin';
}
