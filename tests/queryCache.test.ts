import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryCache } from '../src/features/data/query-cache.ts';
function deferred<T>() { let resolve!: (value:T)=>void;let reject!: (error:unknown)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
test('multiple consumers share one request and immutable published snapshots',async()=>{
 const d=deferred<number[]>();let calls=0,first=0,second=0;const cache=new QueryCache<number[]>([],async()=>{calls++;return d.promise;});
 cache.subscribe(()=>first++);cache.subscribe(()=>second++);const initial=cache.getSnapshot();const a=cache.load();const b=cache.load();assert.equal(a,b);
 d.resolve([1]);await a;assert.equal(calls,1);assert.equal(first,second);assert.notEqual(initial,cache.getSnapshot());assert.deepEqual(cache.getSnapshot().data,[1]);
});
test('late fetches cannot replace a mutation or a newer refresh',async()=>{
 const ds=[deferred<number[]>(),deferred<number[]>()];let n=0;const c=new QueryCache<number[]>([],()=>ds[n++].promise);
 const old=c.load().catch(()=>{});await Promise.resolve();const fresh=c.load(true);await Promise.resolve();ds[1].resolve([2]);await fresh;ds[0].resolve([1]);await old;assert.deepEqual(c.getSnapshot().data,[2]);
 c.invalidate();const d=deferred<number[]>();const x=new QueryCache<number[]>([],()=>d.promise);const request=x.load().catch(()=>{});await Promise.resolve();x.set([3]);d.resolve([1]);await request;assert.deepEqual(x.getSnapshot().data,[3]);
});
test('failed refresh retains confirmed data and exposes retry; disposed sessions ignore results',async()=>{
 let fail=false;const c=new QueryCache<number[]>([],async()=>{if(fail)throw {message:'offline'};return [1];});await c.load();fail=true;await assert.rejects(c.load(true));assert.equal(c.getSnapshot().error,'offline');assert.deepEqual(c.getSnapshot().data,[1]);fail=false;await c.load();assert.equal(c.getSnapshot().status,'success');
 const d=deferred<number[]>();const old=new QueryCache<number[]>([],()=>d.promise);const request=old.load().catch(()=>{});await Promise.resolve();old.dispose();d.resolve([9]);await request;assert.deepEqual(old.getSnapshot().data,[]);
});
