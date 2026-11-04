import { toServiceError, attempt } from '@/domain/errors';
import { supabase } from './client';
import type { AuthSession } from '@/domain/auth';
import { rememberOAuthReturn, clearOAuthReturn } from '../browser/oauth-return';
import { routePath } from '@/domain/navigation';
const mapSession = (session: {user: AuthSession['user']} | null): AuthSession | null => session ? {
  user: { id: session.user.id, email: session.user.email,
    user_metadata: session.user.user_metadata, app_metadata: session.user.app_metadata },
} : null;
export const authIntegration = {
  async getSession() {
    const {data,error}=await supabase.auth.getSession(); if(error)throw toServiceError(error);return mapSession(data.session);
  },
  subscribe(listener:(session:AuthSession|null)=>void) {
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>listener(mapSession(session)));
    return ()=>data.subscription.unsubscribe();
  },
  signUp(email: string, password: string) { return attempt(async () => { const {error} = await supabase.auth.signUp({email,password}); if (error) throw error; }); },
  signIn(email: string, password: string) { return attempt(async () => { const {error} = await supabase.auth.signInWithPassword({email,password}); if (error) throw error; }); },
  signInWithGoogle() { return attempt(async () => {
    const base = import.meta.env.BASE_URL;
    try { rememberOAuthReturn(window.sessionStorage, window.location.pathname, base); }
    catch { throw new Error('Sign-in return storage is unavailable. Allow session storage or use email sign-in.'); }
    const {error} = await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL(routePath({kind:'callback'},base),window.location.origin).href}});
    if (error) { clearOAuthReturn(window.sessionStorage, base); throw error; }
  }); },
  signOut() { return attempt(async () => { const {error} = await supabase.auth.signOut(); if (error) throw error; }); },
  changePassword(password: string) { return attempt(async () => { const {error} = await supabase.auth.updateUser({password}); if (error) throw error; }); },
};
