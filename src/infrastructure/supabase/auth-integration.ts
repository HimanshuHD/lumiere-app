import { toServiceError, attempt } from '@/domain/errors';
import { supabase } from './client';
import type { AuthSession } from '@/domain/auth';
const mapSession = (session: {user: AuthSession['user']} | null): AuthSession | null => session ? {user:session.user} : null;
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
  signInWithGoogle() { return attempt(async () => { const {error} = await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}}); if (error) throw error; }); },
  signOut() { return attempt(async () => { const {error} = await supabase.auth.signOut(); if (error) throw error; }); },
  changePassword(password: string) { return attempt(async () => { const {error} = await supabase.auth.updateUser({password}); if (error) throw error; }); },
};
