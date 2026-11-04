import { mapDocument } from './mappers';
import { supabase } from '@/infrastructure/supabase/client';
import type { CatalogImportRequest, CatalogImportStore } from '@/services/catalogImport';

export const supabaseCatalogImportStore: CatalogImportStore = {
  async importOrReuseDocument(request: CatalogImportRequest) {
    const { data, error } = await supabase.functions.invoke<unknown>('opds-fetch', {
      body: { action: 'import', ...request },
    });
    if (error) {
      let detail = error.message;
      if (error.context instanceof Response) {
        const responseBody: unknown = await error.context.clone().json().catch(() => null);
        if (
          typeof responseBody === 'object'
          && responseBody !== null
          && 'error' in responseBody
          && typeof responseBody.error === 'string'
        ) {
          detail = responseBody.error;
        }
      }
      throw new Error(`Could not import catalog book: ${detail}`);
    }
    return mapDocument(data);
  },
};
