import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {decodeHash, safeRoute, rememberReturn, consumeReturn, routeHash, BASE, fixtureId} from '../spikes/pages-contract/site/assets/probe.js';

const store = () => {
  const items = new Map<string,string>();
  return {getItem:(k:string)=>items.get(k)??null, setItem:(k:string,v:string)=>{items.set(k,v);},removeItem:(k:string)=>{items.delete(k);}};
};
test('fixed project base and synthetic UUID', () => {
  assert.equal(BASE,'/lumiere-app/');
  assert.equal(safeRoute('/read/'+fixtureId),'/read/'+fixtureId);
  assert.equal(decodeHash('#/read/'+fixtureId),'/read/'+fixtureId);
});
test('known hash routes and absent fragments', () => {
  for(const r of ['/','/bookmarks','/reading-list','/upload','/profile','/my-uploads','/documents','/admin/catalog']) {
    assert.equal(decodeHash(routeHash(r)),r);
  }
  assert.equal(decodeHash(''),'/');
  assert.equal(decodeHash('#'),'/');
});
test('reject external, malformed and unrecognized return destinations', () => {
  for(const p of ['https://evil.example/','//evil.example','/\\evil','/auth/callback','/read/bad','/read/'+fixtureId+'?next=//evil','/profile#x','/../profile','/%2e%2e/profile','/unknown','/lumiere-app/profile']) {
    assert.equal(safeRoute(p),null,p);
  }
  assert.equal(decodeHash('#/read/bad'),null);
  assert.equal(decodeHash('#https://evil.example/'),null);
});
test('one-use same-tab return and expiration', () => {
  const storage=store(),now=1770000000000;
  assert.equal(rememberReturn(storage,'/read/'+fixtureId,'state',now),true);
  assert.equal(consumeReturn(storage,'state',now+1000),'/read/'+fixtureId);
  assert.equal(consumeReturn(storage,'state',now+1001),null);
  assert.equal(rememberReturn(storage,'/profile','state',now),true);
  assert.equal(consumeReturn(storage,'state',now+600001),null);
  assert.equal(rememberReturn(storage,'/profile','state',now),true);
  assert.equal(consumeReturn(storage,'state',now-1),null);
});
test('wrong tab and unavailable storage fail closed', () => {
  const a=store(), b=store();
  assert.equal(rememberReturn(a,'/profile','state'),true);
  assert.equal(consumeReturn(b,'state'),null);
  assert.equal(rememberReturn({getItem:()=>null,setItem:()=>{throw new Error('blocked');},removeItem:()=>{}},'/profile','state'),false);
});
test('unknown or missing callback state cannot restore a saved route', () => {
  for (const state of ['wrong', null]) {
    const storage = store();
    assert.equal(rememberReturn(storage, '/profile', 'expected'), true);
    assert.equal(consumeReturn(storage, state), null);
    assert.equal(consumeReturn(storage, 'expected'), null);
  }
});
test('literal callback entry exists without any provider or Supabase URL', () => {
  const here=dirname(fileURLToPath(import.meta.url));
  const callback=readFileSync(resolve(here,'../spikes/pages-contract/site/auth/callback/index.html'),'utf8');
  const root=readFileSync(resolve(here,'../spikes/pages-contract/site/index.html'),'utf8');
  assert.match(callback,/location\.replace/);
  assert.match(callback,/consumeReturn/);
  assert.match(root,/data-pages-proof-app/);
  assert.doesNotMatch(root+callback,/supabase\.co|service_role|VITE_SUPABASE|google\.com\/o\/oauth/);
});
