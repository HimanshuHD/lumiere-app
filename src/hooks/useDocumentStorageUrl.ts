import { useEffect, useState } from 'react';
import { useIntegrations } from '@/shared/integrations';
import { SignedUrlSession, type SignedUrlState } from '@/features/documents';

export function useDocumentStorageUrl(
  storagePath: string | null | undefined,
  fallbackUrl?: string | null,
  enabled = true,
) {
  const { documentUrl } = useIntegrations();
  const key = enabled ? storagePath ? `storage:${storagePath}` : `fallback:${fallbackUrl || ''}` : 'disabled';
  const initial = { url: enabled && !storagePath ? fallbackUrl || null : null, error: null };
  const [state, setState] = useState<SignedUrlState & { key: string }>({ ...initial, key });

  useEffect(() => {
    if (!enabled || !storagePath) {
      setState({ key, url: enabled ? fallbackUrl || null : null, error: null });
      return;
    }
    setState({ key, url: null, error: null });
    const session = new SignedUrlSession(() => documentUrl(storagePath), next => setState({ ...next, key }));
    const reconnect = () => session.reconnect();
    window.addEventListener('online', reconnect);
    session.start();
    return () => {
      window.removeEventListener('online', reconnect);
      session.dispose();
    };
  }, [storagePath, fallbackUrl, enabled, documentUrl, key]);

  // Never expose a previous path's URL during the render before effect cleanup.
  return state.key === key ? { url: state.url, error: state.error } : initial;
}
