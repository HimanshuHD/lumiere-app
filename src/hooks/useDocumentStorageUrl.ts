import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const SIGNED_URL_TTL_SECONDS = 900;
const SIGNED_URL_REFRESH_MS = 720_000;

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
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
        if (error) throw error;
        if (!active) return;
        setUrl(data.signedUrl);
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
