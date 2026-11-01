import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DocumentValidationError,
  MAX_COVER_SIZE_BYTES,
  MAX_DOCUMENT_SIZE_BYTES,
  getCoverContentType,
  getDocumentContentType,
  validateCoverFile,
  validateDocumentFile,
} from '../src/services/documentValidation.ts';

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
  return new File([bytes], 'book.epub', { type: 'application/epub+zip' });
}

describe('validateDocumentFile', () => {
  it('accepts supported document formats based on content', async () => {
    assert.equal(await validateDocumentFile(
      new File(['%PDF-1.7'], 'book.pdf', { type: 'text/plain' })
    ), 'pdf');
    assert.equal(await validateDocumentFile(makeEpubFile()), 'epub');
    assert.equal(await validateDocumentFile(
      new File(['Readable UTF-8 text'], 'book.txt', { type: 'application/pdf' })
    ), 'txt');
  });

  it('rejects unsupported extensions and content that does not match the extension', async () => {
    await assert.rejects(
      validateDocumentFile(new File(['%PDF-1.7'], 'book.txt')),
      DocumentValidationError,
    );
    await assert.rejects(
      validateDocumentFile(new File(['not a PDF'], 'book.pdf', { type: 'application/pdf' })),
      /contents do not match/,
    );
    await assert.rejects(
      validateDocumentFile(new File(['data'], 'book.exe')),
      /Choose a PDF, TXT, or EPUB/,
    );
  });

  it('rejects empty, whitespace-only, invalid UTF-8, and binary text files', async () => {
    await assert.rejects(validateDocumentFile(new File([], 'empty.txt')), /empty/);
    await assert.rejects(validateDocumentFile(new File([' \r\n\t'], 'blank.txt')), /no readable text/);
    await assert.rejects(
      validateDocumentFile(new File([new Uint8Array([0xc3, 0x28])], 'invalid.txt')),
      /not valid UTF-8/,
    );
    await assert.rejects(
      validateDocumentFile(new File([new Uint8Array([0x61, 0x00, 0x62])], 'binary.txt')),
      /binary data/,
    );
  });

  it('enforces the document size limit', async () => {
    const oversizedFile = {
      name: 'large.pdf',
      size: MAX_DOCUMENT_SIZE_BYTES + 1,
    } as File;
    await assert.rejects(validateDocumentFile(oversizedFile), /50 MB or smaller/);
  });

  it('returns server-approved content types for validated document formats', () => {
    assert.equal(getDocumentContentType('pdf'), 'application/pdf');
    assert.equal(getDocumentContentType('txt'), 'text/plain');
    assert.equal(getDocumentContentType('epub'), 'application/epub+zip');
  });
});

describe('validateCoverFile', () => {
  it('accepts image signatures and requires the filename extension to match', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'cover.jpg');
    const png = new File([new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])], 'cover.png');
    const webp = new File([new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ])], 'cover.webp');
    const gif = new File(['GIF89a'], 'cover.gif');

    assert.equal(await validateCoverFile(jpeg), 'jpeg');
    assert.equal(await validateCoverFile(png), 'png');
    assert.equal(await validateCoverFile(webp), 'webp');
    assert.equal(await validateCoverFile(gif), 'gif');
    assert.equal(getCoverContentType('jpeg'), 'image/jpeg');
  });

  it('rejects empty, oversized, and spoofed cover files', async () => {
    await assert.rejects(validateCoverFile(new File([], 'cover.png')), /empty/);
    const oversizedCover = {
      name: 'cover.jpg',
      size: MAX_COVER_SIZE_BYTES + 1,
    } as File;
    await assert.rejects(validateCoverFile(oversizedCover), /5 MB or smaller/);
    await assert.rejects(
      validateCoverFile(new File(['not an image'], 'cover.jpg', { type: 'image/jpeg' })),
      /contents must match/,
    );
    await assert.rejects(
      validateCoverFile(new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.png')),
      /contents must match/,
    );
  });
});
