import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textScrollRange, textScrollProgress } from '../src/features/reader/text/scroll.ts';
test('restoration and tracking use the same bounded window coordinates',()=>{
 const range=textScrollRange(112,3000,800,3112,112);
 assert.deepEqual(range,{start:0,length:2312});
 assert.equal(textScrollProgress(range.start+range.length*.6,range),.6);
 assert.equal(textScrollProgress(-100,range),0);assert.equal(textScrollProgress(9999,range),1);
});
test('short chapters and content offsets produce finite, bounded positions',()=>{
 assert.equal(textScrollProgress(0,textScrollRange(112,100,800,800,112)),0);
 assert.deepEqual(textScrollRange(400,1000,800,1400,112),{start:288,length:312});
});
