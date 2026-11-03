import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePosition, textPosition, legacyPosition } from '../src/domain/reading-position.ts';
test('validates positions and bounds corrupt text positions', () => {
  assert.deepEqual(textPosition({version:1,format:'txt',chapterIndex:99,chapterProgress:Infinity}, 2), {version:1,format:'txt',chapterIndex:1,chapterProgress:0});
  assert.equal(textPosition(null, 0).chapterIndex, 0);
  assert.equal(parsePosition({version:2,format:'pdf'}), null);
  assert.equal(parsePosition({version:1,format:'epub',cfi:'broken'}), null);
  assert.deepEqual(parsePosition({version:1,format:'pdf',page:-3,view:{mode:'manual',scale:NaN}}), {version:1,format:'pdf',page:1,view:{mode:'width'}});
});
test('migrates legacy TXT and EPUB without pretending PDF percentage is a page', () => {
  assert.equal(legacyPosition('txt',{chapter_index:2,scroll_percent:.5})?.format,'txt');
  assert.equal(legacyPosition('epub',{chapter_index:0,scroll_percent:.5,epub_cfi:'epubcfi(/6/2!/4/2)'} )?.format,'epub');
  assert.equal(legacyPosition('pdf',{chapter_index:0,scroll_percent:.5}),null);
});
