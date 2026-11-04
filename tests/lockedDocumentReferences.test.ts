import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { Document } from '../src/domain/documents.ts';
import { attachLockedDocumentReferences } from '../src/services/lockedDocumentReferences.ts';

it('hydrates denied joins with redacted entries without replacing readable documents', () => {
  const locked = { id: 'locked', chapters: [], summary: '', visibility: 'private' } as unknown as Document;
  const readable = { id: 'readable', chapters: [{ content: 'Owner content' }] } as unknown as Document;
  const result = attachLockedDocumentReferences([
    { document_id: 'locked', document: null },
    { document_id: 'readable', document: readable },
    { document_id: 'missing', document: null },
  ], [locked, { ...readable, chapters: [] }]);
  assert.equal(result[0].document, locked);
  assert.equal(result[1].document, readable);
  assert.equal(result[2].document, undefined);
  assert.deepEqual(result[0].document?.chapters, []);
});
