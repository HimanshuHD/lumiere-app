import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { textToChapters } from '../src/services/documentText.ts';

describe('textToChapters', () => {
  it('normalizes line endings and splits distinct sections', () => {
    assert.deepEqual(textToChapters(' First section \r\n\r\n\r\n Second section '), [
      { title: 'Section 1', content: 'First section' },
      { title: 'Section 2', content: 'Second section' },
    ]);
  });

  it('chunks long text without section breaks at paragraph boundaries', () => {
    const text = `${'a'.repeat(3000)}\n\n${'b'.repeat(2500)}`;
    assert.deepEqual(textToChapters(text), [
      { title: 'Section 1', content: 'a'.repeat(3000) },
      { title: 'Section 2', content: 'b'.repeat(2500) },
    ]);
  });
});
