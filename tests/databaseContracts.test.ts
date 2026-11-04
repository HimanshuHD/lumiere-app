import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapDocument, mapSummary, mapReference, mapSaveResult, mapProfile } from '../src/infrastructure/supabase/mappers.ts';
import { ServiceError } from '../src/domain/errors.ts';
const metadata = {id:'doc',title:'Book',author:'Author',category:'Fiction',summary:'Summary',reading_time:1,cover_url:null,origin:'demo',visibility:'shared',is_featured:false,created_at:null,chapter_count:1};
test('database mapping validates nested content and excludes chapter bodies from summaries', () => {
  const input = {...metadata,chapters:[{title:'One',content:'Words'}],untrusted_extra:'discard'};
  assert.equal(mapDocument(input).chapters[0].content,'Words');
  assert.equal('chapters' in mapSummary(input),false);
  assert.equal('untrusted_extra' in mapDocument(input),false);
  assert.equal(mapDocument(input).created_at,'');
  for (const chapters of [null,{},[{title:'One',content:42}]]) assert.throws(() => mapDocument({...input,chapters}),ServiceError);
  assert.throws(() => mapSummary({...metadata,visibility:'anything'}),ServiceError);
  assert.throws(() => mapSummary({...metadata,chapter_count:-1}),ServiceError);
});
test('embedded references retain redaction and progress acknowledgement must be real', () => {
  const row = {id:'ref',user_id:'user',document_id:'doc',created_at:null};
  assert.equal(mapReference({...row,document:null}).document,undefined);
  assert.equal(mapReference({...row,document:metadata}).document?.id,'doc');
  assert.throws(() => mapReference({...row,document:{id:'doc'}}),ServiceError);
  assert.throws(() => mapSaveResult({accepted:true,row:null}),ServiceError);
  assert.throws(() => mapSaveResult({accepted:'yes',row:null}),ServiceError);
  assert.deepEqual(mapSaveResult({accepted:false,row:null}),{accepted:false,row:null});
});

test('profile mapping rejects malformed display data and omits unexpected fields', () => {
  assert.equal(mapProfile(null),null);
  assert.deepEqual(mapProfile({full_name:'Name',avatar_url:null,extra:'discard'}),{full_name:'Name',avatar_url:null});
  assert.throws(()=>mapProfile({full_name:42}),ServiceError);
});
