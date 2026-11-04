import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attempt, requireValue, ServiceError } from '../src/domain/errors.ts';
import { createProfileCommands } from '../src/features/profile/commands.ts';
import { DocumentValidationError } from '../src/services/documentValidation.ts';
test('commands normalize failures, retain categories and preserve successful values', async () => {
  assert.deepEqual(await attempt(async () => 42), {ok:true,value:42});
  const cancelled = await attempt(async () => { throw new DOMException('gone','AbortError'); });
  assert.equal(cancelled.ok,false);
  if (!cancelled.ok) assert.equal(cancelled.error.category,'cancelled');
  const invalid = await attempt(async () => { throw new DocumentValidationError('Invalid document'); });
  assert.equal(invalid.ok,false);
  if (!invalid.ok) assert.equal(invalid.error.category,'validation');
  assert.throws(() => requireValue(invalid),ServiceError);
});
test('profile commands turn repository rejection into a typed outcome', async () => {
  const commands = createProfileCommands({get:async()=>null,saveAvatar:async()=> 'url',saveName:async()=> {throw {code:'42501',message:'Denied'};}}, {
    getSession:async()=>null,subscribe:()=>()=>{},signIn:async()=>({ok:true,value:undefined}),signUp:async()=>({ok:true,value:undefined}),signInWithGoogle:async()=>({ok:true,value:undefined}),signOut:async()=>({ok:true,value:undefined}),changePassword:async()=>({ok:true,value:undefined}),
  });
  const result = await commands.saveName('account','Name');
  assert.equal(result.ok,false);
  if (!result.ok) assert.equal(result.error.category,'permission');
  assert.deepEqual(await commands.saveAvatar('account',new File(['x'],'avatar.png')), {ok:true,value:'url'});
});
