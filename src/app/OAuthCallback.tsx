import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth';
import { consumeOAuthReturn } from '@/infrastructure/browser/oauth-return';
import { parseRoute } from '@/domain/navigation';
import { appBase, navigate } from './navigation';

export function OAuthCallback() {
  const {user} = useAuth();
  const handled = useRef(false);
  const failed = new URLSearchParams(window.location.search).has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error');
  const resume = () => {
    let path: string | null = null;
    try { path = consumeOAuthReturn(window.sessionStorage, appBase); } catch { /* Fall back to library. */ }
    const route = path ? parseRoute(path, appBase) : {kind:'view' as const, view:'library' as const};
    navigate(route.kind === 'view' || route.kind === 'reader' ? route : {kind:'view',view:'library'}, {replace:true});
  };
  useEffect(() => {
    if (user && !failed && !handled.current) { handled.current = true; resume(); }
  }, [user, failed]);
  if (user && !failed) return <p className="p-12 text-center" role="status">Completing sign-in…</p>;
  return <section className="max-w-3xl mx-auto px-4 py-24 text-center">
    <h1 className="text-2xl font-serif font-bold" role="alert">Sign-in could not be completed</h1>
    <p className="mt-3">Please try signing in again.</p>
    <button className="mt-6 underline" onClick={resume}>Return to sign in</button>
  </section>;
}
