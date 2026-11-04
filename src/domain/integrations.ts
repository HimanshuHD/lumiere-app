import type { ServiceResult } from './errors.ts';
import type { AuthSession } from './auth.ts';
import type { OpdsFeedResult } from './catalog.ts';
import type { ReaderSettings } from './reader-preferences.ts';
export interface AuthPort {
  getSession(): Promise<AuthSession | null>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
  signUp(email: string, password: string): Promise<ServiceResult<void>>;
  signIn(email: string, password: string): Promise<ServiceResult<void>>;
  signInWithGoogle(): Promise<ServiceResult<void>>;
  signOut(): Promise<ServiceResult<void>>;
  changePassword(password: string): Promise<ServiceResult<void>>;
}
export interface ProfilePort {
  get(id: string): Promise<{ full_name: string | null; avatar_url: string | null } | null>;
  saveName(id: string, name: string): Promise<void>;
  saveAvatar(id: string, file: File): Promise<string>;
}
export interface PreferencesPort { read(): unknown; write(settings: ReaderSettings): void }
export interface SignedDocumentUrl { url: string; refreshAt: number; expiresAt: number }
export interface IntegrationPorts {
  auth: AuthPort;
  profile: ProfilePort;
  preferences: PreferencesPort;
  documentUrl(path: string): Promise<SignedDocumentUrl>;
  catalogFeed(url: string, challenge: () => Promise<string>, signal?: AbortSignal): Promise<OpdsFeedResult>;
}
