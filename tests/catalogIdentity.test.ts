import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCatalogSourceIdentity } from '../supabase/functions/opds-fetch/catalog_identity.ts';

describe('getCatalogSourceIdentity', () => {
  it('distinguishes different editions of a Gutenberg title', () => {
    const firstEdition = getCatalogSourceIdentity(
      'https://www.gutenberg.org/ebooks/1342',
      new URL('https://www.gutenberg.org/cache/epub/1342/pg1342-images.epub'),
      'epub',
    );
    const alternateEdition = getCatalogSourceIdentity(
      'https://www.gutenberg.org/ebooks/1342',
      new URL('https://www.gutenberg.org/cache/epub/1342/pg1342.epub'),
      'epub',
    );

    assert.notEqual(firstEdition, alternateEdition);
    assert.equal(
      firstEdition,
      'project-gutenberg:1342:epub:/cache/epub/1342/pg1342-images.epub',
    );
  });

  it('distinguishes formats for the same catalog edition path', () => {
    const downloadUrl = new URL('https://www.gutenberg.org/cache/epub/1342/pg1342.pdf');

    assert.notEqual(
      getCatalogSourceIdentity('https://www.gutenberg.org/ebooks/1342', downloadUrl, 'pdf'),
      getCatalogSourceIdentity('https://www.gutenberg.org/ebooks/1342', downloadUrl, 'epub'),
    );
  });

  it('uses origin and edition path for catalogs without Gutenberg IDs', () => {
    assert.equal(
      getCatalogSourceIdentity(
        'https://catalog.example/book/edition/2',
        new URL('https://catalog.example/downloads/book-2.epub?token=short-lived'),
        'epub',
      ),
      'https://catalog.example/downloads/book-2.epub:epub',
    );
  });
});
