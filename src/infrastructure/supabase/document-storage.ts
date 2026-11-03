import { supabase } from './client';
const SIGNED_URL_TTL_SECONDS = 900;
const SIGNED_URL_REFRESH_MS = 720_000;

interface SignedUrlCacheEntry {
  promise: Promise<string>;
  refreshAt: number;
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

interface SignedUrlResult {
  url: string;
  refreshAt: number;
}

export async function getSignedDocumentUrl(storagePath: string): Promise<SignedUrlResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Sign in to access this document file.');

  const cacheKey = `${userId}:${storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.refreshAt) {
    return { url: await cached.promise, refreshAt: cached.refreshAt };
  }

  const entry: SignedUrlCacheEntry = {
    refreshAt: Number.POSITIVE_INFINITY,
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
        throw error;
      }),
  };
  signedUrlCache.set(cacheKey, entry);
  return { url: await entry.promise, refreshAt: entry.refreshAt };
}

