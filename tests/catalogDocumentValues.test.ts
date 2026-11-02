import assert from 'node:assert/strict';
import test from 'node:test';
import { getCatalogDocumentWriteValues } from '../supabase/functions/_shared/catalog_document_values.ts';

test('preserves existing legacy document IDs during restoration and assigns the operation ID only on insert', () => {
  const values = {
    title: 'Restored catalog title',
    source_identity: 'catalog:item:epub',
    file_storage_path: 'catalog/restored.epub',
  };
  const writes = getCatalogDocumentWriteValues('new-operation-id', values);

  assert.deepEqual(writes.update, values);
  assert.equal('id' in writes.update, false);
  assert.deepEqual(writes.insert, {
    id: 'new-operation-id',
    ...values,
  });
});
