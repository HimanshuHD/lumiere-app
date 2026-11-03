import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {checkBoundaries} from '../scripts/check-boundaries.mjs';
function fixture(files:Record<string,string>){const root=mkdtempSync(join(tmpdir(),'lumiere-boundary-'));for(const [file,content] of Object.entries(files)){mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),content);}return {root,close:()=>rmSync(root,{recursive:true,force:true})};}
test('rejects relative/alias client access, domain SDK/UI imports, and feature internals',()=>{
 const f=fixture({'src/infrastructure/supabase/client.ts':'export const client=1;', 'src/components/View.ts':"import {client} from '../infrastructure/supabase/client'; import {internal} from '@/features/library/internal';",'src/domain/bad.ts':"import React from 'react';",'src/features/library/internal.ts':'export const internal=1;'});
 try{const errors=checkBoundaries(f.root);assert.ok(errors.some(e=>e.includes('Supabase integration')));assert.ok(errors.some(e=>e.includes('domain contracts')));assert.ok(errors.some(e=>e.includes('public entry')));}finally{f.close();}
});
test('rejects infrastructure-to-feature dependencies, shared UI dependencies and runtime cycles',()=>{
 const f=fixture({'src/infrastructure/adapter.ts':"import '@/features/data/index';",'src/features/data/index.ts':'export const state=1;', 'src/shared/ui/button.ts':"import '@/features/data/index';",'src/app/a.ts':"import './b';",'src/app/b.ts':"import './a';"});
 try{const errors=checkBoundaries(f.root);assert.ok(errors.some(e=>e.includes('infrastructure cannot')));assert.ok(errors.some(e=>e.includes('shared UI cannot')));assert.ok(errors.some(e=>e.includes('runtime dependency cycle')));}finally{f.close();}
});
test('accepts pure domain contracts and public feature imports',()=>{
 const f=fixture({'src/domain/doc.ts':'export interface Doc {id:string}', 'src/features/data/index.ts':"export type {Doc} from '@/domain/doc';",'src/components/View.ts':"import type {Doc} from '@/features/data';"});try{assert.deepEqual(checkBoundaries(f.root),[]);}finally{f.close();}
});
