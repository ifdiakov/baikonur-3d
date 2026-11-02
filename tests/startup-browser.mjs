import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

// Exercise transport failures with the production 15/20-second deadlines.
// Actual-scene cases control only frame scheduling; their frames are real WebGL.
// Small DOM fixtures separately exercise status projection and the exit bound.
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const origin=new URL(base).origin,prefix=process.env.QA_PREFIX||'local',out='qa-startup';
const revision='20261102-rail-scheme-v1';
const welcome='Добро пожаловать на космодром Байконур первый в истории и крупнейший на планете космическая гавань человечества';
const slogan='КОСМОС НАЧИНАЕТСЯ С НАЗЕМКИ';
const launchStatusCount=20,finalLaunchStep=launchStatusCount-1,lastLoadingLaunchStep=finalLaunchStep-1;
const launchStatuses=[
 'ВЫБОР МЕСТА ДЛЯ СТРОИТЕЛЬСТВА КОСМОДРОМА','РАЗМЕТКА МЕСТНОСТИ','ЗАГРУЗКА СТАРТОВЫХ КОМПЛЕКСОВ',
 'СТРОИТЕЛЬСТВО ИНФРАСТРУКТУРЫ','ПРОКЛАДКА Ж/Д ПУТЕЙ','ОРГАНИЗАЦИЯ ЭНЕРГОСНАБЖЕНИЯ',
 'ДОСТАВКА СРЕДСТВ ВЫВЕДЕНИЯ','ОГНЕВЫЕ ИСПЫТАНИЯ','НАСТРОЙКА ТЕЛЕМЕТРИИ','ЗАГРУЗКА ЦИКЛОГРАММ',
 'РАСЧЁТ ТРАЕКТОРИЙ И ЦЕЛЕВЫХ ОРБИТ','ЗАСЕДАНИЕ ГОСКОМИССИИ','ВЫВОЗ И ВЕРТИКАЛИЗАЦИЯ',
 'КОНТРОЛЬНЫЕ МЕРОПРИЯТИЯ','ПОДЪЁМ БОКОВЫХ ПНЕВМОКОЛОНН','ЗАПРАВКА КОМПОНЕНТАМИ ТОПЛИВА',
 'КЛЮЧ НА ДРЕНАЖ','ПРОДУВКА','КЛЮЧ НА СТАРТ','ЗАЖИГАНИЕ/КИСЛОРОД!'
];
const firstLaunchStatus=launchStatuses[0],finalLaunchStatus=launchStatuses[finalLaunchStep];
const exitBudgetMs=460,exitSchedulingMarginMs=250,exitCallbackMarginMs=50;
const evidence={base,prefix,revision,cases:{}};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
let activePage=null,activeCase=null;

