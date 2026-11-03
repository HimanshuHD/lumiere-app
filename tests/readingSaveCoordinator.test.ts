import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveCoordinator } from '../src/features/reader/progress/save-coordinator.ts';
import type { PendingSave, ProgressRow, SaveResult } from '../src/domain/progress.ts';
const position = (page: number) => ({version:1 as const,format:'pdf' as const,page,view:{mode:'width' as const}});
const row = (p: PendingSave): ProgressRow => ({id:'row',user_id:'user',document_id:'doc',chapter_index:0,scroll_percent:p.progress,position:p.position,revision:p.expectedRevision+1,mutation_id:p.mutationId,updated_at:''});
function storage() {
  const data = new Map<string, PendingSave>();
  return { data, read:(id:string)=>data.get(id), write:(id:string,p:PendingSave)=>{data.set(id,structuredClone(p));}, remove:(id:string,mutation:string)=>{if(data.get(id)?.mutationId===mutation)data.delete(id);},documentIds:()=>[...data.keys()] };
}
test('serializes writes, coalesces intermediate actions, and allows intentional backwards navigation', async () => {
  const disk=storage(); const calls: PendingSave[]=[]; let release!: (r:SaveResult)=>void;
  const queue=new SaveCoordinator(disk,async (_id,p)=>{calls.push(structuredClone(p)); if(calls.length===1)return new Promise(r=>{release=r;}); return {accepted:true,row:row(p)};});
  queue.hydrate([]); queue.record('doc',position(8),0,.8); const flushed=queue.flush('doc');
  queue.record('doc',position(9),0,.9); queue.record('doc',position(3),0,.3);
  assert.equal(calls.length,1); release({accepted:true,row:row(calls[0])}); await flushed;
  assert.equal(calls.length,2); assert.equal(calls[1].expectedRevision,1);
  assert.equal((calls[1].position as {page:number}).page,3); assert.equal(disk.data.size,0);
  assert.equal(queue.snapshot('doc').status,'saved');
});
test('failed saves survive a new coordinator and replay after reconnect',async()=>{
  const disk=storage(); const first=new SaveCoordinator(disk,async()=>{throw new Error('offline');});
  first.hydrate([]); first.record('doc',position(4),0,.4); await first.flush('doc');
  assert.equal(first.snapshot('doc').status,'error'); assert.equal(disk.data.size,1);
  const next=new SaveCoordinator(disk,async(_id,p)=>({accepted:true,row:row(p)}));next.hydrate([]);
  assert.equal((next.snapshot('doc').pending?.position as {page:number}).page,4);
  await next.flushAll();assert.equal(disk.data.size,0);
});
test('conflicts never automatically overwrite another session and explicit retry uses latest revision',async()=>{
  const disk=storage(); let calls=0;
  const queue=new SaveCoordinator(disk,async(_id,p)=>{calls++;return calls===1?{accepted:false,row:{...row(p),revision:8}}:{accepted:true,row:row(p)};});
  queue.hydrate([]);queue.record('doc',position(2),0,.2);await queue.flush('doc');
  assert.equal(queue.snapshot('doc').status,'conflict');await queue.flushAll();assert.equal(calls,1);
  await queue.retry('doc');assert.equal(queue.snapshot('doc').row?.revision,9);
});
test('a lost acknowledgement is removed on hydration and storage failures are exposed',async()=>{
  const disk=storage();const first=new SaveCoordinator(disk,async()=>{throw Error('response lost');});
  first.hydrate([]);first.record('doc',position(2),0,.2);await first.flush('doc');const pending=disk.data.get('doc')!;
  const next=new SaveCoordinator(disk,async()=>{throw Error('must not send');});next.hydrate([row(pending)]);assert.equal(next.snapshot('doc').pending,undefined);
  const blocked=new SaveCoordinator({...disk,write:()=>{throw Error('denied');}},async(_id,p)=>({accepted:true,row:row(p)}));
  blocked.hydrate([]);blocked.record('doc',position(3),0,.3);assert.equal(blocked.snapshot('doc').storageError,true);await blocked.flushAll();
});
test('stale fetches do not replace acknowledged session state; pre-load events cannot save',async()=>{
 const disk=storage();const queue=new SaveCoordinator(disk,async(_id,p)=>({accepted:true,row:row(p)}));
 queue.record('doc',position(1),0,0);assert.equal(disk.data.size,0);queue.hydrate([]);queue.record('doc',position(5),0,.5);await queue.flushAll();queue.hydrate([]);assert.equal(queue.snapshot('doc').row?.revision,1);
});
test('refresh cannot overwrite pending positions and deleted documents cannot replay after acknowledgement',async()=>{
 const disk=storage();let release!: (value:SaveResult)=>void;
 const queue=new SaveCoordinator(disk,async()=>new Promise(resolve=>{release=resolve;}));queue.hydrate([]);
 queue.record('doc',position(8),0,.8);const pending=queue.snapshot('doc').pending!;
 queue.reconcile([{...row(pending),position:position(1),revision:99}]);assert.equal((queue.snapshot('doc').pending?.position as {page:number}).page,8);
 const running=queue.flush('doc');queue.forget('doc');release({accepted:true,row:row(pending)});await running;
 assert.equal(disk.data.size,0);assert.equal(queue.rows().length,0);queue.record('doc',position(2),0,.2);assert.equal(disk.data.size,0);
});
test('ending an account stops queued writes while retaining durable replay for that account',async()=>{
 const disk=storage();let calls=0;const queue=new SaveCoordinator(disk,async(_id,p)=>{calls++;return {accepted:true,row:row(p)};});queue.hydrate([]);queue.record('doc',position(3),0,.3);queue.dispose();await queue.flushAll();assert.equal(calls,0);assert.equal(disk.data.size,1);assert.equal(queue.rows().length,0);
});
