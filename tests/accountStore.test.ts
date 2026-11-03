import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountDataStore } from '../src/features/data/account-store.ts';
import type { UserDataRepository } from '../src/domain/collections.ts';
import type { DocumentSummary, BookmarkSummary } from '../src/domain/document-summary.ts';
const document = {id:'doc',title:'Demo',origin:'demo',visibility:'shared',chapter_count:1} as DocumentSummary;
function fixture() {
 let rows: BookmarkSummary[]=[];let fail=false;let removed=0,listed=0;
 const repository: UserDataRepository={
  async listDocuments(){listed++;return [document];},async listCatalog(){return [];},async listLocked(){return [];},async listMembershipIds(){return [];},async listReferences(){return rows;},
  async getDocument(){throw Error('not used');},async getSummary(){return document;},
  async saveReference(){if(fail)throw Error('offline');const row={id:'ref',user_id:'user',document_id:'doc',created_at:''};rows=[{...row,document}];return row;},
  async deleteReferences(){if(fail)throw Error('offline');removed++;rows=[];return 1;},
 };
 return {repository,setFail(value:boolean){fail=value;},stats:()=>({removed,listed})};
}
test('account store coordinates a fake repository without SDK or environment initialization',async()=>{
 const f=fixture(),store=new AccountDataStore('user',f.repository);await Promise.all([store.documents.load(),store.documents.load()]);assert.equal(f.stats().listed,1);
 assert.deepEqual(await store.toggle('bookmarks','doc'),{ok:true,value:{selected:true}});assert.equal(store.bookmarks.getSnapshot().data.length,1);
 f.setFail(true);assert.equal((await store.toggle('bookmarks','doc')).ok,false);assert.equal(store.bookmarks.getSnapshot().data.length,1);
 f.setFail(false);await store.toggle('bookmarks','doc');assert.equal(store.bookmarks.getSnapshot().data.length,0);store.dispose();
});
test('deletion invalidates an unfetched collection and signals progress through a callback',async()=>{
 const f=fixture();const forgotten:string[]=[];const store=new AccountDataStore('user',f.repository,id=>forgotten.push(id));
 store.changedDocument('doc',true);assert.equal(store.bookmarks.getSnapshot().status,'idle');assert.deepEqual(forgotten,['doc']);
 await store.documents.load();assert.equal(store.documents.getSnapshot().data[0].id,'doc');store.dispose();assert.deepEqual(store.documents.getSnapshot().data,[]);
});
