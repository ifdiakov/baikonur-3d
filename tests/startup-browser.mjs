import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

// Exercise transport failures with the production 15/20-second deadlines.
// Only frame scheduling is controlled; every deliberate frame is real WebGL.
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const origin=new URL(base).origin,prefix=process.env.QA_PREFIX||'local',out='qa-startup';
const revision='20261030-startup-recovery-v1';
const evidence={base,prefix,revision,cases:{}};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
let activePage=null,activeCase=null;

async function newCase(name,{holdCatalog=false,httpFailure=false,stalledBody=null}={}){
 console.log('STARTUP_CASE',name);
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage();activePage=page;activeCase=name;page.setDefaultTimeout(60000);
 const record={externalBlocked:[],fontStylesheetsPending:[],pageErrors:[],shaderErrors:[],catalogRequests:0};
 evidence.cases[name]=record;
 let releaseCatalog;
 const catalogGate=new Promise(resolve=>{releaseCatalog=resolve;});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(/^https?:$/.test(url.protocol)&&url.origin!==origin){
   if(url.hostname==='fonts.googleapis.com'){
    // Deliberately never answer this stylesheet request. Its completion must
    // not be required for scripts, the initial frame, or working controls.
    record.fontStylesheetsPending.push(request.url());return;
   }
   record.externalBlocked.push({url:request.url(),type:request.resourceType()});
   await route.abort('blockedbyclient');return;
  }
  if(url.pathname.endsWith('/data/catalog.json')){
   record.catalogRequests++;
   if(httpFailure){await route.fulfill({status:500,contentType:'application/json',body:'{"error":"startup test"}'});return;}
   if(holdCatalog)await catalogGate;
  }
  await route.continue();
 });
 page.on('pageerror',error=>record.pageErrors.push(error.message));
 page.on('console',message=>{
  if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(message.text()))record.shaderErrors.push(message.text());
 });
 await page.addInitScript(({stalledBody})=>{
  const state=window.__STARTUP_TEST={feedback:[],ready:[],stalled:[],animateRequests:0};
  const nativeFrame=window.requestAnimationFrame.bind(window);let pendingFrame;
  window.requestAnimationFrame=fn=>{
   if(fn.name==='animate'){state.animateRequests++;pendingFrame=fn;return 0;}
   return nativeFrame(fn);
  };
  window.__STARTUP_FRAME=()=>{const fn=pendingFrame;pendingFrame=null;fn?.(performance.now());};
  let lastFeedback='';
  new MutationObserver(()=>{
   const loading=document.getElementById('museumLoading');if(!loading)return;
   const message=document.getElementById('museumLoadingMessage')?.textContent||'';
   const signature=[loading.hidden,loading.dataset.state||'',message].join('|');
   if(signature===lastFeedback)return;lastFeedback=signature;
   const feedback={at:performance.now(),hidden:loading.hidden,state:loading.dataset.state||'loading',message};
   state.feedback.push(feedback);
   if(loading.dataset.state==='ready'){
    const stats=window.__BAIKONUR_QA?.stats();
    state.ready.push({...feedback,render:stats?.render||null,animateRequests:state.animateRequests});
   }
  }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-state']});
  if(!stalledBody)return;
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
   const isCatalog=stalledBody==='catalog'&&url.pathname.endsWith('/data/catalog.json');
   const isModel=stalledBody==='models'&&/\/assets\/models\/(?:tua|ukss)\/model-v1\.glb$/.test(url.pathname);
   if(!isCatalog&&!isModel)return originalFetch(input,init);
   const item={path:url.pathname,startedAt:performance.now(),headersAt:null,abortedAt:null};state.stalled.push(item);
   const signal=init?.signal||(input instanceof Request?input.signal:null);
   const body=new ReadableStream({start(controller){
    // Headers arrive successfully, but the body never completes. For JSON,
    // retain the unresolved body even after abort to also cover fetch wrappers
    // that fail to reject: the product's own deadline must remain effective.
    if(isCatalog)controller.enqueue(new TextEncoder().encode('{"sites":'));
    const abort=()=>{
     item.abortedAt=performance.now();
     if(isModel)controller.error(new DOMException('Stalled body aborted','AbortError'));
    };
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
   }});
   item.headersAt=performance.now();
   return Promise.resolve(new Response(body,{status:200,headers:{'Content-Type':isCatalog?'application/json':'model/gltf-binary'}}));
  };
 },{stalledBody});
 const url=new URL(base);url.searchParams.set('startup-check',name);
 return {page,record,releaseCatalog,navigate:()=>page.goto(url.href,{waitUntil:'commit',timeout:90000}),
  close:async()=>{releaseCatalog();await context.close();activePage=null;}};
}