async function newCase(name,{holdCatalog=false,httpFailure=false,stalledBody=null,reducedMotion=false}={}){
 console.log('STARTUP_CASE',name);
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,serviceWorkers:'block',
  reducedMotion:reducedMotion?'reduce':'no-preference'});
 const page=await context.newPage();activePage=page;activeCase=name;page.setDefaultTimeout(60000);
 const record={externalBlocked:[],fontStylesheetsPending:[],pageErrors:[],shaderErrors:[],
  networkFailures:[],badHTTPResponses:[],consoleErrors:[],catalogRequests:0};
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
  if(stalledBody==='optional-models'&&url.pathname.endsWith('/assets/models/mriya-buran/far-v2.glb')){
   await route.fulfill({status:503,contentType:'text/plain',body:'Expected optional model failure'});return;
  }
  await route.continue();
 });
 page.on('requestfailed',request=>{
  const url=new URL(request.url());
  if(url.origin===origin)record.networkFailures.push({url:request.url(),path:url.pathname,
   error:request.failure()?.errorText||'Unknown request failure',type:request.resourceType()});
 });
 page.on('response',response=>{
  const url=new URL(response.url()),type=response.request().resourceType();
  if(response.status()>=400&&(url.origin===origin||type==='script'||type==='stylesheet'))
   record.badHTTPResponses.push({url:response.url(),path:url.pathname,status:response.status(),statusText:response.statusText(),type});
 });
 page.on('pageerror',error=>record.pageErrors.push(error.message));
 page.on('console',message=>{
  if(message.type()!=='error')return;
  record.consoleErrors.push(message.text());
  if(/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(message.text()))record.shaderErrors.push(message.text());
 });
 await page.addInitScript(({stalledBody,finalLaunchStep,exitBudgetMs})=>{
  const state=window.__STARTUP_TEST={feedback:[],launch:[],launchWrites:[],counterWrites:[],ready:[],stalled:[],
   animateRequests:0,deadlineProbe:null,hiddenWrite:null};
  const nativeMark=performance.mark;
  performance.mark=function(){
   const result=nativeMark.apply(this,arguments);
   if(arguments[0]==='museum:first-frame'&&!state.deadlineProbe){
    const firstFrame=window.__MUSEUM_STARTUP.stats().marks.find(mark=>mark.name==='first-frame').at;
    const probe=state.deadlineProbe={firstFrame,dueAt:firstFrame+exitBudgetMs,armedAt:performance.now(),firedAt:null};
    // An independent timer records when the browser can actually deliver the
    // existing deadline. It neither drives nor extends the production exit.
    setTimeout(()=>{
     probe.firedAt=performance.now();
     const loading=document.getElementById('museumLoading');
     probe.hiddenAtFire=loading?.hidden;probe.launchStepAtFire=Number(loading?.dataset.launchStep);
    },Math.max(0,Math.ceil(probe.dueAt-performance.now())));
   }
   return result;
  };
  const nativeFrame=window.requestAnimationFrame.bind(window);let pendingFrame;
  window.requestAnimationFrame=fn=>{
   if(fn.name==='animate'){state.animateRequests++;pendingFrame=fn;return 0;}
   return nativeFrame(fn);
  };
  window.__STARTUP_FRAME=()=>{const fn=pendingFrame;pendingFrame=null;fn?.(performance.now());};
  let lastFeedback='',lastLaunchStep=null,batch=0,mutationOrder=0;
  new MutationObserver(records=>{
   const loading=document.getElementById('museumLoading');if(!loading)return;
   const currentBatch=++batch,introReady=Boolean(window.__MUSEUM_PRELOADER);
   for(const record of records){
    const order=++mutationOrder;
    if(record.target===loading&&record.type==='attributes'&&record.attributeName==='hidden'&&loading.hidden)
     state.hiddenWrite??={batch:currentBatch,order,at:performance.now()};
    if(!introReady||record.type!=='childList'||!record.addedNodes.length)continue;
    const writes=record.target.id==='museumLaunchStatus'?state.launchWrites:
     record.target.id==='museumLaunchStep'?state.counterWrites:null;
    if(!writes)continue;
    const value=[...record.addedNodes].map(node=>node.textContent).join('').replace(/\s+/g,' ').trim();
    // HTML and controller initialization can both write the initial phrase.
    if(writes.length===1&&writes[0].value===value)continue;
    writes.push({value,batch:currentBatch,order,at:performance.now()});
   }
   const message=document.getElementById('museumLoadingMessage')?.textContent||'';
   const progress=document.getElementById('museumStageProgress');
   const stage=progress?Number(progress.getAttribute('aria-valuenow')):null;
   const total=progress?Number(progress.getAttribute('aria-valuemax')):null;
   const launchStep=loading.hasAttribute('data-launch-step')?Number(loading.dataset.launchStep):null;
   const launchElement=document.getElementById('museumLaunchStatus');
   const launchStatus=launchElement?.textContent.trim()||'';
   const launchCounter=document.getElementById('museumLaunchStep')?.textContent.trim()||'';
   const fill=document.getElementById('museumProgressFill')?.style.transform.match(/^scaleX\(([^)]+)\)$/);
   const fillScale=fill?Number(fill[1]):null;
   const signature=[loading.hidden,loading.dataset.state||'',message,stage,total,launchStep,launchStatus,launchCounter,fillScale,introReady].join('|');
   if(signature===lastFeedback)return;lastFeedback=signature;
   const render=(stage===total&&total>0||launchStep===finalLaunchStep)?window.__BAIKONUR_QA?.renderStats()||null:null;
   if(introReady&&launchStatus&&Number.isInteger(launchStep)&&launchStep!==lastLaunchStep){
    state.launch.push({at:performance.now(),batch:currentBatch,step:launchStep,text:launchStatus,counter:launchCounter,stage,fillScale,render,
     hidden:loading.hidden,opacity:launchElement?Number(getComputedStyle(launchElement).opacity):null,
     animations:launchElement?.getAnimations().length||0,paintTick:window.__PRELOADER_FIXTURE?.paintTicks??null});
    lastLaunchStep=launchStep;
   }
   const feedback={at:performance.now(),batch:currentBatch,hidden:loading.hidden,state:loading.dataset.state||'loading',message,stage,total,
    launchStep,launchStatus,launchCounter,fillScale,render};
   state.feedback.push(feedback);
   if(loading.dataset.state==='ready'){
    const readyRender=window.__BAIKONUR_QA?.renderStats();
    const menus=['museumLeftStack','museumRightStack'].map(id=>({id,inert:document.getElementById(id)?.inert}));
    state.ready.push({...feedback,render:readyRender||null,animateRequests:state.animateRequests,menus,
     chromeReady:document.body.classList.contains('museum-ready')});
   }
  }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-state','data-launch-step','aria-valuenow']});
  if(!stalledBody)return;
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
   const isCatalog=stalledBody==='catalog'&&url.pathname.endsWith('/data/catalog.json');
   const isModel=(stalledBody==='models'&&/\/assets\/models\/(?:tua|ukss)\/model-v2\.glb$/.test(url.pathname))||
    (stalledBody==='optional-models'&&url.pathname.endsWith('/assets/models/rockets/soyuz.glb'));
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
 },{stalledBody,finalLaunchStep,exitBudgetMs});
 const url=new URL(base);url.searchParams.set('startup-check',name);
 return {page,record,releaseCatalog,navigate:()=>page.goto(url.href,{waitUntil:'commit',timeout:90000}),
  close:async()=>{releaseCatalog();await context.close();activePage=null;}};
}

async function loaderState(page){
 return page.evaluate(()=>{
  const loading=document.getElementById('museumLoading');
  return {hidden:loading?.hidden,state:loading?.dataset.state||'loading',message:document.getElementById('museumLoadingMessage')?.textContent,
   retryHidden:document.getElementById('museumRetry')?.hidden,
   inert:['museumLeftStack','museumRightStack','labelLayer','timeDock','hero'].map(id=>({id,inert:document.getElementById(id)?.inert})),
   chromeReady:document.body.classList.contains('museum-ready'),
   qaAvailable:Boolean(window.__BAIKONUR_QA),test:window.__STARTUP_TEST};
 });
}
async function waitReady(page){
 await page.waitForFunction(()=>document.getElementById('museumLoading')?.dataset.state==='ready',null,{timeout:180000});
 const state=await loaderState(page);
 assert.equal(state.hidden,true);assert.ok(state.inert.every(item=>item.inert===false),'Controls become interactive after startup');
 assert.equal(state.test.ready.length,1,'Ready is reached once');
 assert.equal(state.chromeReady,true);
 assert.equal(state.test.ready[0].chromeReady,true,'The shared appearance state is set in the same ready transaction');
 assert.ok(state.test.ready[0].menus.every(item=>item.inert===false),'Both side menus become interactive together at ready');
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
 assert.equal(state.chromeReady,false,'Failed startup must not reveal either side menu');
 assert.equal(state.qaAvailable,false);assert.deepEqual(state.test.ready,[],'A failed required request never reports ready');
 const intro=await preloaderState(page);
 assert.equal(intro.paused,true);assert.equal(intro.motion,'paused');assert.equal(intro.running,0);
 assert.ok(intro.launchStep<finalLaunchStep&&intro.stage<intro.total,'Failed loading never claims ignition or completed progress');
 assert.ok(intro.toggle.disabled||!await page.locator('#museumMotionToggle').isVisible(),
  'A failed loader cannot restart the launch animation');
 return state;
}
const step=page=>page.evaluate(()=>window.__STARTUP_FRAME());
const camera=page=>page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
function assertNoRuntimeErrors(record){assert.deepEqual(record.pageErrors,[]);assert.deepEqual(record.shaderErrors,[]);}

