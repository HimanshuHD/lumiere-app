import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MutationGate } from '../src/features/data/mutation-gate.ts';
test('repeated controls share one mutation while unrelated items remain independent',async()=>{
 const gate=new MutationGate();let release!:()=>void,calls=0;
 const first=gate.run('bookmarks:a',async()=>{calls++;await new Promise<void>(r=>{release=r;});return true;});
 const second=gate.run('bookmarks:a',async()=>false);await Promise.resolve();assert.equal(first,second);assert.equal(calls,1);assert.equal(gate.getSnapshot().has('bookmarks:a'),true);
 assert.equal(await gate.run('bookmarks:b',async()=>2),2);release();assert.equal(await first,true);assert.equal(gate.getSnapshot().size,0);
});
test('rejections release the lock for retry, and disposed accounts cannot mutate',async()=>{
 const gate=new MutationGate();await assert.rejects(gate.run('a',async()=>{throw Error('offline');}));assert.equal(gate.getSnapshot().size,0);assert.equal(await gate.run('a',async()=>true),true);gate.dispose();await assert.rejects(gate.run('a',async()=>true),/session ended/);
});
