import { useEffect, useState, useRef, ReactNode } from 'react';
import type { AuthSession as Session, AuthUser as User } from '@/domain/auth';
import { useIntegrations } from '@/shared/integrations';

import { useProfileData } from '@/features/profile';

import { AuthContext } from '@/features/auth';

export function AuthProvider({ children, onAccountChange }: { children: ReactNode; onAccountChange: (id: string | undefined) => void }) {
  const { auth: authIntegration, profile: profileRepository } = useIntegrations();
  const accountRef = useRef<string | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { profile, refreshProfile, setProfile } = useProfileData(user, accountRef, profileRepository);

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
  }, [authIntegration, onAccountChange, setProfile]);

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

