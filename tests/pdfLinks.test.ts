import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safePdfUrl, destinationPage} from '../src/features/reader/pdf/pdf-links.ts';
test('PDF external links allow web/email destinations without script, file or embedded credentials',()=>{
  assert.equal(safePdfUrl('https://example.test/book'),'https://example.test/book');
  assert.equal(safePdfUrl('mailto:reader@example.test'),'mailto:reader@example.test');
  for(const value of ['javascript:alert(1)','data:text/html,hello','file:///secret','https://user:pass@example.test','//example.test',null])assert.equal(safePdfUrl(value),null);
});
test('PDF destination resolution handles names, references and zero-based page numbers',async()=>{
  const document={numPages:3,getDestination:async()=>[{num:9,gen:0},{name:'Fit'}],getPageIndex:async()=>2};
  assert.equal(await destinationPage(document as never,'chapter'),3);
  assert.equal(await destinationPage(document as never,[0,{name:'Fit'}]),1);
  for(const value of [null,[],[-1],[3],[1.5],[{}]])assert.equal(await destinationPage(document as never,value),null);
});