async function preloaderState(page){
 return page.evaluate(()=>{
  const loader=document.getElementById('museumLoading'),progress=document.getElementById('museumStageProgress');
  const message=document.getElementById('museumLoadingMessage'),toggle=document.getElementById('museumMotionToggle');
  const fill=document.getElementById('museumProgressFill')?.style.transform.match(/^scaleX\(([^)]+)\)$/);
  return {launchStep:Number(loader?.dataset.launchStep),status:document.getElementById('museumLaunchStatus')?.textContent.trim(),
   launchCounter:document.getElementById('museumLaunchStep')?.textContent.trim(),
   welcome:document.getElementById('museumWelcome')?.textContent.replace(/\s+/g,' ').trim(),
   slogan:document.getElementById('museumPreloaderSlogan')?.textContent.replace(/\s+/g,' ').trim(),
   stage:Number(progress?.getAttribute('aria-valuenow')),total:Number(progress?.getAttribute('aria-valuemax')),
   role:progress?.getAttribute('role'),fillScale:fill?Number(fill[1]):null,
   paused:loader?.classList.contains('is-paused'),motion:loader?.dataset.motion,
   running:loader?.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length,
   illustrationRunning:loader?.querySelector('.preloader__illustration')?.getAnimations({subtree:true})
    .filter(animation=>animation.playState==='running').length||0,
   toggle:{tag:toggle?.tagName,pressed:toggle?.getAttribute('aria-pressed'),disabled:toggle?.disabled,
    label:toggle?.getAttribute('aria-label')||toggle?.textContent.trim()},
   live:message?.getAttribute('aria-live'),messageRole:message?.getAttribute('role'),
   outerLive:loader?.getAttribute('aria-live'),outerRole:loader?.getAttribute('role'),
   launch:window.__STARTUP_TEST.launch};
 });
}

async function assertPreloaderFits(page,viewport,{error=false}={}){
 await page.setViewportSize(viewport);
 const layout=await page.evaluate(error=>{
  const loader=document.getElementById('museumLoading');
  const box=loader.getBoundingClientRect();
  const status=document.getElementById(error?'museumLoadingMessage':'museumLaunchStatus'),statusBox=status.getBoundingClientRect();
  const progressBox=document.getElementById('museumStageProgress').getBoundingClientRect();
  const range=document.createRange();range.selectNodeContents(status);
  const lines=new Set([...range.getClientRects()].filter(rect=>rect.width>0).map(rect=>Math.round(rect.top)));
  return {viewport:{width:innerWidth,height:innerHeight},left:box.left,right:box.right,
   clientWidth:loader.clientWidth,scrollWidth:loader.scrollWidth,
   documentWidth:document.documentElement.scrollWidth,
   status:{top:statusBox.top,left:statusBox.left,right:statusBox.right,lines:lines.size,text:status.textContent.trim(),
    scrollWidth:status.scrollWidth,clientWidth:status.clientWidth,scrollHeight:status.scrollHeight,clientHeight:status.clientHeight,
    whiteSpace:getComputedStyle(status).whiteSpace},progressBottom:progressBox.bottom};
 },error);
 assert.ok(layout.left>=-1&&layout.right<=viewport.width+1,'The preloader fits the viewport horizontally');
 assert.ok(layout.scrollWidth<=layout.clientWidth+1,'Preloader content has no horizontal overflow at '+viewport.width);
 assert.ok(layout.documentWidth<=viewport.width+1,'The loading page does not create horizontal overflow');
 assert.ok(layout.status.top>=layout.progressBottom-1,'The visible loading feedback sits beneath the real progress bar');
 assert.ok(layout.status.left>=-1&&layout.status.right<=viewport.width+1,'The visible loading feedback fits horizontally');
 assert.ok(layout.status.scrollWidth<=layout.status.clientWidth+1,'Loading feedback text is not clipped horizontally');
 assert.ok(layout.status.scrollHeight<=layout.status.clientHeight+1,'Loading feedback text is not clipped vertically');
 assert.ok(['normal','pre-wrap','pre-line','break-spaces'].includes(layout.status.whiteSpace),
  'Loading feedback can wrap when the available font and width require it');
 // A short viewport may scroll vertically. The status and recovery action
 // must still be reachable, rather than clipped below a fixed-height card.
 const controls=error?['#museumLoadingMessage','#museumRetry']:['#museumLaunchStatus','#museumMotionToggle'];
 for(const selector of controls){
  const control=page.locator(selector);await control.scrollIntoViewIfNeeded({timeout:2000});
  const box=await control.boundingBox();
  assert.ok(box&&box.width>0&&box.height>0,'Loading feedback remains visible: '+selector);
  assert.ok(box.x>=-1&&box.x+box.width<=viewport.width+1,'Loading feedback fits horizontally: '+selector);
  assert.ok(box.y>=-1&&box.y+box.height<=viewport.height+1,'Loading feedback is reachable by scrolling: '+selector);
 }
 return layout;
}

async function assertReducedMotion(page){
 const motion=await page.evaluate(()=>{
  const loader=document.getElementById('museumLoading');
  // Flush styles after emulating the preference before examining animations.
  loader.getBoundingClientRect();
  return {reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
   running:loader.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length,
   launchStep:Number(loader.dataset.launchStep),paused:loader.classList.contains('is-paused'),motion:loader.dataset.motion,
   toggleDisabled:document.getElementById('museumMotionToggle').disabled,
   togglePressed:document.getElementById('museumMotionToggle').getAttribute('aria-pressed')};
 });
 assert.equal(motion.reduced,true);assert.equal(motion.running,0,'Reduced motion removes decorative preloader animation');
 assert.equal(motion.paused,true);assert.equal(motion.motion,'paused');
 assert.equal(motion.toggleDisabled,true,'The control cannot override the reduced-motion preference');
 assert.equal(motion.togglePressed,'true');
 return motion;
}

