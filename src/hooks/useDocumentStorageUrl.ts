import { useEffect, useState } from 'react';
import { supabase } from '@/infrastructure/supabase/client';
import { getSignedUrlRefreshDelay } from './documentStorageUrlRefresh';

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

async function getSignedDocumentUrl(storagePath: string): Promise<SignedUrlResult> {
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

export function useDocumentStorageUrl(
  storagePath: string | null | undefined,
  fallbackUrl?: string | null,
  enabled = true,
) {
  const [url, setUrl] = useState<string | null>(fallbackUrl || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!enabled) {
      setUrl(null);
      setError(null);
      return () => {
        active = false;
      };
    }

    if (!storagePath) {
      setUrl(fallbackUrl || null);
      setError(null);
      return () => {
        active = false;
      };
    }

    const loadSignedUrl = async () => {
      try {
        const { url: signedUrl, refreshAt } = await getSignedDocumentUrl(storagePath);
        if (!active) return;
        setUrl(signedUrl);
        setError(null);
        refreshTimer = setTimeout(
          () => void loadSignedUrl(),
          getSignedUrlRefreshDelay(refreshAt),
        );
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
  }, [storagePath, fallbackUrl, enabled]);

  return { url, error };
}
