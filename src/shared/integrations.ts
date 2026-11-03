import { createContext, useContext } from 'react';
import type { IntegrationPorts } from '@/domain/integrations';
export const IntegrationContext = createContext<IntegrationPorts | null>(null);
export function useIntegrations(): IntegrationPorts {
  const ports = useContext(IntegrationContext);
  if (!ports) throw new Error('Application integrations are unavailable.');
  return ports;
}
