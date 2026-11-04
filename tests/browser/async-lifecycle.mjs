// Controller integration regressions. Uses synthetic identities and mocked transport only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_ANON_KEY = 'async-regression-public-key';
const html = `<html><body><div id="root"></div><script type="module">
  import React, {useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {IntegrationContext} from '/src/shared/integrations.ts';
  import {AuthContext} from '/src/features/auth/index.ts';
  import {ToastProvider} from '/src/shared/ui/index.ts';
  import {useCatalogController} from '/src/features/catalog/index.ts';
  import {useProfileController} from '/src/features/profile/index.ts';
  const user={id:'81000000-0000-4000-8000-000000000001',user_metadata:{},app_metadata:{}};
  const book={id:'1',title:'One',author:'QA',summary:'',downloadUrl:'https://www.gutenberg.org/ebooks/1.epub',downloadType:'application/epub+zip',rights:'Public domain in the USA',categories:[],catalogUrl:'',updated:'',coverUrl:''};
  window.navigation=0;window.avatarRequests=[];window.revoked=[];
  const revoke=URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url);};
  const ports={catalogFeed:async()=>({title:'Feed',books:[book]}),auth:{},profile:{saveAvatar:async(id,file)=>new Promise((resolve,reject)=>window.avatarRequests.push({file,resolve,reject}))}};
  const auth={user,profile:{fullName:'QA',avatarUrl:null},refreshProfile:async()=>{}};
  function Catalog(){const[open,setOpen]=useState(true);window.setCatalogOpen=setOpen;
    window.controller=useCatalogController(open,()=>setOpen(false),()=>window.navigation++);
    return React.createElement('p',null,open?'catalog open':'catalog closed');}
  function Profile(){window.controller=useProfileController();return React.createElement('p',null,'profile');}
  function Root(){const[mode,setMode]=useState('catalog');window.setMode=setMode;return React.createElement(IntegrationContext.Provider,{value:ports},
    React.createElement(AuthContext.Provider,{value:auth},React.createElement(ToastProvider,null,mode==='profile'?React.createElement(Profile):React.createElement(Catalog))));}
  createRoot(document.getElementById('root')).render(React.createElement(Root));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{
  name:'async-regression-fixtures',configureServer(s){s.middlewares.use(async(req,res,next)=>{
    if(req.url!=='/__async-regression')return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));
  });},
}]});
await server.listen();
const browser=await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--single-process','--no-zygote']:[])],
});
const document={id:'82000000-0000-4000-8000-000000000001',title:'Imported',author:'QA',category:'Fiction',summary:'',cover_url:null,reading_time:1,chapters:[],is_featured:false,created_at:'2026-11-04',origin:'catalog_import',visibility:'shared'};
const catalog={name:'Gutenberg',url:'https://www.gutenberg.org/ebooks.opds/',website:'',description:'',count:'',accent:''};
let pending=[],membershipCalls=0;
async function until(check){const end=Date.now()+20000;while(!check()){if(Date.now()>end)throw Error('Timed out waiting for mocked transport');await new Promise(resolve=>setTimeout(resolve,10));}}
try{
  const page=await browser.newPage();const errors=[];
  page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://127.0.0.1:54321/**',route=>{
    if(route.request().url().includes('/functions/v1/opds-fetch')){pending.push(route);return;}
    if(route.request().url().includes('document_library_memberships'))membershipCalls++;
    return route.fulfill({json:[]});
  });
  const url=`http://127.0.0.1:${server.httpServer.address().port}/__async-regression`;
  async function fresh(){await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.controller);await page.evaluate(c=>window.controller.loadCatalog(c),catalog);}
  async function startImport(){await page.evaluate(()=>{void window.controller.handleAddBook(window.controller.books[0]);});await until(()=>pending.length>0);return pending.shift();}
  async function complete(route){const target=membershipCalls+1;await route.fulfill({json:document});await until(()=>membershipCalls>=target);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

  await fresh();
  const old=await startImport();
  // Rapid duplicate actions in the same catalog share the controller's pending ownership.
  await page.evaluate(()=>{void window.controller.handleAddBook(window.controller.books[0]);});
  await page.evaluate(()=>window.controller.handleBack());
  await page.waitForFunction(()=>window.controller.selectedCatalog===null&&window.controller.addingBookId===null);
  await page.evaluate(c=>window.controller.loadCatalog({...c,url:c.url+'?next=1'}),catalog);
  assert.equal(await page.evaluate(()=>window.controller.addingBookId),null);
  const newer=await startImport();
  await complete(old);
  assert.equal(pending.length,0);
  assert.equal(await page.evaluate(()=>window.navigation),0);
  assert.equal(await page.evaluate(()=>window.controller.addingBookId),'1');
  await complete(newer);
  await page.waitForFunction(()=>window.navigation===1&&window.controller.addingBookId===null);
  console.log('PASS: feed change resets pending state; obsolete completion cannot clear or navigate over a newer import.');

  await fresh();const back=await startImport();
  await page.evaluate(()=>window.controller.handleBack());await complete(back);
  assert.equal(await page.evaluate(()=>window.navigation),0);
  assert.equal(await page.evaluate(()=>window.controller.addingBookId),null);
  console.log('PASS: Back to catalogs discards import navigation.');

  await fresh();const closed=await startImport();
  await page.evaluate(()=>window.controller.handleClose());await complete(closed);
  assert.equal(await page.evaluate(()=>window.navigation),0);
  assert.equal(await page.evaluate(()=>window.controller.addingBookId),null);
  await page.evaluate(()=>window.setMode('profile'));
  await page.waitForFunction(()=>!!window.controller.handleAvatarSelect);
  await page.evaluate(()=>window.controller.handleAvatarSelect(new File(['A'],'a.png')));
  await page.waitForFunction(()=>window.controller.avatarFile?.name==='a.png');
  await page.evaluate(()=>{void window.controller.handleSaveAvatar();void window.controller.handleSaveAvatar();});
  await page.waitForFunction(()=>window.avatarRequests.length===1);
  await page.evaluate(()=>window.controller.handleAvatarSelect(new File(['B'],'b.png')));
  await page.waitForFunction(()=>window.controller.avatarFile?.name==='b.png');
  const previewB=await page.evaluate(()=>window.controller.avatarPreview);
  await page.evaluate(()=>window.avatarRequests[0].resolve('https://example.test/a.png'));
  await page.waitForFunction(()=>!window.controller.uploadingAvatar);
  assert.equal(await page.evaluate(()=>window.controller.avatarFile?.name),'b.png');
  assert.equal(await page.evaluate(()=>window.controller.avatarPreview),previewB);
  assert.equal(await page.evaluate(url=>window.revoked.includes(url),previewB),false);
  await page.evaluate(()=>{void window.controller.handleSaveAvatar();});
  await page.waitForFunction(()=>window.avatarRequests.length===2);
  await page.evaluate(()=>window.avatarRequests[1].resolve('https://example.test/b.png'));
  await page.waitForFunction(()=>!window.controller.uploadingAvatar&&window.controller.avatarFile===null);
  assert.equal(await page.evaluate(url=>window.revoked.includes(url),previewB),true);
  await page.evaluate(()=>window.controller.handleAvatarSelect(new File(['C'],'c.png')));
  await page.waitForFunction(()=>window.controller.avatarFile?.name==='c.png');
  const previewC=await page.evaluate(()=>window.controller.avatarPreview);
  await page.evaluate(()=>window.setMode('catalog'));
  await page.waitForFunction(()=>!!window.controller.loadCatalog);
  assert.equal(await page.evaluate(url=>window.revoked.includes(url),previewC),true);
  console.log('PASS: older avatar upload preserves newer selection/preview; current save and unmount release previews.');
  assert.deepEqual(errors,[]);
  console.log('PASS: closed catalog ignores import completion; no browser exceptions.');
}finally{await browser.close();await server.close();}
