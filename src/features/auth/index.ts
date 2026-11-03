import type { ServiceResult } from '@/domain/errors';
import { createContext, useContext } from 'react';
import type { AuthSession as Session, AuthUser as User } from '@/domain/auth';
import type { ProfileData } from '@/features/profile';
export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: ProfileData;
  refreshProfile: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<ServiceResult<void>>;
  signIn: (email: string, password: string) => Promise<ServiceResult<void>>;
  signInWithGoogle: () => Promise<ServiceResult<void>>;
  signOut: () => Promise<ServiceResult<void>>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
