import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const SIGNED_URL_TTL_SECONDS = 900;
const SIGNED_URL_REFRESH_MS = 720_000;

interface SignedUrlCacheEntry {
  promise: Promise<string>;
  expiresAt: number;
}

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

async function getSignedDocumentUrl(storagePath: string): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Sign in to access this document file.');

  const cacheKey = `${userId}:${storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.promise;

  const entry: SignedUrlCacheEntry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error) throw error;
        entry.expiresAt = Date.now() + SIGNED_URL_REFRESH_MS;
        return data.signedUrl;
      })
      .catch((error: unknown) => {
        if (signedUrlCache.get(cacheKey) === entry) signedUrlCache.delete(cacheKey);
        throw error;
      }),
  };
  signedUrlCache.set(cacheKey, entry);
  return entry.promise;
}

export function useDocumentStorageUrl(storagePath: string | null | undefined, fallbackUrl?: string | null) {
  const [url, setUrl] = useState<string | null>(fallbackUrl || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!storagePath) {
      setUrl(fallbackUrl || null);
      setError(null);
      return () => {
        active = false;
      };
    }

    const loadSignedUrl = async () => {
      try {
        const signedUrl = await getSignedDocumentUrl(storagePath);
        if (!active) return;
        setUrl(signedUrl);
        setError(null);
        refreshTimer = setTimeout(() => void loadSignedUrl(), SIGNED_URL_REFRESH_MS);
      } catch (error) {
        if (!active) return;
        console.error('Failed to authorize document storage access:', error);
        setUrl(null);
        setError('You do not have permission to access this document file, or its access link expired.');
      }
    };

    setUrl(null);
    setError(null);
    void loadSignedUrl();

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [storagePath, fallbackUrl]);

  return { url, error };
}
