import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignedUrlSession } from '../src/features/documents/signed-url-session.ts';
import type { SignedUrlClock, SignedUrlState } from '../src/features/documents/signed-url-session.ts';
import type { SignedDocumentUrl } from '../src/domain/integrations.ts';
import { ServiceError, toServiceError } from '../src/domain/errors.ts';

function clock() {
  let now=0,id=0;
  const timers=new Map<number,{at:number;callback:()=>void}>();
  const value: SignedUrlClock={now:()=>now,
    setTimeout:(callback,delay)=>{const key=++id;timers.set(key,{at:now+delay,callback});return key as unknown as ReturnType<typeof setTimeout>;},
    clearTimeout:timer=>{timers.delete(timer as unknown as number);}};
  return {value,size:()=>timers.size,async advance(ms:number){const end=now+ms;
    while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      now=next[1].at;timers.delete(next[0]);next[1].callback();await settle();}
    now=end;await settle();
  }};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
const network=()=>new TypeError('Failed to fetch');
const link=(url='first',refreshAt=100,expiresAt=5000):SignedDocumentUrl=>({url,refreshAt,expiresAt});

test('transient refresh preserves unexpired access and reconnect replaces it without duplicate requests',async()=>{
 const time=clock(),states:SignedUrlState[]=[];let calls=0,complete!: (value:SignedDocumentUrl)=>void;
 const session=new SignedUrlSession(async()=>{calls++;if(calls===1)return link();if(calls===2)throw network();return new Promise(resolve=>{complete=resolve;});},s=>states.push(s),time.value);
 session.start();await settle();await time.advance(100);
 assert.equal(states.at(-1)?.url,'first');assert.equal(calls,2);
 session.reconnect();session.reconnect();assert.equal(calls,3);
 complete(link('second',10000,20000));await settle();
 assert.deepEqual(states.at(-1),{url:'second',error:null});
 await time.advance(5000);assert.equal(states.at(-1)?.url,'second');
 session.dispose();assert.equal(time.size(),0);
});
test('automatic retries are bounded; a later online event starts a new recovery cycle',async()=>{
 const time=clock(),states:SignedUrlState[]=[];let calls=0;
 const session=new SignedUrlSession(async()=>{calls++;throw network();},s=>states.push(s),time.value);
 session.start();await settle();await time.advance(60000);
 assert.equal(calls,4);assert.equal(time.size(),0);assert.equal(states.at(-1)?.url,null);
 session.reconnect();await settle();assert.equal(calls,5);session.dispose();
});
test('expiry clears the previous link even when its refresh request has not settled',async()=>{
 const time=clock(),states:SignedUrlState[]=[];let calls=0,complete!: (value:SignedDocumentUrl)=>void;
 const session=new SignedUrlSession(async()=>{calls++;if(calls===1)return link('first',50,200);return new Promise(resolve=>{complete=resolve;});},s=>states.push(s),time.value);
 session.start();await settle();await time.advance(50);assert.equal(calls,2);
 await time.advance(150);assert.equal(states.at(-1)?.url,null);
 complete(link('fresh',1000,2000));await settle();assert.equal(states.at(-1)?.url,'fresh');session.dispose();
});
test('permission failure clears existing access and is not retried on reconnect',async()=>{
 const time=clock(),states:SignedUrlState[]=[];let calls=0;
 const session=new SignedUrlSession(async()=>{calls++;if(calls===1)return link();throw {name:'StorageApiError',status:400,statusCode:'403',message:'Denied'};},s=>states.push(s),time.value);
 session.start();await settle();await time.advance(100);
 assert.equal(states.at(-1)?.url,null);assert.match(states.at(-1)?.error||'',/permission/);
 session.reconnect();await time.advance(60000);assert.equal(calls,2);assert.equal(time.size(),0);session.dispose();
});
test('disposal cancels retries and rejects late responses from the previous path',async()=>{
 const time=clock(),states:SignedUrlState[]=[];let complete!: (value:SignedDocumentUrl)=>void;
 const session=new SignedUrlSession(()=>new Promise(resolve=>{complete=resolve;}),s=>states.push(s),time.value);
 session.start();session.dispose();complete(link());await settle();assert.deepEqual(states,[]);assert.equal(time.size(),0);
 let calls=0;const retry=new SignedUrlSession(async()=>{calls++;throw network();},()=>{},time.value);
 retry.start();await settle();assert.equal(time.size(),1);retry.dispose();await time.advance(60000);assert.equal(calls,1);
});
test('already expired responses are never exposed as usable links',async()=>{
 const time=clock(),states:SignedUrlState[]=[];
 const session=new SignedUrlSession(async()=>link('expired',0,0),s=>states.push(s),time.value);
 session.start();await settle();assert.equal(states.at(-1)?.url,null);session.dispose();
});
test('storage-wrapped transport errors remain retryable while storage authorization stays denied',()=>{
 assert.equal(toServiceError({name:'StorageUnknownError',originalError:network()}).category,'network');
 assert.equal(toServiceError({name:'StorageApiError',status:400,statusCode:'403',message:'Denied'}).category,'permission');
 assert.equal(toServiceError({name:'AuthRetryableFetchError',status:0,message:'offline'}).category,'network');
 assert.equal(toServiceError(new ServiceError('permission','Denied')).category,'permission');
});
