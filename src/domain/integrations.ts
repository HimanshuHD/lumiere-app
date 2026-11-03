import type { AuthSession } from './auth.ts';
import type { OpdsFeedResult } from './catalog.ts';
import type { ReaderSettings } from './reader-preferences.ts';
export interface AuthPort {
  getSession(): Promise<AuthSession | null>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
  signUp(email: string, password: string): Promise<{ error: string | null }>;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signInWithGoogle(): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  changePassword(password: string): Promise<void>;
}
export interface ProfilePort {
  get(id: string): Promise<{ full_name: string | null; avatar_url: string | null } | null>;
  saveName(id: string, name: string): Promise<void>;
  saveAvatar(id: string, file: File): Promise<string>;
}
export interface PreferencesPort { read(): unknown; write(settings: ReaderSettings): void }
export interface IntegrationPorts {
  auth: AuthPort;
  profile: ProfilePort;
  preferences: PreferencesPort;
  documentUrl(path: string): Promise<{ url: string; refreshAt: number }>;
  catalogFeed(url: string, challenge: () => Promise<string>, signal?: AbortSignal): Promise<OpdsFeedResult>;
}
