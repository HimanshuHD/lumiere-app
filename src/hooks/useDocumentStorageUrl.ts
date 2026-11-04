import { useEffect, useState } from 'react';
import { useIntegrations } from '@/shared/integrations';
import { getSignedUrlRefreshDelay } from './documentStorageUrlRefresh';

export function useDocumentStorageUrl(
  storagePath: string | null | undefined,
  fallbackUrl?: string | null,
  enabled = true,
) {
  const { documentUrl: getSignedDocumentUrl } = useIntegrations();
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
  }, [storagePath, fallbackUrl, enabled, getSignedDocumentUrl]);

  return { url, error };
}