async function exercisePreloader(page){
 const initial=await preloaderState(page);
 assert.equal(initial.welcome,welcome,'The welcome preserves the requested wording and letter case');
 assert.equal(initial.slogan,slogan,'The separate slogan preserves its exact uppercase wording');
 assert.equal(await page.locator('#museumPreloaderSlogan').isVisible(),true,'The new slogan is visible during loading');
 assert.equal(initial.launchCounter,String(initial.launchStep+1).padStart(2,'0')+' / '+launchStatusCount,
  'The narrative counter names all twenty launch phrases');
 assert.equal(initial.role,'progressbar');assert.equal(initial.total,9);
 assert.equal(initial.stage,0,'No scene phase is complete while the required catalog is held');
 assert.equal(initial.fillScale,0,'The visible bar starts at the same real progress');
 assert.equal(initial.live,'polite');assert.equal(initial.messageRole,'status');
 assert.notEqual(initial.outerLive,'polite','Changing a launch phrase must not announce the entire loading screen');
 assert.notEqual(initial.outerRole,'status');
 assert.equal(initial.toggle.tag,'BUTTON');assert.equal(initial.toggle.label,'Пауза анимации');
 assert.equal(initial.toggle.pressed,'false');assert.equal(initial.toggle.disabled,false);
 assert.equal(await page.locator('[data-preloader-story],#museumStoryPrev,#museumStoryNext,#museumMapGagarin,#museumMapBuran').count(),0);
 assert.equal(initial.launch[0]?.step,0);assert.equal(initial.launch[0]?.text,firstLaunchStatus);
 assert.equal(initial.launch[0]?.counter,'01 / '+launchStatusCount);
 assert.equal(initial.launchStep,0,'No future launch phrase is shown while the required catalog is held');
 assert.deepEqual(initial.launch.map(item=>item.step),[0]);
 const toggle=page.getByRole('button',{name:'Пауза анимации',exact:true});
 await toggle.focus();await page.keyboard.press('Enter');
 const paused=await preloaderState(page);
 assert.equal(paused.paused,true);assert.equal(paused.motion,'paused');assert.equal(paused.toggle.pressed,'true');
 const layouts=[];
 for(const viewport of [{width:1280,height:800},{width:390,height:720}])
  layouts.push(await assertPreloaderFits(page,viewport));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.getElementById('museumMotionToggle').disabled);
 const motion=await assertReducedMotion(page);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(()=>!document.getElementById('museumMotionToggle').disabled);
 const restored=await preloaderState(page);
 assert.equal(restored.paused,true,'Removing the OS preference preserves a visitor-selected pause');
 assert.equal(restored.toggle.pressed,'true');
 const stillPaused=await preloaderState(page);
 assert.equal(stillPaused.launchStep,0,'Presentation controls cannot advance held scene progress');
 assert.equal(stillPaused.status,paused.status);assert.equal(stillPaused.stage,initial.stage);
 assert.equal(stillPaused.fillScale,initial.fillScale);
 assert.equal(stillPaused.running,0,'Pausing stops decorative motion');
 await page.setViewportSize({width:1280,height:800});
 await page.locator('#museumMotionToggle').focus();await page.keyboard.press('Space');
 const resumed=await preloaderState(page);
 assert.equal(resumed.paused,false);assert.equal(resumed.motion,'running');assert.equal(resumed.toggle.pressed,'false');
 // Outlast the removed 2.2-second story timer with animation running. Status
 // text must still describe the held real stage, without extending its 15s limit.
 await page.waitForTimeout(2400);
 const held=await preloaderState(page);
 assert.equal(held.launchStep,0,'Elapsed time alone cannot advance production launch text');
 assert.equal(held.status,firstLaunchStatus);assert.deepEqual(held.launch.map(item=>item.step),[0]);
 assert.equal(held.stage,initial.stage);assert.equal(held.fillScale,initial.fillScale);
 // The actual load below runs with normal motion and records every phase.
 return {initial,paused,stillPaused,resumed,held,layouts,motion};
}

function assertLaunchSequence(sequence,{visible=true}={}){
 assert.deepEqual(sequence.map(item=>item.step),Array.from({length:launchStatusCount},(_,index)=>index),
  'All twenty launch statuses are observed exactly once and in order');
 assert.deepEqual(sequence.map(item=>item.text),launchStatuses,'Every launch phrase preserves the exact requested uppercase text');
 for(let index=0;index<sequence.length;index++){
  const item=sequence[index];
  assert.equal(item.counter,String(index+1).padStart(2,'0')+' / '+launchStatusCount);
  assert.equal(item.opacity,1,'A fast status update never starts invisible');
  assert.equal(item.animations,0,'Status text has no fade-in animation');
  if(visible)assert.equal(item.hidden,false,'Each normal-motion status is observed before the loader is hidden');
  if(index)assert.ok(item.at>sequence[index-1].at,'Consecutive statuses are separate observable DOM updates');
 }
}

function assertExitBudget(stats){
 const firstFrame=stats.marks.find(mark=>mark.name==='first-frame');
 const interactive=stats.marks.find(mark=>mark.name==='interactive');
 assert.ok(firstFrame&&interactive,'Startup records the real-ready and reveal boundaries');
 const elapsed=interactive.at-firstFrame.at;
 assert.ok(elapsed>=0&&elapsed<=exitBudgetMs+exitSchedulingMarginMs,
  'The status queue adds no wait beyond the existing 460ms exit plus scheduling margin: '+elapsed);
 return elapsed;
}

