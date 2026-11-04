import { ServiceError, toServiceError } from '@/domain/errors';
import type { SignedDocumentUrl } from '@/domain/integrations';
import { supabase } from './client';
const SIGNED_URL_TTL_SECONDS = 900;
const SIGNED_URL_REFRESH_MS = 720_000;

interface SignedUrlCacheEntry {
  promise: Promise<string>;
  refreshAt: number;
  expiresAt: number;
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

export async function getSignedDocumentUrl(storagePath: string): Promise<SignedDocumentUrl> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw toServiceError(sessionError);
  const userId = sessionData.session?.user.id;
  if (!userId) throw new ServiceError('permission', 'Sign in to access this document file.');

  const cacheKey = `${userId}:${storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.refreshAt) {
    return { url: await cached.promise, refreshAt: cached.refreshAt, expiresAt: cached.expiresAt };
  }

  const entry: SignedUrlCacheEntry = {
    refreshAt: Number.POSITIVE_INFINITY,
    // Start before the request and allow for JWT whole-second rounding.
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - 1000,
    promise: supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error) throw error;
        entry.refreshAt = Date.now() + SIGNED_URL_REFRESH_MS;
        return data.signedUrl;
      })
      .catch((error: unknown) => {
        if (signedUrlCache.get(cacheKey) === entry) signedUrlCache.delete(cacheKey);
        throw toServiceError(error);
      }),
  };
  signedUrlCache.set(cacheKey, entry);
  return { url: await entry.promise, refreshAt: entry.refreshAt, expiresAt: entry.expiresAt };
}

