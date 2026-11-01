import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_COVER_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES } from '../src/services/documentValidation.ts';
import { validateUserUpload } from '../supabase/functions/_shared/user_upload_validation.ts';

const userId = '51000000-0000-4000-8000-000000000001';
const operationId = '52000000-0000-4000-8000-000000000001';

function makeEpubFile(): File {
  const bytes = new Uint8Array(58);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  const view = new DataView(bytes.buffer);
  view.setUint16(8, 0, true);
  view.setUint32(18, 20, true);
  view.setUint32(22, 20, true);
  view.setUint16(26, 8, true);
  bytes.set(new TextEncoder().encode('mimetype'), 30);
  bytes.set(new TextEncoder().encode('application/epub+zip'), 38);
  return new File([bytes], 'book.epub');
}

describe('validateUserUpload', () => {
  it('validates document bytes and derives trusted storage content types', async () => {
    assert.deepEqual(
      await validateUserUpload(
        userId,
        `${userId}/${operationId}.pdf`,
        new File(['%PDF-1.7'], 'book.pdf', { type: 'text/plain' }),
      ),
      { kind: 'document', format: 'pdf', contentType: 'application/pdf' },
    );
    assert.deepEqual(
      await validateUserUpload(
        userId,
        `${userId}/${operationId}.epub`,
        makeEpubFile(),
      ),
      { kind: 'document', format: 'epub', contentType: 'application/epub+zip' },
    );
    assert.deepEqual(
      await validateUserUpload(
        userId,
        `${userId}/${operationId}.txt`,
        new File(['Valid UTF-8 text'], 'book.txt'),
      ),
      { kind: 'document', format: 'txt', contentType: 'text/plain' },
    );
  });

  it('validates cover bytes and storage path extensions', async () => {
    assert.deepEqual(
      await validateUserUpload(
        userId,
        `${userId}/${operationId}-cover.jpg`,
        new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'cover.jpg'),
      ),
      { kind: 'cover', format: 'jpeg', contentType: 'image/jpeg' },
    );
    await assert.rejects(
      validateUserUpload(
        userId,
        `${userId}/${operationId}-cover.png`,
        new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'cover.jpg'),
      ),
      /storage path extension/,
    );
  });

  it('rejects paths outside the authenticated user folder and malformed paths', async () => {
    const pdf = new File(['%PDF-1.7'], 'book.pdf');
    await assert.rejects(
      validateUserUpload(userId, `51000000-0000-4000-8000-000000000002/${operationId}.pdf`, pdf),
      /signed-in user's storage folder/,
    );
    await assert.rejects(
      validateUserUpload(userId, `${userId}/../${operationId}.pdf`, pdf),
      /signed-in user's storage folder/,
    );
    await assert.rejects(
      validateUserUpload(userId, `${userId}/nested/${operationId}.pdf`, pdf),
      /signed-in user's storage folder/,
    );
    await assert.rejects(
      validateUserUpload(userId, `${userId}/untracked.pdf`, pdf),
      /operation ID/,
    );
  });

  it('rejects unsupported, invalid, and oversized file contents', async () => {
    await assert.rejects(
      validateUserUpload(
        userId,
        `${userId}/${operationId}.pdf`,
        new File(['not a PDF'], 'book.pdf'),
      ),
      /contents do not match/,
    );
    await assert.rejects(
      validateUserUpload(
        userId,
        `${userId}/${operationId}-cover.jpg`,
        new File(['not an image'], 'cover.jpg'),
      ),
      /contents must match/,
    );
    await assert.rejects(
      validateUserUpload(
        userId,
        `${userId}/${operationId}.pdf`,
        { name: 'book.pdf', size: MAX_DOCUMENT_SIZE_BYTES + 1 } as File,
      ),
      /50 MB or smaller/,
    );
    await assert.rejects(
      validateUserUpload(
        userId,
        `${userId}/${operationId}-cover.jpg`,
        { name: 'cover.jpg', size: MAX_COVER_SIZE_BYTES + 1 } as File,
      ),
      /5 MB or smaller/,
    );
  });
});