function assertLaunchWrites(test){
 assert.deepEqual(test.launchWrites.map(write=>write.value),launchStatuses,
  'All twenty exact status strings are written to the DOM in order');
 assert.deepEqual(test.counterWrites.map(write=>write.value),
  Array.from({length:launchStatusCount},(_,index)=>String(index+1).padStart(2,'0')+' / '+launchStatusCount));
 assert.ok(test.hiddenWrite,'The observer records the loader being hidden');
 for(let index=0;index<launchStatusCount;index++){
  const text=test.launchWrites[index],counter=test.counterWrites[index];
  assert.ok(text.order<counter.order&&counter.order<test.hiddenWrite.order,
   'Each status and its counter are assigned before the loader is hidden');
  if(index)assert.ok(test.counterWrites[index-1].order<text.order,'DOM status assignments retain their sequence');
 }
}

async function assertExitOpportunity(page,stats,record){
 const firstFrame=stats.marks.find(mark=>mark.name==='first-frame');
 const interactive=stats.marks.find(mark=>mark.name==='interactive');
 assert.ok(firstFrame&&interactive,'Startup records both timing boundaries');
 const elapsed=interactive.at-firstFrame.at;
 let probe=await page.evaluate(()=>window.__STARTUP_TEST.deadlineProbe);
 record.exitMs=elapsed;record.deadlineProbe=probe;
 assert.ok(probe&&probe.firstFrame===firstFrame.at&&probe.dueAt===firstFrame.at+exitBudgetMs,
  'The independent deadline is armed synchronously with the real first frame');
 assert.ok(elapsed>=0);
 if(elapsed>exitBudgetMs){
  if(probe.firedAt===null){
   await page.waitForFunction(()=>window.__STARTUP_TEST.deadlineProbe?.firedAt!==null,null,{polling:25,timeout:2000});
   probe=await page.evaluate(()=>window.__STARTUP_TEST.deadlineProbe);record.deadlineProbe=probe;
  }
  assert.ok(Number.isFinite(probe.firedAt)&&probe.firedAt>=probe.dueAt,'The browser delivered the independent expired deadline');
  assert.ok(interactive.at<=probe.firedAt+exitCallbackMarginMs,
   'Reveal uses the first available deadline opportunity, without a new wait: '+JSON.stringify({elapsed,probe,revealAt:interactive.at}));
 }
 const schedulingLagMs=probe.firedAt===null?null:probe.firedAt-probe.dueAt;
 record.deadlineLagMs=schedulingLagMs;
 return {elapsed,probe,schedulingLagMs};
}

function assertProgressSequence(test,timing){
 assertLaunchWrites(test);
 if(test.launch.length===launchStatusCount&&test.launch.every(item=>!item.hidden)){
  assertLaunchSequence(test.launch);return {coalesced:false};
 }
 // Under a blocked browser, complete() may write the remaining suffix in one
 // turn. Those DOM writes are not claimed to have been individually painted.
 const prefix=test.launch.slice(0,-1),last=test.launch.at(-1);
 assert.ok(prefix.length>=1&&prefix.length<launchStatusCount);
 assert.deepEqual(prefix.map(item=>item.step),Array.from({length:prefix.length},(_,index)=>index),
  'No status can be skipped before the final deadline flush');
 assert.ok(prefix.every(item=>!item.hidden));
 assert.equal(last.step,finalLaunchStep);assert.equal(last.hidden,true);
 assert.equal(last.batch,test.hiddenWrite.batch);assert.equal(last.batch,test.ready[0].batch);
 assert.ok(timing.elapsed>=exitBudgetMs&&Number.isFinite(timing.probe.firedAt)&&timing.schedulingLagMs>=0,
  'Coalescing is allowed only after an independently observed expired deadline');
 assert.deepEqual(test.launchWrites.filter(write=>write.batch===last.batch).map(write=>write.value),
  launchStatuses.slice(prefix.length),'Only the missing final suffix may share the reveal turn');
 for(const item of test.launch){
  assert.equal(item.text,launchStatuses[item.step]);
  assert.equal(item.counter,String(item.step+1).padStart(2,'0')+' / '+launchStatusCount);
  assert.equal(item.opacity,1);assert.equal(item.animations,0);
 }
 return {coalesced:true,observedSteps:test.launch.map(item=>item.step),flushedSteps:launchStatusCount-prefix.length};
}

function assertStageProgress(feedback){
 const stages=feedback.filter(item=>Number.isFinite(item.stage)&&Number.isFinite(item.total)&&item.total>0);
 assert.ok(new Set(stages.map(item=>item.stage)).size>1,'The real boot advances the displayed stages');
 for(let i=0;i<stages.length;i++){
  assert.ok(stages[i].stage>=0&&stages[i].stage<=stages[i].total,'Stages stay within their declared range');
  assert.ok(Math.abs(stages[i].fillScale-stages[i].stage/stages[i].total)<1e-6,
   'The visible progress bar matches completed scene phases');
  const target=stages[i].stage===stages[i].total?finalLaunchStep:
   Math.floor(stages[i].stage/(stages[i].total-1)*lastLoadingLaunchStep);
  assert.ok(stages[i].launchStep<=target,'Launch text never announces a future scene phase');
  if(stages[i].stage===stages[i].total||stages[i].launchStep===finalLaunchStep)
   assert.ok(stages[i].render?.drawCalls>0&&stages[i].render?.triangles>0,
    'Complete progress and ignition require an actual rendered frame, including during the exit fade');
  if(i)assert.ok(stages[i].stage>=stages[i-1].stage,'Real loading stages never move backwards');
 }
 const firstView=stages.find(item=>/Готовим первый вид космодрома/.test(item.message));
 assert.equal(firstView?.stage,8,'Starting the ninth phase still leaves the first render incomplete');
 const ready=stages.find(item=>item.state==='ready');
 assert.ok(ready&&ready.stage===ready.total,'All stages finish only with a rendered, ready museum');
 assert.equal(ready.launchStep,finalLaunchStep,'The final launch phrase belongs to the completed museum');
 assert.equal(ready.launchStatus,finalLaunchStatus);
 assert.equal(ready.launchCounter,launchStatusCount+' / '+launchStatusCount,'The completed narrative displays 20 / 20');
}

