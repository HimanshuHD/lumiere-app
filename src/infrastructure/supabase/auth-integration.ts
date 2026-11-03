import { toServiceError } from '@/domain/errors';
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
  async signUp(email:string,password:string) {const {error}=await supabase.auth.signUp({email,password});return {error:error?.message??null};},
  async signIn(email:string,password:string) {const {error}=await supabase.auth.signInWithPassword({email,password});return {error:error?.message??null};},
  async signInWithGoogle() {const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});return {error:error?.message??null};},
  async signOut() {const {error}=await supabase.auth.signOut();if(error)throw toServiceError(error);},
  async changePassword(password:string) {const {error}=await supabase.auth.updateUser({password});if(error)throw toServiceError(error);},
};