async function loaderState(page){
 return page.evaluate(()=>{
  const loading=document.getElementById('museumLoading');
  return {hidden:loading?.hidden,state:loading?.dataset.state||'loading',message:document.getElementById('museumLoadingMessage')?.textContent,
   retryHidden:document.getElementById('museumRetry')?.hidden,
   inert:['museumLeftStack','labelLayer','timeDock','hero'].map(id=>({id,inert:document.getElementById(id)?.inert})),
   qaAvailable:Boolean(window.__BAIKONUR_QA),test:window.__STARTUP_TEST};
 });
}
async function waitReady(page){
 await page.waitForFunction(()=>document.getElementById('museumLoading')?.dataset.state==='ready',null,{timeout:180000});
 const state=await loaderState(page);
 assert.equal(state.hidden,true);assert.ok(state.inert.every(item=>item.inert===false),'Controls become interactive after startup');
 assert.equal(state.test.ready.length,1,'Ready is reached once');
 assert.ok(state.test.ready[0].render?.drawCalls>0&&state.test.ready[0].render?.triangles>0,'Ready follows the first actual renderer pass');
 assert.ok(state.test.ready[0].animateRequests>=1,'The initial frame has scheduled its continuation');
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(stats.museumRevision,revision);assert.equal(stats.shadersValid,true);
 assert.equal(await page.locator('#error').isVisible(),false);
 return {state,stats};
}
async function waitError(page){
 await page.waitForFunction(()=>document.getElementById('museumLoading')?.dataset.state==='error',null,{timeout:30000});
 const state=await loaderState(page);
 assert.equal(state.hidden,false);assert.equal(state.retryHidden,false);
 assert.match(state.message,/Не удалось загрузить музей/);assert.match(state.message,/повторите/i);
 assert.ok(state.inert.every(item=>item.inert===true),'Incomplete scene controls remain inert');
 assert.equal(state.qaAvailable,false);assert.deepEqual(state.test.ready,[],'A failed required request never reports ready');
 return state;
}
const step=page=>page.evaluate(()=>window.__STARTUP_FRAME());
const camera=page=>page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
const elevation=({position:p,target:t})=>Math.atan2(p[1]-t[1],Math.hypot(p[0]-t[0],p[2]-t[2]))*180/Math.PI;
function assertNoRuntimeErrors(record){assert.deepEqual(record.pageErrors,[]);assert.deepEqual(record.shaderErrors,[]);}

