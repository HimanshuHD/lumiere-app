import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicConfig } from '../src/shared/config/public-config.ts';
import { ServiceError, toServiceError } from '../src/domain/errors.ts';
const base={VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:'sb_publishable_qa'};
test('validates public configuration without logging key values',()=>{
 assert.equal(parsePublicConfig(base).supabaseUrl,base.VITE_SUPABASE_URL);
 assert.throws(()=>parsePublicConfig({}),/Missing Supabase/);
 assert.throws(()=>parsePublicConfig({...base,VITE_SUPABASE_URL:'file:///tmp/db'}),/HTTP/);
 for(const key of ['sb_secret_never-public','x.'+btoa(JSON.stringify({role:'service_role'}))+'.x']) assert.throws(()=>parsePublicConfig({...base,VITE_SUPABASE_ANON_KEY:key}),/Privileged/);
});
test('service errors preserve cancellation and permission distinctions',()=>{
 const validation=new ServiceError('validation','Bad file');assert.equal(toServiceError(validation),validation);
 assert.equal(toServiceError({name:'AbortError'}).category,'cancelled');assert.equal(toServiceError({code:'42501',message:'Denied'}).category,'permission');
 assert.equal(toServiceError({status:503,message:'Unavailable'}).category,'network');
});
