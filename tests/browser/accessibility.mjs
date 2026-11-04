import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {accessibilityPdf} from './accessibility-fixtures.mjs';
const api='http://127.0.0.1:54321',userId='81000000-0000-4000-8000-000000000001';
process.env.VITE_SUPABASE_URL=api;process.env.VITE_SUPABASE_ANON_KEY='accessibility-fixture-key';
const seeds=JSON.parse(readFileSync(new URL('../../supabase/seeds/demo.sql',import.meta.url),'utf8').split('$demo_stories$')[1]);
const docs=seeds.map(story=>({...story,origin:'demo',visibility:'shared',uploaded_by:null,file_format:'txt',file_url:null,file_storage_path:null,cover_url:null,chapter_count:story.chapters.length}));
const fixture=`<!doctype html><html lang="en"><head><title>Accessibility fixtures</title></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{Modal,ToastProvider,useToast}from'/src/shared/ui/index.ts';import{PdfViewer}from'/src/components/PdfViewer.tsx';import'/src/index.css';
function Dialogs(){const{showToast}=useToast();const[open,setOpen]=useState(false),[nested,setNested]=useState(false);return React.createElement('section',null,
React.createElement('h1',null,'Dialog tests'),React.createElement('button',{onClick:()=>setOpen(true)},'Open test dialog'),open&&React.createElement(Modal,{label:'Test dialog',onClose:()=>setOpen(false),className:'flex items-center justify-center bg-black/50'},React.createElement('div',{className:'bg-white p-8',onClick:e=>e.stopPropagation()},
React.createElement('h2',null,'Test dialog'),React.createElement('label',{htmlFor:'dialog-input'},'Dialog input'),React.createElement('input',{id:'dialog-input'}),React.createElement('button',{onClick:()=>showToast('Modal notification','error')},'Show dialog notification'),React.createElement('button',{onClick:()=>setNested(true)},'Open nested dialog'),React.createElement('button',{onClick:()=>setOpen(false)},'Close test dialog'),nested&&React.createElement(Modal,{label:'Nested dialog',onClose:()=>setNested(false),className:'flex items-center justify-center bg-black/50'},React.createElement('div',{className:'bg-white p-8',onClick:e=>e.stopPropagation()},React.createElement('h2',null,'Nested dialog'),React.createElement('button',{onClick:()=>setNested(false)},'Close nested dialog'))))));}
function Fixture(){const[mode,setMode]=useState('dialogs'),[url,setUrl]=useState('/a11y.pdf');window.renewPdf=()=>setUrl('/a11y.pdf?renewed=1');return React.createElement('main',null,React.createElement('button',{onClick:()=>setMode(mode==='pdf'?'dialogs':'pdf')},'Switch fixture'),mode==='pdf'?React.createElement(PdfViewer,{url,title:'Accessible PDF'}):React.createElement(Dialogs));}createRoot(document.getElementById('root')).render(React.createElement(ToastProvider,null,React.createElement(Fixture)));
</script></body></html>`;
const server=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'accessibility-fixtures',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(req.url.startsWith('/a11y.pdf')){res.setHeader('Content-Type','application/pdf');res.end(accessibilityPdf());return;}
 if(req.url!=='/__a11y')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,fixture));
});}}]});await server.listen();
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--single-process','--no-zygote']:[])]});
const errors=[],audits=[];const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
let page;
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(({userId})=>{if(!sessionStorage.getItem('a11y-initialized')){localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:userId,email:'qa@example.test',user_metadata:{},app_metadata:{}}}));sessionStorage.setItem('a11y-initialized','yes');}},{userId});
 let bookmarks=[];
 await context.route(`${api}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postDataJSON();let data=[];
  if(path.endsWith('/logout'))return route.fulfill({status:204});
  if(path.endsWith('/profiles'))data={full_name:'Accessibility QA',avatar_url:null};
  else if(path.endsWith('/documents')){const id=url.searchParams.get('id')?.replace('eq.','');data=url.searchParams.get('select')==='*'?docs.filter(d=>d.id===id):docs.map(({chapters,...d})=>d);}
  else if(path.endsWith('/bookmarks')){if(req.method()==='POST'){data={id:'bookmark',document_id:body.document_id,user_id:userId,created_at:'2026-11-04'};bookmarks=[data];}else data=bookmarks.map(row=>({...row,document:docs.find(d=>d.id===row.document_id)}));}
  else if(path.endsWith('/functions/v1/opds-fetch'))data={title:'Test catalog',books:[],count:0};
  else if(path.endsWith('/rpc/save_reading_position'))data={accepted:true,row:{id:'position',user_id:userId,document_id:body.p_document_id,position:body.p_position,chapter_index:body.p_chapter_index,scroll_percent:body.p_scroll_percent,revision:1,mutation_id:body.p_mutation_id,updated_at:'2026-11-04'}};
  await route.fulfill({json:data});
 });
 page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 const axePath=createRequire(import.meta.url).resolve('axe-core/axe.min.js');
 async function scan(name){await page.addScriptTag({path:axePath});const result=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}));});audits.push({name,violations:result});console.log('AXE',name,JSON.stringify(result));}
 async function go(path){await page.goto(origin+path,{waitUntil:'domcontentloaded'});}
 await go('/');await page.getByRole('button',{name:'Accessibility QA',exact:true}).waitFor();await scan('library');
 const open=page.getByRole('button',{name:`Open ${docs[0].title}`,exact:true}).last();await open.focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();await scan('reader-light');
 await page.getByRole('button',{name:'Reader settings',exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByRole('dialog',{name:'Reader settings',exact:true}).waitFor();await scan('reader-settings');
 await page.getByRole('button',{name:'Dark',exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('main > div')).backgroundColor==='rgb(28, 25, 23)');await page.getByRole('button',{name:'small',exact:true}).hover();await scan('reader-settings-dark-hover');await page.keyboard.press('Escape');await page.waitForFunction(()=>getComputedStyle(document.querySelector('main > div')).backgroundColor==='rgb(28, 25, 23)');await scan('reader-dark');
 await page.getByRole('button',{name:'Reader settings',exact:true}).click();await page.getByRole('button',{name:'Sepia',exact:true}).click();await page.keyboard.press('Escape');await page.waitForFunction(()=>getComputedStyle(document.querySelector('main > div')).backgroundColor==='rgb(244, 236, 216)');await scan('reader-sepia');
 await page.getByRole('button',{name:'Open contents',exact:true}).click();await page.getByRole('dialog',{name:'Contents',exact:true}).waitFor();await scan('contents');await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'Open contents',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.getByRole('button',{name:'Back to library',exact:true}).first().click();
 const importer=page.getByRole('button',{name:'Import Books',exact:true});await importer.focus();await page.keyboard.press('Enter');assert.equal(await importer.getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 await page.getByRole('dialog',{name:'Online library',exact:true}).waitFor();await scan('online-library');
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('dialog[open]')));}
 await page.keyboard.press('Escape');assert(await importer.evaluate(e=>e===document.activeElement));
 await go('/profile');await page.getByLabel('Full Name',{exact:true}).waitFor();await scan('profile');
 await go('/upload');await page.getByLabel('Book Name',{exact:false}).waitFor();await scan('upload');
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose document file',exact:true}).focus();await page.keyboard.press('Enter');await(await chooser).setFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('bad')});await page.locator('#upload-error').waitFor();await scan('upload-error');
 await go('/');await page.getByRole('button',{name:'Accessibility QA',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Accessibility QA',exact:true}).getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:'Accessibility QA',exact:true}).click();await page.getByRole('button',{name:'Log Out',exact:true}).click();await page.getByLabel('Email',{exact:true}).waitFor();await scan('sign-in');
 await page.getByLabel('Email',{exact:true}).fill('bad@example.test');await page.getByLabel('Password',{exact:true}).fill('wrong-password');
 // Native dialogs: Tab containment, Escape, nested ownership and focus restoration.
 await go('/__a11y');const trigger=page.getByRole('button',{name:'Open test dialog',exact:true});await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Test dialog',exact:true}).waitFor();
 await page.getByRole('button',{name:'Show dialog notification',exact:true}).click();await page.getByRole('dialog',{name:'Test dialog',exact:true}).getByText('Modal notification',{exact:true}).waitFor();await scan('shared-dialog');await page.getByRole('button',{name:'Dismiss notification',exact:true}).click();for(let i=0;i<8;i++){await page.keyboard.press(i%2?'Shift+Tab':'Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('dialog[open]')));}
 await page.getByRole('button',{name:'Open nested dialog',exact:true}).click();await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Open nested dialog',exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Escape');assert(await trigger.evaluate(e=>e===document.activeElement));assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 await page.getByRole('button',{name:'Switch fixture',exact:true}).click();
 async function ready(){await page.waitForFunction(()=>document.querySelector('[aria-label="Accessible PDF PDF reader"]')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('.textLayer'));}
 await ready();await page.getByText('Accessible PDF text',{exact:true}).waitFor({state:'attached'});await scan('pdf');
 assert.equal(await page.locator('.annotationLayer a').count(),2);
 assert.equal(await page.locator('.annotationLayer a[href^="javascript:"]').count(),0);
 const external=page.getByRole('link',{name:/Open external link:/});assert.equal(await external.getAttribute('target'),'_blank');assert.equal(await external.getAttribute('rel'),'noopener noreferrer');
 const selected=await page.evaluate(()=>{const text=document.querySelector('.textLayer');const selection=window.getSelection();selection.selectAllChildren(text);return selection.toString();});assert(selected.includes('Accessible PDF text'));
 async function aligned(){const sizes=await page.evaluate(()=>{const c=document.querySelector('canvas').getBoundingClientRect(),t=document.querySelector('.textLayer').getBoundingClientRect(),a=document.querySelector('.annotationLayer').getBoundingClientRect();return[c,t,a].map(r=>({x:r.x,y:r.y,w:r.width,h:r.height}));});for(const r of sizes.slice(1)){assert(Math.abs(r.w-sizes[0].w)<1);assert(Math.abs(r.h-sizes[0].h)<1);assert(Math.abs(r.x-sizes[0].x)<1);assert(Math.abs(r.y-sizes[0].y)<1);}}
 await aligned();if(process.env.A11Y_SCREENSHOTS)await page.screenshot({path:process.env.A11Y_SCREENSHOTS+'/pdf-wide.png'});for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();await ready();await aligned();assert.equal(await page.locator('.annotationLayer a').count(),2);
 await page.setViewportSize({width:600,height:800});await page.getByRole('button',{name:'Fit width',exact:true}).click();await ready();await aligned();if(process.env.A11Y_SCREENSHOTS)await page.screenshot({path:process.env.A11Y_SCREENSHOTS+'/pdf-mobile.png'});
 await page.getByRole('link',{name:'Go to linked location in this PDF',exact:true}).focus();await page.keyboard.press('Enter');await page.getByText('Landscape second page',{exact:true}).waitFor({state:'attached'});await ready();await aligned();
 await page.getByRole('button',{name:'Next PDF page',exact:true}).click();await page.getByText(/This page has no extractable text/).waitFor();assert.equal(await page.locator('.annotationLayer a').count(),0);
 await page.getByRole('button',{name:'Previous PDF page',exact:true}).click();await ready();await page.evaluate(()=>window.renewPdf());await ready();await page.getByText('Landscape second page',{exact:true}).waitFor({state:'attached'});
 await page.getByRole('button',{name:'Switch fixture',exact:true}).click();assert.equal(await page.locator('.textLayer,.annotationLayer').count(),0);
 console.log('PASS: keyboard document opening, disclosures, native/nested dialog focus, file picker, PDF text/links/zoom/resize/renewal/cleanup.');
 assert.deepEqual(errors,[]);assert.deepEqual(audits.filter(a=>a.violations.length),[]);console.log('PASS: representative WCAG axe checks; no browser exceptions.');
}catch(error){if(page)console.error('A11y fixture failure',page.url(),await page.locator('h1,h2,[role=alert]').allTextContents().catch(()=>[]));throw error;}
finally{await browser.close();await server.close();}