try{
 // No third-party response can help this successful launch. Hold the catalog
 // until the test has observed usable startup feedback and inert controls.
 {
  const run=await newCase('external-unavailable',{holdCatalog:true});
  const request=run.page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/data/catalog.json'),{timeout:45000});
  await run.navigate();await request;console.log('STARTUP_CATALOG_HELD');
  const loading=await loaderState(run.page);
  assert.equal(loading.hidden,false);assert.match(loading.message,/Загружаем|Готовим|Открываем/);
  assert.ok(loading.inert.every(item=>item.inert===true));assert.equal(loading.qaAvailable,false);
  run.record.beforeReady={message:loading.message,inert:loading.inert};run.releaseCatalog();
  const ready=await waitReady(run.page);console.log('STARTUP_OFFLINE_READY');
  assert.equal(ready.stats.ukss.status,'ready');assert.equal(ready.stats.mik112.tua.status,'ready');
  assert.ok(run.record.fontStylesheetsPending.length>0,'A genuinely pending font stylesheet does not block startup');
  assert.deepEqual(run.record.externalBlocked.filter(item=>item.type==='script'),[],'All executable engine modules come from the museum origin');
  const overview=await camera(run.page);
  await run.page.locator('#top').click();await step(run.page);const top=await camera(run.page);
  assert.ok(elevation(top)>80,'The top button changes the live camera to a top view');
  assert.notDeepEqual(top.position,overview.position);
  await run.page.locator('#all').click();await step(run.page);const all=await camera(run.page);
  assert.ok(elevation(all)<80,'The whole-museum button restores the oblique overview');
  assert.notDeepEqual(all.position,top.position);
  await run.page.screenshot({path:`${out}/${prefix}-ready.png`,timeout:90000});
  run.record.ready=ready.state.test.ready[0];run.record.feedback=ready.state.test.feedback;
  run.record.models={ukss:ready.stats.ukss.status,tua:ready.stats.mik112.tua.status};run.record.cameras={overview,top,all};
  assertNoRuntimeErrors(run.record);await run.close();
 }
 {
  const run=await newCase('required-http-error',{httpFailure:true});await run.navigate();
  run.record.error=await waitError(run.page);
  assert.match(await run.page.locator('#error').textContent(),/HTTP 500/);
  // A real click must reload and issue a new request, rather than leave a
  // decorative retry control on the failed page. Keep the server failing.
  const requestsBefore=run.record.catalogRequests;
  await Promise.all([
   run.page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/data/catalog.json'),{timeout:45000}),
   run.page.locator('#museumRetry').click({noWaitAfter:true})
  ]);
  await waitError(run.page);assert.ok(run.record.catalogRequests>requestsBefore,'Retry reloads the document and requests the data again');
  await run.page.screenshot({path:`${out}/${prefix}-required-http-error.png`,timeout:90000});
  assertNoRuntimeErrors(run.record);await run.close();
 }
 {
  const run=await newCase('required-body-timeout',{stalledBody:'catalog'});await run.navigate();
  const state=await waitError(run.page),request=state.test.stalled[0];
  assert.equal(state.test.stalled.length,1);assert.ok(request.headersAt>=request.startedAt);
  assert.ok(request.abortedAt!==null,'The timeout aborts the body request');
  const elapsed=request.abortedAt-request.startedAt;
  assert.ok(elapsed>=14000&&elapsed<23000,'The unchanged 15-second deadline includes the response body: '+elapsed);
  assert.match(state.message,/не ответил вовремя/i);assert.equal(state.test.animateRequests,0);
  run.record.error=state;run.record.bodyTimeoutMs=elapsed;
  await run.page.screenshot({path:`${out}/${prefix}-required-body-timeout.png`,timeout:90000});
  assertNoRuntimeErrors(run.record);await run.close();
 }
 {
  const run=await newCase('parallel-model-fallback',{stalledBody:'models'});await run.navigate();
  await run.page.waitForFunction(()=>window.__STARTUP_TEST?.stalled.length>0,null,{timeout:45000});
  // This fails a sequential implementation before waiting for two deadlines.
  await run.page.waitForFunction(()=>window.__STARTUP_TEST?.stalled.length===2,null,{timeout:10000});
  const waiting=await loaderState(run.page);assert.equal(waiting.hidden,false);
  assert.ok(waiting.inert.every(item=>item.inert===true));assert.match(waiting.message,/модели|модель/i);
  const starts=waiting.test.stalled.map(item=>item.startedAt);
  assert.ok(Math.max(...starts)-Math.min(...starts)<1000,'Both independent model requests start together');
  await run.page.waitForFunction(()=>window.__STARTUP_TEST.stalled.every(item=>item.abortedAt!==null),null,{timeout:30000});
  const requests=await run.page.evaluate(()=>window.__STARTUP_TEST.stalled);
  const total=Math.max(...requests.map(item=>item.abortedAt))-Math.min(...requests.map(item=>item.startedAt));
  assert.ok(total>=19000&&total<30000,'Both original 20-second deadlines expire within one bounded wait: '+total);
  const ready=await waitReady(run.page),models={ukss:ready.stats.ukss,tua:ready.stats.mik112.tua};
  for(const [name,model]of Object.entries(models)){
   assert.equal(model.status,'fallback',name+' remains usable with its fallback');
   assert.equal(model.error.name,'TimeoutError');
   assert.ok(model.loadMs>=19000&&model.loadMs<30000,name+' uses the original bounded deadline');
  }
  run.record.requests=requests;run.record.combinedTimeoutMs=total;run.record.ready=ready.state.test.ready[0];
  run.record.models=Object.fromEntries(Object.entries(models).map(([name,model])=>[name,{status:model.status,error:model.error,loadMs:model.loadMs}]));
  await run.page.screenshot({path:`${out}/${prefix}-model-fallback.png`,timeout:90000});
  assertNoRuntimeErrors(run.record);await run.close();
 }
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('STARTUP_BROWSER_PASS',JSON.stringify({prefix,revision,cases:Object.keys(evidence.cases),
  requiredBodyTimeoutMs:evidence.cases['required-body-timeout'].bodyTimeoutMs,
  combinedModelTimeoutMs:evidence.cases['parallel-model-fallback'].combinedTimeoutMs}));
}catch(error){
 await activePage?.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,activeCase,message:error.message,stack:error.stack,checkedAt:new Date().toISOString()},null,2));
 throw error;
}finally{await browser.close();}
