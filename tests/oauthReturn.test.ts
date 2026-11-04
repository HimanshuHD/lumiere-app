import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberOAuthReturn, consumeOAuthReturn, clearOAuthReturn } from '../src/infrastructure/browser/oauth-return.ts';
const storage = () => { const data = new Map<string,string>(); return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}}; };
test('OAuth intent is one-use, base scoped and expires', () => {
  const s=storage(); rememberOAuthReturn(s,'/app/profile','/app/',100);
  assert.equal(consumeOAuthReturn(s,'/',101),null);
  assert.equal(consumeOAuthReturn(s,'/app/',101),'/app/profile');
  assert.equal(consumeOAuthReturn(s,'/app/',102),null);
  rememberOAuthReturn(s,'/app/profile','/app/',100);
  assert.equal(consumeOAuthReturn(s,'/app/',600101),null);
  rememberOAuthReturn(s,'/app/profile','/app/',100);
  assert.equal(consumeOAuthReturn(s,'/app/',99),null);
});
test('tampered or unavailable intent storage cannot redirect outside the app', () => {
  const s=storage();
  for (const path of ['https://evil.test','//evil.test','/app/auth/callback','/app/profile?next=x']) {
    s.setItem('lumiere:oauth-return:/app/',JSON.stringify({path,createdAt:100}));
    assert.equal(consumeOAuthReturn(s,'/app/',101),null);
  }
  s.setItem('lumiere:oauth-return:/app/','{');assert.equal(consumeOAuthReturn(s,'/app/'),null);
  rememberOAuthReturn(s,'/app/profile','/app/');clearOAuthReturn(s,'/app/');assert.equal(s.data.size,0);
  assert.throws(()=>rememberOAuthReturn(s,'//evil','/app/'));
});
