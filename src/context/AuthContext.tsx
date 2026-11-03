import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import type { AuthSession as Session, AuthUser as User } from '@/domain/auth';
import { useIntegrations } from '@/shared/integrations';

export interface ProfileData {
  fullName: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: ProfileData;
  refreshProfile: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, onAccountChange }: { children: ReactNode; onAccountChange: (id: string | undefined) => void }) {
  const { auth: authIntegration, profile: profileRepository } = useIntegrations();
  const accountRef = useRef<string | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData>({ fullName: '', avatarUrl: null });

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const data = await profileRepository.get(user.id).catch(() => null);
    if (accountRef.current !== user.id) return;
    const googleName = [user.user_metadata.full_name, user.user_metadata.name]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim() ?? '';
    setProfile({
      fullName: data?.full_name?.trim() || googleName,
      avatarUrl: data?.avatar_url || null,
    });
  }, [user, profileRepository]);

  useEffect(() => {
    let active = true;
    let eventObserved = false;
    const apply = (next: Session | null) => {
      if (!active) return;
      const id = next?.user.id;
      if (accountRef.current !== id) setProfile({ fullName: '', avatarUrl: null });
      onAccountChange(id);
      accountRef.current = id;
      setSession(next); setUser(next?.user ?? null); setLoading(false);
    };
    const unsubscribe = authIntegration.subscribe(next => {
      eventObserved = true; apply(next);
    });
    void authIntegration.getSession().then(next => { if (!eventObserved) apply(next); }).catch(() => { if (!eventObserved) apply(null); });
    return () => { active = false; unsubscribe(); };
  }, [authIntegration, onAccountChange]);

  useEffect(() => {
    if (user) {
      void refreshProfile().catch(() => {});
    } else {
      setProfile({ fullName: '', avatarUrl: null });
    }
  }, [user, refreshProfile]);

  const signUp = authIntegration.signUp;
  const signIn = authIntegration.signIn;
  const signInWithGoogle = authIntegration.signInWithGoogle;
  const signOut = authIntegration.signOut;

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, refreshProfile, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
