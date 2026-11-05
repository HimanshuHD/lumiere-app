// Isolated integration smoke test. All Supabase traffic is mocked; no real account is used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdf, epub } from './fixtures.mjs';
import { launchBrowser } from './diagnostics.mjs';
import { createServer } from 'vite';
const userId = '81000000-0000-4000-8000-000000000001';
const api = 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_URL = api;
process.env.VITE_SUPABASE_ANON_KEY = 'browser-contract-test-key';
const seeds = JSON.parse(readFileSync(new URL('../../supabase/seeds/demo.sql', import.meta.url),'utf8').split('$demo_stories$')[1]);
const docs = seeds.map(story => ({...story, origin:'demo',visibility:'shared',uploaded_by:null,file_format:'txt',file_url:null,file_storage_path:null,cover_url:null,chapter_count:story.chapters.length}));
let profile = {full_name:'Architecture QA',avatar_url:null};
let references = [];
const progress = new Map();
let failBookmark = false;
const errors = [];
const server = await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'architecture-fixtures',configureServer:fixtures}]});
function fixtures(server) { server.middlewares.use(async (req,res,next) => {
  if (req.url === '/qa.pdf' || req.url === '/qa.epub') { res.setHeader('Content-Type',req.url.endsWith('pdf')?'application/pdf':'application/epub+zip'); res.end(req.url.endsWith('pdf')?pdf:epub); return; }
  if (req.url !== '/__architecture-qa') return next();
  const html = `<html><body><div id="root"></div><script type="module">
    import React, {useState,useCallback} from 'react';
    import {createRoot} from 'react-dom/client';
    import {PdfViewer} from '/src/components/PdfViewer.tsx';
    import {useEpubController} from '/src/features/reader/epub/index.ts';
    window.qaEvents=[];
    function Epub() {
      const onPosition=useCallback(p=>window.qaEvents.push(p),[]);
      const c=useEpubController('/qa.epub',true,null,onPosition);
      return React.createElement('section',null,
        React.createElement('div',{ref:c.epubViewerRef,style:{width:600,height:400}}),
        React.createElement('p',null,c.epubError|| (c.epubLoading?'EPUB loading':'EPUB ready')),
        React.createElement('button',{onClick:()=>c.turnEpubPage('next')},'Next EPUB'));
    }
    function QA() { const [mode,setMode]=useState('pdf'); return React.createElement(React.Fragment,null,
      React.createElement('button',{onClick:()=>setMode('epub')},'Switch EPUB'),
      mode==='pdf'?React.createElement(PdfViewer,{url:'/qa.pdf',title:'QA PDF',initialPosition:{version:1,format:'pdf',page:2,view:{mode:'manual',scale:1.3}},onPositionChange:p=>window.qaEvents.push(p)}):React.createElement(Epub)); }
    createRoot(document.getElementById('root')).render(React.createElement(QA));
  </script></body></html>`;
  res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));
}); }
await server.listen();
const port = server.httpServer.address().port;
const browser = await launchBrowser({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}),
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(({userId}) => {
    localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:userId,email:'qa@example.test',user_metadata:{},app_metadata:{},aud:'authenticated',role:'authenticated'}}));
    localStorage.setItem('reader-settings',JSON.stringify({theme:'invalid',fontSize:'huge',lineSpacing:null}));
  },{userId});
  await context.route(`${api}/**`, async route => {
    const req=route.request(), url=new URL(req.url()), path=url.pathname;
    const body=req.postDataJSON?.();
    let data=[];
    if(path.startsWith('/auth/v1/logout')) return route.fulfill({status:204});
    if(path.startsWith('/auth/v1/user')) data={id:userId,email:'qa@example.test',user_metadata:{},app_metadata:{}};
    else if(path.endsWith('/profiles')) { if(req.method()==='POST') profile={...profile,...body}; data=profile; }
    else if(path.endsWith('/documents')) {
      let rows=docs;
      const id=url.searchParams.get('id')?.replace('eq.','');
      if(id) rows=docs.filter(d=>d.id===id);
      if(url.searchParams.get('origin')==='eq.catalog_import') rows=[];
      const select=url.searchParams.get('select');
      data=select==='*'?rows[0]:rows.map(({chapters: _chapters,...summary})=>summary);
    } else if(path.endsWith('/bookmarks')) {
      if(req.method()==='POST') {
        if(failBookmark) return route.fulfill({status:403,json:{code:'42501',message:'Denied for regression test'}});
        const row={id:'bookmark',user_id:userId,document_id:body.document_id,created_at:new Date().toISOString()};references=[row];data=row;
      } else if(req.method()==='DELETE') { references=[];data=[{id:'bookmark'}]; }
      else data=references.map(r=>({...r,document:docs.find(d=>d.id===r.document_id)}));
    } else if(path.endsWith('/reading_progress')) data=[...progress.values()];
    else if(path.endsWith('/rpc/save_reading_position')) {
      const row={id:'progress',user_id:userId,document_id:body.p_document_id,position:body.p_position,chapter_index:body.p_chapter_index,scroll_percent:body.p_scroll_percent,revision:(progress.get(body.p_document_id)?.revision||0)+1,mutation_id:body.p_mutation_id,updated_at:new Date().toISOString()};
      progress.set(body.p_document_id,row);data={accepted:true,row};
    } else if(path.endsWith('/functions/v1/opds-fetch')) {
      const slow=url.searchParams.get('url')?.includes('gutenberg');
      if(slow) await new Promise(resolve=>setTimeout(resolve,350));
      data={title:slow?'Obsolete feed':'Current feed',books:[],count:0,subtitle:''};
    }
    await route.fulfill({json:data});
  });
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  page.on('pageerror',error=>{ errors.push(error.message); console.error('Browser exception:',error.message); });
  await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Architecture QA',exact:true}).waitFor();
  await page.getByRole('button',{name:'Start Reading',exact:true}).first().click();
  await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  // A failed mutation retains confirmed cache state and displays a useful error.
  failBookmark=true;
  await page.getByRole('button',{name:'Bookmark document',exact:true}).click();
  await page.getByText('Denied for regression test',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Bookmark document',exact:true}).waitFor();
  failBookmark=false;
  await page.getByRole('button',{name:'Bookmark document',exact:true}).click();
  await page.getByRole('button',{name:'Remove bookmark',exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo(0,600));
  await page.waitForFunction(()=>document.body.textContent.includes('Position saved'));
  // Explicit chapter navigation produces a typed TXT position.
  const nextChapter=page.getByRole('button',{name:'Next',exact:true});
  const saved = page.waitForResponse(response=>response.url().endsWith('/rpc/save_reading_position')&&response.request().postDataJSON().p_position.chapterIndex===1);
  await nextChapter.click();
  await saved;
  assert.ok([...progress.values()].some(row=>row.position.format==='txt'&&row.position.chapterIndex===1));
  await page.getByRole('button',{name:'Library',exact:true}).click();
  await page.getByRole('button',{name:'Architecture QA',exact:true}).click();
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByPlaceholder('Enter your full name').fill('Refactored Profile');
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await page.getByRole('button',{name:'Refactored Profile',exact:true}).waitFor();
  assert.equal(profile.full_name,'Refactored Profile');
  await page.getByPlaceholder('Enter new password').fill('abcdef');
  await page.getByPlaceholder('Confirm new password').fill('different');
  await page.getByRole('button',{name:'Update Password',exact:true}).click();
  await page.getByText('New passwords do not match.',{exact:true}).waitFor();
  await page.getByPlaceholder('Confirm new password').fill('abcdef');
  await page.getByRole('button',{name:'Update Password',exact:true}).click();
  await page.getByText('Password changed successfully.',{exact:true}).waitFor();
  // Preference parser repaired the invalid persisted fields without crashing the reader.
  const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('reader-settings')));
  assert.notEqual(settings.theme,'invalid');
  assert.notEqual(settings.fontSize,'huge');
  await page.getByRole('button',{name:'Import Books',exact:true}).click();
  await page.getByRole('button',{name:/Online Library/}).click();
  await page.getByRole('button',{name:'Browse Books',exact:true}).nth(0).click();
  await page.getByRole('button',{name:'Back to catalogs',exact:true}).click();
  await page.getByRole('button',{name:'Browse Books',exact:true}).nth(1).click();
  await page.getByRole('heading',{name:'Current feed',exact:true}).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole('heading',{name:'Obsolete feed',exact:true}).count(),0);
  // Click backdrop, then upload a TXT using the actual workflow controller.
  await page.mouse.click(5,5);
  await page.getByRole('button',{name:'Import Books',exact:true}).click();
  await page.getByRole('button',{name:/Upload a book/}).click();
  await page.locator('input[type=file]').first().setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
  await page.getByText(/contents do not match|valid.*PDF|Choose a PDF/).first().waitFor();
  await page.locator('input[type=file]').first().setInputFiles({name:'chapter.txt',mimeType:'text/plain',buffer:Buffer.from('Chapter One\n\nReadable upload text.')});
  await page.getByText('chapter.txt',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove file',exact:true}).click();
  assert.equal(await page.getByText('chapter.txt',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Refactored Profile',exact:true}).click();
  await page.getByRole('button',{name:'Log Out',exact:true}).click();
  await page.getByRole('button',{name:'Sign In',exact:true}).first().waitFor();
  await page.goto(`http://127.0.0.1:${port}/__architecture-qa`,{waitUntil:'domcontentloaded'});
  await page.getByRole('region',{name:'QA PDF PDF reader',exact:true}).waitFor({timeout:20000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.width>0);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.waitForFunction(()=>window.qaEvents.some(p=>p.format==='pdf'&&p.page===2&&p.view.scale>1.3));
  await page.getByRole('button',{name:'Switch EPUB',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('iframe').length>0);
  await page.getByText('EPUB ready',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Next EPUB',exact:true}).click();
  await page.waitForFunction(()=>window.qaEvents.some(p=>p.format==='epub'&&p.cfi)).catch(async error => { console.log('EPUB diagnostics',await page.locator('body').innerText(),await page.evaluate(()=>window.qaEvents));throw error; });
  await page.goto(`http://127.0.0.1:${port}/__architecture-qa`,{waitUntil:'domcontentloaded'});
  await page.getByRole('region',{name:'QA PDF PDF reader',exact:true}).waitFor({timeout:20000});
  assert.deepEqual(errors,[]);
  console.log('PASS: auth/session, TXT, bookmark failure/success, profile/password, preferences, catalog cancellation, upload validation/reset, logout, PDF resume/zoom, EPUB navigation/disposal; no browser exceptions.');
} finally { await browser.close(); await server.close(); }

