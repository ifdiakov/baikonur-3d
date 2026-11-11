import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-card-share';
await mkdir(out,{recursive:true});
const files=['index.html','museum.html','workshop.html','encyclopedia.html','workshop/model.html','src/card-share.js','src/card-share.css','src/model-viewer.js','src/model-inspector.js'];
const report={passed:false,base,environment:'Chromium/SwiftShader; mobile viewport/touch emulation. Sharing payload and clipboard calls are intercepted (no messages are sent). Animation frame stepping is test-only.',checks:[],hashes:{}};
let browser,page;
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 if(process.env.VERIFY_PUBLIC==='1')for(const f of files){
  const expected=hash(await readFile(f));let actual;
  for(let i=0;i<18;i++){const r=await fetch(new URL(f+'?share-release='+process.env.GITHUB_SHA+'&attempt='+i,base),{signal:AbortSignal.timeout(15000)});if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,4000));}
  assert.equal(actual,expected,'Live file mismatch: '+f);report.hashes[f]=actual;
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 for(const mode of ['desktop','mobile','workshop']){
  const mobile=mode==='mobile',admin=mode==='workshop';
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  await ctx.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let step;window.requestAnimationFrame=fn=>fn.name==='animate'?(step=fn,0):fn.name==='animateModel'?0:raf(fn);window.__SHARE_FRAME=()=>step?.(performance.now());Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__COPIED_SHARE=text;}}});});
  page=await ctx.newPage();page.setDefaultTimeout(90000);const errors=[],shaderErrors=[];report.current={mode,errors,shaderErrors};
  page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
  const expected=mobile?{kind:'event',id:'buran-loss'}:admin?{kind:'site',id:'tua-112'}:{kind:'site',id:'pad-112'};
  const url=new URL(admin?'workshop.html':'museum.html',base);url.search=new URLSearchParams({share:expected.kind+':'+expected.id,tour:'0'}).toString();
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__MUSEUM_SHARE,null,{timeout:180000});
  assert(await page.evaluate(()=>__MUSEUM_SHARE.ready),'Shared target not opened');await page.evaluate(()=>__SHARE_FRAME());
  const target=await page.evaluate(()=>__MUSEUM_SHARE.current());assert.equal(target.kind,expected.kind);assert.equal(target.id,expected.id);
  const coverage=await page.evaluate(()=>({targets:__MUSEUM_SHARE.targets().length,validLinks:__MUSEUM_SHARE.targets().map(t=>__MUSEUM_SHARE.url(t)).length,buttons:document.querySelectorAll('#labelLayer .museum-share-button').length,duplicateCards:[...document.querySelectorAll('.site-label,.detail-card')].filter(e=>e.querySelectorAll(':scope > .museum-share-button').length!==1).length}));
  assert.equal(coverage.validLinks,coverage.targets);assert.equal(coverage.buttons,coverage.targets*2);assert.equal(coverage.duplicateCards,0);
  await page.locator('#infoShare').click();let copied=await page.evaluate(()=>__COPIED_SHARE),parsed=new URL(copied);assert.equal(parsed.searchParams.get('share'),expected.kind+':'+expected.id);assert(!copied.includes('workshop.html'));assert.equal(parsed.searchParams.get('draft'),null);
  assert(await page.locator('.museum-share-toast').isVisible());await page.screenshot({path:out+'/'+prefix+'-'+mode+'-card.png'});
  if(admin){assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());}
  if(mode==='desktop'){
   for(const id of ['tua-112','pad-250а','mzk','sdi']){
    const match=await page.evaluate(id=>__MUSEUM_SHARE.targets().find(t=>id==='tua-112'||id.startsWith('pad-')?t.id===id:t.id.includes(id)),id);assert(match,'Missing separate card '+id);
    assert(await page.evaluate(t=>__MUSEUM_SHARE.open(t),match));await page.locator('#infoShare').click();assert.equal(new URL(await page.evaluate(()=>__COPIED_SHARE)).searchParams.get('share'),'site:'+match.id);
   }
   assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'story',id:'abort-51'})));await page.locator('#infoShare').click();assert.equal(new URL(await page.evaluate(()=>__COPIED_SHARE)).searchParams.get('share'),'story:abort-51');
   assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'rocket',id:'energia-polyus'})));await page.locator('#infoShare').click();assert.equal(new URL(await page.evaluate(()=>__COPIED_SHARE)).searchParams.get('share'),'rocket:energia-polyus');
   assert(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'history',id:'search'})));await page.locator('#complexHistoryPanel > .museum-share-button').click();assert.equal(new URL(await page.evaluate(()=>__COPIED_SHARE)).searchParams.get('share'),'history:search');await page.locator('.complex-history__close').click();
   assert.equal(await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'site',id:'does-not-exist'})),false);
   await page.evaluate(()=>__MUSEUM_SHARE.open({kind:'event',id:'buran-loss'}));await page.locator('#buranLossStart').click();
   await page.waitForFunction(()=>__BAIKONUR_QA.buranLoss.stats().active,null,{timeout:90000});await page.evaluate(()=>{__BAIKONUR_QA.buranLoss.pause();__SHARE_FRAME();});
   assert.equal(await page.locator('#buranLossPanel > .museum-share-button').count(),1);await page.locator('#buranLossPanel > .museum-share-button').click();assert.equal(new URL(await page.evaluate(()=>__COPIED_SHARE)).searchParams.get('share'),'event:buran-loss');await page.screenshot({path:out+'/'+prefix+'-event.png'});
   await page.locator('#buranLossClose').click();
   await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__NATIVE_SHARE=data;}}));await page.locator('#infoShare').click();assert.equal(new URL(await page.evaluate(()=>__NATIVE_SHARE.url)).searchParams.get('share'),'event:buran-loss');
   await page.evaluate(()=>{window.__COPIED_SHARE=null;Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError');}});});await page.locator('#infoShare').click();assert.equal(await page.evaluate(()=>__COPIED_SHARE),null);
   await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Permission denied');}}});});
   await page.locator('#infoShare').click();assert(await page.locator('.museum-share-dialog[open]').isVisible());assert((await page.locator('.museum-share-dialog input').inputValue()).includes('event%3Aburan-loss'));await page.locator('.museum-share-dialog button').click();
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__COPIED_SHARE=text;}}}));
   const targetURL=new URL('museum.html?share=model%3Ard180&tour=0',base);await page.goto(targetURL.href,{waitUntil:'domcontentloaded',timeout:120000});
   await page.waitForFunction(()=>window.__MUSEUM_SHARE&&__BAIKONUR_QA.modelInspector.stats().ready,null,{timeout:180000});
   assert.equal(await page.evaluate(()=>__BAIKONUR_QA.modelInspector.stats().modelId),'rd180');
   const frame=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(frame);await frame.locator('.intro > .museum-share-button').click();assert.equal(new URL(await frame.evaluate(()=>__COPIED_SHARE)).searchParams.get('share'),'model:rd180');await page.screenshot({path:out+'/'+prefix+'-model.png'});
  }
  if(mobile){assert.equal(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().active),false);const r=await page.locator('#infoShare').boundingBox();assert(r&&r.x>=0&&r.x+r.width<=390&&r.y>=0&&r.y+r.height<=844);}
  assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.checks.push({mode,passed:true,coverage,shared:expected,errors,shaderErrors});await ctx.close();console.log('SHARE_MODE_PASS',mode);
 }
 const ctx=await browser.newContext({viewport:{width:1280,height:900}});page=await ctx.newPage();
 await page.addInitScript(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__COPIED_SHARE=text;}}});});
 await page.goto(new URL('encyclopedia.html#r7',base).href,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForSelector('#detail > .museum-share-button');
 assert.equal(await page.locator('#cards .museum-share-button').count(),await page.locator('#cards .card').count());assert.equal(await page.locator('button button').count(),0);
 await page.locator('#detail > .museum-share-button').click();assert(new URL(await page.evaluate(()=>__COPIED_SHARE)).pathname.endsWith('/encyclopedia.html'));assert.equal(new URL(await page.evaluate(()=>__COPIED_SHARE)).hash,'#r7');await ctx.close();report.checks.push({mode:'encyclopedia',passed:true});
 report.passed=true;delete report.current;
}catch(error){report.error=error.stack;await page?.screenshot({path:out+'/'+prefix+'-failure.png',timeout:30000}).catch(()=>{});throw error;}
finally{await writeFile(out+'/'+prefix+'-report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('CARD_SHARE_BROWSER_PASS',JSON.stringify(report.checks.map(c=>c.mode)));
