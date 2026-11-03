import type { IntegrationPorts } from '@/domain/integrations';
import { authIntegration } from '@/infrastructure/supabase/auth-integration';
import { profileRepository } from '@/infrastructure/supabase/profile-repository';
import { preferencesStorage } from '@/infrastructure/browser/reader-preferences';
import { getSignedDocumentUrl } from '@/infrastructure/supabase/document-storage';
import { fetchCatalogFeed } from '@/infrastructure/supabase/catalog-feed';
export const integrations: IntegrationPorts = {
  auth: authIntegration, profile: profileRepository, preferences: preferencesStorage,
  documentUrl: getSignedDocumentUrl, catalogFeed: fetchCatalogFeed,
};
