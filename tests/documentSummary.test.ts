import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_SUMMARY_FIELDS } from '../src/infrastructure/supabase/document-fields.ts';
import { summarizeDocument } from '../src/domain/document-summary.ts';
import { readingProgressPercent } from '../src/lib/readingProgressPercent.ts';
import type { Document, ReadingProgress } from '../src/domain/documents.ts';
test('summary projection and conversion exclude chapter bodies',()=>{
 assert.equal(DOCUMENT_SUMMARY_FIELDS.split(',').includes('chapters'),false);
 const summary=summarizeDocument({id:'doc',chapters:[{title:'Chapter',content:'Private text'}]} as Document);
 assert.equal(summary.chapter_count,1);assert.equal('chapters' in summary,false);assert.equal(JSON.stringify(summary).includes('Private text'),false);
});
test('list progress uses typed positions and chapter counts without content',()=>{
 const summary=summarizeDocument({id:'doc',file_format:'txt',chapters:Array(4).fill({title:'',content:''})} as Document);
 const progress={chapter_index:2,scroll_percent:.625,position:{version:1,format:'txt',chapterIndex:2,chapterProgress:.5}} as ReadingProgress;
 assert.equal(readingProgressPercent(summary,progress),63);
 assert.equal(readingProgressPercent({...summary,chapter_count:0},{...progress,position:null,chapter_index:0,scroll_percent:0}),0);
 assert.equal(readingProgressPercent({...summary,file_format:'pdf'},{...progress,position:null,scroll_percent:.5}),50);
});
