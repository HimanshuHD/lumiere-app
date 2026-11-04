import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { navigate } from './navigation';

/** Survives account-keyed UI remounts; a new identity never inherits the old reader route. */
export function SessionNavigationBoundary({children}: {children: ReactNode}) {
  const {user, loading} = useAuth();
  const id = user?.id ?? null;
  const previous = useRef<string | null>(null);
  const [settled, setSettled] = useState<{id: string | null} | null>(null);
  useLayoutEffect(() => {
    if (loading) return;
    if (previous.current && previous.current !== id) navigate({kind:'view',view:'library'}, {replace:true});
    previous.current = id;
    setSettled({id});
  }, [id, loading]);
  // Do not mount a new account's reader even for a frame at the old URL.
  if (loading || !settled || settled.id !== id) return <div className="min-h-screen grid place-items-center" role="status">Checking session…</div>;
  return children;
}