async function exerciseProgressFixtures(){
 const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const markup=source.match(/<!-- MUSEUM_PRELOADER_START -->([\s\S]*?)<!-- MUSEUM_PRELOADER_END -->/)?.[1];
 assert.ok(markup,'The focused fixture reuses the production preloader markup');
 for(const mode of ['burst','paused','reduced','hidden','suspended-raf','main-thread-stall','failed-hidden']){
  const run=await newCase('status-'+mode,{reducedMotion:mode==='reduced'});
  const url=new URL('__preloader-progress-test?mode='+mode,base);
  await run.page.route('**/__preloader-progress-test*',route=>route.fulfill({contentType:'text/html',body:
   `<!doctype html><html lang="ru"><head><meta charset="utf-8">
   <link rel="stylesheet" href="${new URL('src/museum-preloader.css',base).href}"></head>
   <body data-fixture-mode="${mode}">${markup}
   <div id="museumLeftStack" inert><details id="sitesAccordion"><summary>Площадки</summary></details></div>
   <div id="museumRightStack" inert></div><div id="labelLayer" inert></div>
   <div id="timeDock" inert></div><div id="hero" inert></div><main id="view"></main>
   <script>
    window.__PRELOADER_FIXTURE={paintTicks:0,blockedFrames:0,hidden:document.body.dataset.fixtureMode==='hidden'};
    if(['hidden','failed-hidden'].includes(document.body.dataset.fixtureMode)){
     Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__PRELOADER_FIXTURE.hidden});
     Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__PRELOADER_FIXTURE.hidden?'hidden':'visible'});
    }
    if(document.body.dataset.fixtureMode==='suspended-raf')
     window.requestAnimationFrame=()=>{window.__PRELOADER_FIXTURE.blockedFrames++;return 0;};
    requestAnimationFrame(function countPaint(){window.__PRELOADER_FIXTURE.paintTicks++;requestAnimationFrame(countPaint);});
   </script>
   <script src="${new URL('src/museum-preloader.js',base).href}"></script>
   <script src="${new URL('src/museum-startup.js',base).href}"></script></body></html>`}));
  await run.page.goto(url.href,{waitUntil:'load',timeout:90000});
  assert.equal((await preloaderState(run.page)).launchStep,0);
  if(mode==='failed-hidden'){
   const failedAt=await run.page.evaluate(()=>{
    const api=window.__MUSEUM_STARTUP;
    api.stage('Готовим первый вид космодрома…',9);
    api.fail(new Error('Expected fixture failure before the first render'));
    const failedAt=Number(document.getElementById('museumLoading').dataset.launchStep);
    window.__PRELOADER_FIXTURE.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    api.ready();return failedAt;
   });
   await run.page.waitForTimeout(60);
   const state=await loaderState(run.page),intro=await preloaderState(run.page);
   assert.equal(state.state,'error');assert.equal(state.hidden,false);assert.equal(state.retryHidden,false);
   assert.equal(state.chromeReady,false);assert.ok(state.inert.every(item=>item.inert===true));
   assert.deepEqual(state.test.ready,[]);assert.equal(intro.launchStep,failedAt);
   assert.equal(intro.stage,8);assert.equal(intro.illustrationRunning,0);
   assert.equal(intro.toggle.disabled,true);
   assert.deepEqual(state.test.launch.map(item=>item.step),[0],
    'Visibility changes cannot flush queued statuses after startup has failed');
   run.record.error=state;assertNoRuntimeErrors(run.record);await run.close();continue;
  }
  if(mode==='paused'){
   await run.page.getByRole('button',{name:'Пауза анимации',exact:true}).click();
   const targets=[0,2,4,6,9,11,13,15,18];run.record.phases=[];
   for(let index=1;index<=9;index++){
    await run.page.evaluate(index=>window.__MUSEUM_STARTUP.stage('Этап '+index,index),index);
    await run.page.waitForFunction(target=>Number(document.getElementById('museumLoading').dataset.launchStep)===target,
     targets[index-1],{timeout:2000});
    const phase=await preloaderState(run.page);
    assert.equal(phase.stage,index-1);assert.ok(Math.abs(phase.fillScale-(index-1)/9)<1e-6);
    assert.equal(phase.paused,true);assert.equal(phase.toggle.pressed,'true');
    assert.equal(phase.illustrationRunning,0,'Manual pause freezes decoration while real-stage text advances');
    assert.equal(phase.status,launchStatuses[targets[index-1]]);
    run.record.phases.push({index,launchStep:phase.launchStep,stage:phase.stage,illustrationRunning:phase.illustrationRunning});
   }
  }else if(mode==='reduced'){
   await assertReducedMotion(run.page);
   await run.page.evaluate(()=>window.__MUSEUM_STARTUP.stage('Готовим первый вид космодрома…',9));
   await run.page.waitForFunction(()=>Number(document.getElementById('museumLoading').dataset.launchStep)===18,null,{timeout:2000});
   const reduced=await assertReducedMotion(run.page);
   assert.equal(reduced.launchStep,lastLoadingLaunchStep,'Reduced motion still displays genuine stage progress');
  }
  const transition=await run.page.evaluate(setStage=>{
   const api=window.__MUSEUM_STARTUP,loader=document.getElementById('museumLoading');
   if(setStage)api.stage('Готовим первый вид космодрома…',9);
   const before={stage:Number(document.getElementById('museumStageProgress').getAttribute('aria-valuenow')),
    launchStep:Number(loader.dataset.launchStep),hidden:loader.hidden};
   // This is a DOM-only completion signal. Actual-scene cases below retain
   // their independent requirement for a successful real renderer pass.
   api.ready();
   if(document.body.dataset.fixtureMode==='main-thread-stall'){
    const startedAt=performance.now();
    while(performance.now()-startedAt<575){} // Deliberately prevent both rAF and timer delivery.
    window.__PRELOADER_FIXTURE.stall={startedAt,finishedAt:performance.now()};
   }
   return {before,immediate:{hidden:loader.hidden,stage:Number(document.getElementById('museumStageProgress').getAttribute('aria-valuenow')),
    inert:document.getElementById('museumLeftStack').inert}};
  },!['paused','reduced'].includes(mode));
  assert.equal(transition.before.stage,8);assert.equal(transition.before.hidden,false);
  assert.ok(transition.before.launchStep<=lastLoadingLaunchStep,'Ignition is unavailable before the ready signal');
  if(mode==='hidden')assert.equal(transition.before.launchStep,lastLoadingLaunchStep,'Hidden tabs update their status without waiting for a browser frame');
  assert.equal(transition.immediate.stage,9,'Real-ready progress completes synchronously');
  const immediate=['paused','reduced','hidden'].includes(mode);
  assert.equal(transition.immediate.hidden,immediate,'Paused, reduced-motion and hidden views retain immediate completion');
  assert.equal(transition.immediate.inert,!immediate);
  await run.page.waitForFunction(()=>document.getElementById('museumLoading').dataset.state==='ready',null,{polling:25,timeout:2000});
  const state=await loaderState(run.page),intro=await preloaderState(run.page);
  const stats=await run.page.evaluate(()=>window.__MUSEUM_STARTUP.stats());
  run.record.transition=transition;run.record.launch=state.test.launch;run.record.marks=stats.marks;
  run.record.launchWrites=state.test.launchWrites;run.record.counterWrites=state.test.counterWrites;
  run.record.hiddenWrite=state.test.hiddenWrite;
  assert.equal(state.hidden,true);assert.equal(state.chromeReady,true);assert.equal(state.test.ready.length,1);
  assert.ok(state.inert.every(item=>item.inert===false));
  assert.equal(intro.launchStep,finalLaunchStep);assert.equal(intro.status,finalLaunchStatus);
  assert.equal(intro.launchCounter,launchStatusCount+' / '+launchStatusCount);assert.equal(intro.stage,9);
  assertLaunchWrites(state.test);
  if(mode==='main-thread-stall'){
   const timing=await assertExitOpportunity(run.page,stats,run.record);
   run.record.sequencePolicy=assertProgressSequence(state.test,timing);
   run.record.stall=await run.page.evaluate(()=>window.__PRELOADER_FIXTURE.stall);
   assert.ok(run.record.stall.finishedAt-run.record.stall.startedAt>=575,'The fixture actually blocks the main thread');
   assert.ok(timing.schedulingLagMs>=100,'The controlled stall delays delivery beyond the original deadline');
   assert.equal(run.record.sequencePolicy.coalesced,true,'The expired deadline flushes the remaining suffix without a new cycle');
  }else run.record.exitMs=assertExitBudget(stats);
  if(mode==='burst'||mode==='suspended-raf')assertLaunchSequence(state.test.launch);
  if(mode==='paused'||mode==='reduced')assertLaunchSequence(state.test.launch,{visible:false});
  if(mode==='suspended-raf'){
   assert.ok(await run.page.evaluate(()=>window.__PRELOADER_FIXTURE.blockedFrames>0),'The case actually suppresses native frame delivery');
   assert.ok(state.test.launch.every(item=>item.paintTick===0),'The bounded frame fallback works without native rAF delivery');
  }
  assertNoRuntimeErrors(run.record);await run.close();
 }
}

