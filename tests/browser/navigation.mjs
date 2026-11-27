// Actual application, synthetic accounts and mocked Supabase. No external account is accessed.
import assert from 'node:assert/strict';
import { launchBrowser } from './diagnostics.mjs';
import { createServer, build, preview } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api='http://127.0.0.1:54321';
process.env.VITE_SUPABASE_URL=api; process.env.VITE_SUPABASE_ANON_KEY='navigation-test-key';
const a='81000000-0000-4000-8000-000000000001', b='81000000-0000-4000-8000-000000000002';
const id='82000000-0000-4000-8000-000000000001', hidden='82000000-0000-4000-8000-000000000002', denied='82000000-0000-4000-8000-000000000003';
const user=account=>({id:account,email:account===a?'a@example.test':'b@example.test',user_metadata:{},app_metadata:{},aud:'authenticated',role:'authenticated'});
const session=account=>({access_token:account===a?'token-a':'token-b',refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(account)});
const doc={id,title:'Navigation story',author:'QA',category:'Fiction',summary:'QA',reading_time:1,cover_url:null,chapters:[{title:'First chapter',content:'A paragraph for the navigation regression. '.repeat(30)}],chapter_count:1,is_featured:false,created_at:'2026-11-04',origin:'demo',visibility:'shared',uploaded_by:null,file_format:'txt'};
const launch=()=>launchBrowser({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--single-process','--no-zygote']:[])]});
let browser=await launch();
async function freshBrowser(){await browser.close();browser=await launch();}
const errors=[];
async function pageFor(server,base,account=a) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(({initial})=>{
    if(!sessionStorage.getItem('qa-initialized')){
      if(initial)localStorage.setItem('sb-127-auth-token',JSON.stringify(initial));
      sessionStorage.setItem('qa-initialized','yes');
    }
  },{initial:account?session(account):null});
  const state={account,fail:false,hold:false,requests:[],pending:[],saved:[]};
  await context.route(`${api}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postDataJSON();let data=[];
    const requestAccount=req.headers().authorization==='Bearer token-b'?b:a;
    if(path.endsWith('/logout')){state.account=null;return route.fulfill({status:204});}
    if(path.endsWith('/token')){state.account=body.email==='b@example.test'?b:a;return route.fulfill({json:session(state.account)});}
    if(path.endsWith('/user'))data=user(requestAccount);
    else if(path.endsWith('/profiles'))data={full_name:state.account===b?'Account B':'Account A',avatar_url:null};
    else if(path.endsWith('/documents')){
      const target=url.searchParams.get('id')?.replace('eq.','');
      if(url.searchParams.get('select')==='*'){
        state.requests.push({target,account:requestAccount});
        if(state.hold){state.pending.push({route,target});return;}
        if(state.fail)return route.fulfill({status:503,json:{message:'Temporary outage'}});
        if(target===denied)return route.fulfill({status:403,json:{code:'42501',message:'Private detail must not be displayed'}});
        data=target===id?[doc]:target===hidden&&requestAccount===a?[{...doc,id:hidden,title:'Account A private story',origin:'user_upload',visibility:'private',uploaded_by:a}]:[];
      }else data=url.searchParams.get('origin')?[]:[{...doc,chapters:undefined}];
    }else if(path.endsWith('/rpc/save_reading_position')){
      state.saved.push(body);data={accepted:true,row:{id:'progress',user_id:state.account,document_id:body.p_document_id,position:body.p_position,chapter_index:body.p_chapter_index,scroll_percent:body.p_scroll_percent,revision:state.saved.length,mutation_id:body.p_mutation_id,updated_at:new Date().toISOString()}};
    }
    return route.fulfill({json:data});
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  const go=path=>page.goto(origin+base+path.replace(/^\//,''),{waitUntil:'domcontentloaded'});
  const login=async email=>{await page.getByPlaceholder('you@example.com').fill(email);await page.getByPlaceholder('At least 6 characters').fill('qa-password');await page.locator('form button[type="submit"]').click();};
  return {context,page,state,origin,go,login};
}
let server;
let previewDirectory;
try{
  server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
  const {context,page,state,origin,go}=await pageFor(server,'/');
  for(const path of ['/','/bookmarks','/reading-list','/upload','/profile','/my-uploads','/documents','/admin/catalog']){
    await go(path);await page.getByRole('button',{name:'Account A',exact:true}).waitFor();
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Account A',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,path);
  }
  await go('/');await page.getByRole('button',{name:'Bookmarks',exact:true}).first().click();
  await page.waitForURL('**/bookmarks');await page.getByRole('button',{name:'Reading List',exact:true}).first().click();
  await page.waitForURL('**/reading-list');await page.goBack();await page.waitForURL('**/bookmarks');await page.goForward();await page.waitForURL('**/reading-list');
  console.log('PASS: all view routes survive refresh; Back/Forward follows navigation.');
  await go('/read/'+id);await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  await page.getByRole('button',{name:'Bookmarks',exact:true}).first().click();await page.goBack();
  await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  await go('/read/bad');await page.getByRole('heading',{name:'Page unavailable'}).waitFor();assert(!state.requests.some(r=>r.target==='bad'));
  await go('/read/82000000-0000-4000-8000-000000000099');await page.getByRole('heading',{name:'Document unavailable'}).waitFor();
  await go('/read/'+denied);await page.getByRole('heading',{name:'Document access denied'}).waitFor();assert(!(await page.textContent('body')).includes('Private detail'));
  state.fail=true;await go('/read/'+id);await page.getByRole('heading',{name:'Could not open document'}).waitFor();state.fail=false;
  await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  console.log('PASS: reader deep links/reload, invalid identity, RLS-empty result, explicit denial and retry.');
  state.hold=true;await go('/read/'+hidden);await page.getByRole('heading',{name:'Opening document…'}).waitFor();
  await page.getByRole('button',{name:'Library',exact:true}).first().click();state.hold=false;
  for(const pending of state.pending.splice(0))await pending.route.fulfill({json:[{...doc,id:hidden,title:'Late private story'}]}).catch(()=>{});
  await page.getByText('Navigation story',{exact:true}).first().waitFor();assert.equal(new URL(page.url()).pathname,'/');assert(!(await page.textContent('body')).includes('Late private story'));
  console.log('PASS: leaving a pending document route prevents stale reader mounting.');
  await go('/read/'+hidden);await page.getByText('Account A private story',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Account A',exact:true}).click();await page.getByRole('button',{name:'Log Out',exact:true}).click();
  await page.getByPlaceholder('you@example.com').waitFor();assert.equal(new URL(page.url()).pathname,'/');
  await page.getByPlaceholder('you@example.com').fill('b@example.test');await page.getByPlaceholder('At least 6 characters').fill('qa-password');await page.locator('form button[type="submit"]').click();
  await page.getByRole('button',{name:'Account B',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/');
  await go('/read/'+hidden);await page.getByRole('heading',{name:'Document unavailable'}).waitFor();assert(!(await page.textContent('body')).includes('Account A private story'));
  console.log('PASS: logout/account B clears reader intent and reauthorizes old links.');
  await page.evaluate(async()=>{const {supabase}=await import('/src/infrastructure/supabase/client.ts');await supabase.auth.signInWithPassword({email:'a@example.test',password:'qa-password'});});
  await page.getByRole('button',{name:'Account A',exact:true}).waitFor();await go('/read/'+hidden);
  await page.getByText('Account A private story',{exact:true}).first().waitFor();const before=state.requests.length;
  await page.evaluate(async()=>{const {supabase}=await import('/src/infrastructure/supabase/client.ts');await supabase.auth.signInWithPassword({email:'b@example.test',password:'qa-password'});});
  await page.getByRole('button',{name:'Account B',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/');
  assert(!state.requests.slice(before).some(r=>r.target===hidden&&r.account===b));
  assert(await page.evaluate(async account=>{const runtime=await import('/src/app/account-runtime.ts');return runtime.getAccountStore(account)===undefined&&runtime.cachedAccountStore(account)===undefined;},a));
  console.log('PASS: direct identity replacement never mounts the old reader for the new account.');
  await context.close();
  await freshBrowser();
  const signedOut=await pageFor(server,'/',null);await signedOut.go('/read/'+id);
  await signedOut.page.getByPlaceholder('you@example.com').waitFor();assert.equal(signedOut.state.requests.length,0);
  await signedOut.login('a@example.test');await signedOut.page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  assert.equal(new URL(signedOut.page.url()).pathname,'/read/'+id);
  console.log('PASS: signed-out deep link waits for sign-in and restores the requested document.');
  await signedOut.context.close();await server.close();
  await freshBrowser();
  // Repeat direct loading and OAuth destination handling with a real non-root Vite base.
  process.env.NODE_ENV='production';
  previewDirectory=mkdtempSync(join(tmpdir(),'lumiere-navigation-'));
  await build({base:'/shelf/',build:{outDir:previewDirectory,emptyOutDir:true}});
  const production=await preview({base:'/shelf/',build:{outDir:previewDirectory},preview:{host:'127.0.0.1',port:0}});
  server={httpServer:production.httpServer,close:()=>new Promise(resolve=>production.httpServer.close(resolve))};
  const nested=await pageFor(server,'/shelf/');await nested.go('/read/'+id);
  await nested.page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  await nested.page.reload({waitUntil:'domcontentloaded'});await nested.page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  await nested.page.evaluate(id=>sessionStorage.setItem('lumiere:oauth-return:/shelf/',JSON.stringify({path:'/shelf/read/'+id,createdAt:Date.now()})),id);
  await nested.go('/auth/callback');await nested.page.waitForURL('**/shelf/read/'+id);await nested.page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  assert.equal(await nested.page.evaluate(()=>sessionStorage.getItem('lumiere:oauth-return:/shelf/')),null);
  await nested.page.evaluate(()=>sessionStorage.setItem('lumiere:oauth-return:/shelf/',JSON.stringify({path:'https://evil.test',createdAt:Date.now()})));
  await nested.go('/auth/callback');await nested.page.waitForURL(nested.origin+'/shelf/');
  console.log('PASS: production-preview subdirectory deep links/reload and one-use safe OAuth return handling.');
  await nested.context.close();
  await freshBrowser();
  const failed=await pageFor(server,'/shelf/',null);await failed.go('/auth/callback?error=access_denied');
  await failed.page.getByRole('heading',{name:'Sign-in could not be completed'}).waitFor();
  await failed.page.getByRole('button',{name:'Return to sign in'}).click();await failed.page.getByPlaceholder('you@example.com').waitFor();
  // Capture outbound provider redirect without accessing Google or a signed-in browser.
  await failed.context.route(`${api}/auth/v1/authorize**`,route=>route.fulfill({contentType:'text/html',body:'OAuth redirect captured'}));
  await failed.page.getByRole('button',{name:'Continue with Google'}).click();await failed.page.waitForURL('**/auth/v1/authorize**');
  assert.equal(new URL(failed.page.url()).searchParams.get('redirect_to'),failed.origin+'/shelf/auth/callback');
  await failed.context.close();
  assert.deepEqual(errors,[]);console.log('PASS: OAuth failure recovery and base-aware provider redirect; no browser exceptions.');
}catch(error){
  for(const context of browser.contexts())for(const page of context.pages())console.error('Navigation fixture failure:',new URL(page.url()).pathname,await page.locator('h1,h2').allTextContents().catch(()=>[]));
  throw error;
}finally{await browser.close();await server?.close();if(previewDirectory)rmSync(previewDirectory,{recursive:true,force:true});}