try{
 await exerciseProgressFixtures();
 // No third-party response can help this successful launch. Hold the catalog
 // until the test has observed usable startup feedback and inert controls.
 {
  const run=await newCase('external-unavailable',{holdCatalog:true});
  const request=run.page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/data/catalog.json'),{timeout:45000});
  await run.navigate();await request;console.log('STARTUP_CATALOG_HELD');
  const loading=await loaderState(run.page);
  assert.equal(loading.hidden,false);assert.match(loading.message,/Загружаем|Готовим|Открываем/);
  assert.ok(loading.inert.every(item=>item.inert===true));assert.equal(loading.qaAvailable,false);
  assert.equal(loading.chromeReady,false,'Both menus wait for the same successful scene startup');
  run.record.beforeReady={message:loading.message,inert:loading.inert};
  // These interactions are intentionally short: preserve the real 15-second
  // catalog deadline and release the request immediately after the checks.
  run.record.preloader=await exercisePreloader(run.page);run.releaseCatalog();
  const ready=await waitReady(run.page);console.log('STARTUP_OFFLINE_READY');
  run.record.ready=ready.state.test.ready[0];run.record.feedback=ready.state.test.feedback;
  run.record.launch=ready.state.test.launch;run.record.marks=ready.stats.loading.marks;
  run.record.launchWrites=ready.state.test.launchWrites;run.record.counterWrites=ready.state.test.counterWrites;
  run.record.hiddenWrite=ready.state.test.hiddenWrite;
  assertStageProgress(ready.state.test.feedback);
  const timing=await assertExitOpportunity(run.page,ready.stats.loading,run.record);
  run.record.sequencePolicy=assertProgressSequence(ready.state.test,timing);
  assert.equal(await run.page.evaluate(()=>document.getElementById('museumLoading').contains(document.activeElement)),false,
   'Focus does not remain inside the hidden preloader');
  assert.equal(ready.stats.ukss.status,'ready');assert.equal(ready.stats.mik112.tua.status,'ready');
  assert.ok(run.record.fontStylesheetsPending.length>0,'A genuinely pending font stylesheet does not block startup');
  assert.deepEqual(run.record.externalBlocked.filter(item=>item.type==='script'),[],'All executable engine modules come from the museum origin');
  await run.page.evaluate(()=>window.__MUSEUM_CONTENT_READY);
  await run.page.evaluate(()=>window.__MUSEUM_ROCKETS_READY);
  const overview=await camera(run.page);
  // Use the current visitor-facing menu to prove that startup has enabled
  // real navigation. The removed overview/layer controls must stay absent.
  assert.equal(await run.page.locator('#all,#top,#fly,#showLabels,[data-layer]').count(),0);
  await run.page.locator('#equipmentAccordion > summary').click();
  await run.page.locator('[data-museum-action="r7"]').click();await step(run.page);const r7=await camera(run.page);
  assert.equal(await run.page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarinRocketVisible),true,'The R-7 menu action shows its actual exhibit');
  assert.notDeepEqual(r7.position,overview.position,'The equipment menu changes the live camera');
  if(!await run.page.locator('#equipmentAccordion').evaluate(e=>e.open))await run.page.locator('#equipmentAccordion > summary').click();
  await run.page.locator('[data-museum-action="tua"]').click();await step(run.page);const tua=await camera(run.page);
  assert.match(await run.page.locator('#title').textContent(),/Кузнечики|Транспортно-установочный/);
  assert.equal(await run.page.locator('#mik112Tua').getAttribute('aria-pressed'),'true','The TUA action selects the native transporter view');
  assert.notDeepEqual(tua.position,r7.position);
  await run.page.screenshot({path:`${out}/${prefix}-ready.png`,timeout:90000});
  run.record.models={ukss:ready.stats.ukss.status,tua:ready.stats.mik112.tua.status};run.record.cameras={overview,r7,tua};
  assertNoRuntimeErrors(run.record);await run.close();
 }
 {
  const run=await newCase('required-http-error',{httpFailure:true});await run.navigate();
  run.record.error=await waitError(run.page);
  assert.match(await run.page.locator('#error').textContent(),/HTTP 500/);
  run.record.mobileRecovery=await assertPreloaderFits(run.page,{width:320,height:568},{error:true});
  assert.equal(await run.page.getByRole('button',{name:'Повторить загрузку',exact:true}).isEnabled(),true);
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
  const run=await newCase('required-body-timeout',{stalledBody:'catalog',reducedMotion:true});await run.navigate();
  await run.page.waitForFunction(()=>window.__MUSEUM_PRELOADER&&document.getElementById('museumLoading')?.hasAttribute('data-launch-step'),
   null,{timeout:45000});
  const beforeTimeout=await assertReducedMotion(run.page);
  assert.equal(beforeTimeout.launchStep,0,'Reduced motion begins with a stable first launch phrase');
  const intro=await preloaderState(run.page);assert.equal(intro.status,firstLaunchStatus);assert.equal(intro.welcome,welcome);
  assert.equal(intro.slogan,slogan);assert.equal(intro.launchCounter,'01 / '+launchStatusCount);
  run.record.mobileLoading=await assertPreloaderFits(run.page,{width:320,height:568});
  assert.equal(run.record.mobileLoading.status.text,firstLaunchStatus,'The complete first launch phrase remains present at 320px');
  assert.ok(run.record.mobileLoading.status.lines>=1,'The launch phrase has visible text at 320px');
  const state=await waitError(run.page),request=state.test.stalled[0];
  assert.equal(state.test.stalled.length,1);assert.ok(request.headersAt>=request.startedAt);
  assert.ok(request.abortedAt!==null,'The timeout aborts the body request');
  const elapsed=request.abortedAt-request.startedAt;
  assert.ok(elapsed>=14000&&elapsed<23000,'The unchanged 15-second deadline includes the response body: '+elapsed);
  assert.match(state.message,/не ответил вовремя/i);assert.equal(state.test.animateRequests,0);
  const afterTimeout=await assertReducedMotion(run.page);
  assert.equal(afterTimeout.launchStep,beforeTimeout.launchStep,'Reduced motion keeps the launch phrase stable through the full network deadline');
  run.record.reducedMotion={beforeTimeout,afterTimeout};
  run.record.error=state;run.record.bodyTimeoutMs=elapsed;
  await run.page.screenshot({path:`${out}/${prefix}-required-body-timeout.png`,timeout:90000});
  assertNoRuntimeErrors(run.record);await run.close();
 }
 {
  // Exercise the real scene and loaders, independently of the synthetic queue
  // contract: a stalled rocket body and a failed distant Mriya are optional.
  const run=await newCase('optional-assets-unavailable',{stalledBody:'optional-models'});await run.navigate();
  const ready=await waitReady(run.page);assertStageProgress(ready.state.test.feedback);
  await run.page.waitForFunction(()=>window.__STARTUP_TEST.stalled.length===1&&
   window.__BAIKONUR_QA.stats().airports.find(a=>a.id==='pad-251')?.mriya?.status==='fallback',null,{timeout:45000});
  const pending=await loaderState(run.page),request=pending.test.stalled[0];
  assert.ok(request.startedAt>=ready.state.test.ready[0].at,'The optional model request starts after the first visible museum');
  assert.equal(pending.hidden,true);assert.equal(pending.chromeReady,true);
  assert.ok(pending.inert.every(item=>item.inert===false),'Optional failures do not disable the museum');
  const before=await camera(run.page);
  await run.page.locator('#sitesAccordion > summary').click();
  await run.page.locator('#list .entry[data-site-id="pad-31"]').click();await step(run.page);
  const after=await camera(run.page);assert.notDeepEqual(after.position,before.position,'Navigation remains usable while an optional model stalls');
  await run.page.waitForFunction(()=>window.__STARTUP_TEST.stalled[0].abortedAt!==null&&
   window.__BAIKONUR_QA.stats().rockets.placements.some(p=>p.modelId==='soyuz'&&p.status==='error'),null,{timeout:40000});
  const final=await loaderState(run.page),stats=await run.page.evaluate(()=>window.__BAIKONUR_QA.stats());
  assert.equal(final.hidden,true);assert.equal(final.chromeReady,true);assert.equal(final.test.ready.length,1);
  assert.equal(await run.page.locator('#error').isVisible(),false);
  assert.equal(stats.airports.find(a=>a.id==='pad-251').mriya.status,'fallback');
  assert.ok(stats.render.drawCalls>0&&stats.render.triangles>0,'The real map still renders after both optional failures');
  run.record.ready=ready.state.test.ready[0];run.record.request=final.test.stalled[0];
  run.record.mriya=stats.airports.find(a=>a.id==='pad-251').mriya;
  run.record.rocketErrors=stats.rockets.placements.filter(p=>p.modelId==='soyuz').map(p=>({key:p.key,status:p.status,error:p.error}));
  run.record.cameras={before,after};assertNoRuntimeErrors(run.record);await run.close();
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
  assertStageProgress(ready.state.test.feedback);
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
