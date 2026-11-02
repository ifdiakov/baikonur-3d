import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
async function createCase({saveData=false,preloader=true,preloadMuseum=false,failCatalog=false}={}){
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({saveData,preloader,preloadMuseum,failCatalog})=>{
  Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData,effectiveType:'4g'}});
  if(preloader)window.__MUSEUM_PRELOADER={stage(){},finish(){},destroy(){}};
  window.queueTest={starts:[],releases:{},promises:[],requests:[],timed:null};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(path,options={})=>{
   const url=String(path),record={url,cache:options.cache,priority:options.priority,at:performance.now(),abortedAt:null};
   window.queueTest.requests.push(record);
   if(preloadMuseum&&new URL(url,location.href).pathname.includes('/data/')){
    const catalog=url.endsWith('/catalog.json');
    const failed=failCatalog&&catalog&&window.queueTest.requests.filter(request=>request.url.endsWith('/catalog.json')).length===1;
    return Promise.resolve(new Response(JSON.stringify({path:url}),{status:failed?503:200,headers:{'content-type':'application/json'}}));
   }
   if(url.includes('__queued-timeout'))return new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{
     record.abortedAt=performance.now();reject(new DOMException('Test request aborted','AbortError'));
    },{once:true});
   });
   if(url.includes('__cache-data'))return Promise.resolve(new Response('{"ok":true}',{headers:{'content-type':'application/json'}}));
   return nativeFetch(path,options);
  };
 },{saveData,preloader,preloadMuseum,failCatalog});
 await page.route('**/__queue-test',route=>route.fulfill({contentType:'text/html',body:
  '<!doctype html><html><body data-preload-museum="'+preloadMuseum+'"><section id="museumLoading"><p id="museumLoadingMessage"></p><button id="museumRetry" hidden>Повторить</button></section><div id="museumLeftStack" inert></div><div id="museumRightStack" inert></div></body></html>'}));
 await page.goto(new URL('__queue-test',base).href);
 await page.addScriptTag({url:new URL('src/museum-startup.js',base).href});
 return page;
}
try{
 const page=await createCase();
 await page.evaluate(()=>{
  const api=window.__MUSEUM_STARTUP,t=window.queueTest;t.queuedAt=performance.now();
  const observe=(name,promise)=>t.promises.push(promise.then(value=>({name,state:'ready',value}),error=>({name,state:'error',error:error.name})));
  const blocked=(name,priority,reject=false)=>observe(name,api.defer(()=>{
   t.starts.push({name,at:performance.now()});
   return new Promise((resolve,fail)=>t.releases[name]=()=>reject?fail(new Error('Expected optional failure')):resolve(name));
  },{key:name,priority}));
  blocked('selected',0);blocked('failed',50,true);
  observe('timed',api.defer(()=>{
   t.starts.push({name:'timed',at:performance.now()});
   return api.fetchJSON('./__queued-timeout',{timeoutMs:100});
  },{key:'timed',priority:30}));
  observe('low',api.defer(()=>{t.starts.push({name:'low',at:performance.now()});return 'low';},{key:'low',priority:1}));
  api.promote('selected');
 });
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
 assert.equal((await page.evaluate(()=>window.queueTest.starts)).length,0,'Queued jobs do not start before first frame');
 await page.evaluate(()=>window.__MUSEUM_STARTUP.ready());
 await page.waitForTimeout(100);
 assert.equal(await page.locator('#museumLoading').evaluate(el=>el.hidden),false,'Reveal transition is still running');
 assert.equal((await page.evaluate(()=>window.queueTest.starts)).length,0,'Optional work waits for the reveal transition');
 await page.waitForFunction(()=>window.queueTest.starts.length===2);
 let state=await page.evaluate(()=>({api:window.__MUSEUM_STARTUP.stats(),starts:window.queueTest.starts,
  ready:document.body.classList.contains('museum-ready'),inert:document.getElementById('museumLeftStack').inert}));
 assert.equal(state.ready,true);assert.equal(state.inert,false);
 assert.deepEqual(state.starts.map(e=>e.name),['selected','failed'],'Selected content takes priority');
 assert.equal(state.api.active,2);assert.equal(state.api.queued,2);assert.equal(state.api.concurrency,2);
 const reveal=state.api.marks.find(mark=>mark.name==='interactive').at;
 assert.ok(state.starts.every(start=>start.at>reveal),'No queued task shares the first reveal turn');
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.queueTest.requests.filter(r=>r.url.includes('__queued-timeout')).length),0,
  'The network deadline does not run while a task waits in the queue');
 await page.evaluate(()=>window.queueTest.releases.failed());
 await page.waitForFunction(()=>window.queueTest.starts.some(s=>s.name==='timed'));
 state=await page.evaluate(()=>window.__MUSEUM_STARTUP.stats());assert.equal(state.active,2);
 await page.waitForFunction(()=>window.queueTest.starts.some(s=>s.name==='low'));
 await page.evaluate(()=>window.queueTest.releases.selected());
 const results=await page.evaluate(()=>Promise.all(window.queueTest.promises));
 assert.deepEqual(results.map(({name,state})=>[name,state]),[
  ['selected','ready'],['failed','error'],['timed','error'],['low','ready']]);
 assert.equal(results.find(r=>r.name==='timed').error,'TimeoutError');
 const timer=await page.evaluate(()=>window.queueTest.requests.find(r=>r.url.includes('__queued-timeout')));
 assert.ok(timer.abortedAt-timer.at>=80,'The deadline starts with the actual request');
 assert.ok(timer.abortedAt-timer.at<1500,'A stalled response has a bounded deadline');
 assert.ok(timer.at-(await page.evaluate(()=>window.queueTest.queuedAt))>200,'Timeout remained pending after a longer queue wait');
 await page.evaluate(async()=>{
  const api=window.__MUSEUM_STARTUP;
  await api.fetchJSON('./__cache-data?v=release-1');
  await api.fetchJSON('./__cache-data');
  await api.fetchJSON('./__cache-data?v=release-1',{cache:'reload'});
 });
 const caches=await page.evaluate(()=>window.queueTest.requests.filter(r=>r.url.includes('__cache-data')).map(r=>r.cache));
 assert.deepEqual(caches,['default','no-cache','reload']);
 assert.equal((await page.evaluate(()=>window.__MUSEUM_STARTUP.stats())).active,0);
 await page.close();

 const slow=await createCase({saveData:true,preloader:false});
 await slow.evaluate(()=>{
  const api=window.__MUSEUM_STARTUP,t=window.queueTest;
  for(const name of ['first','second'])t.promises.push(api.defer(()=>{
   t.starts.push(name);return new Promise(resolve=>t.releases[name]=resolve);
  },{key:name}));
  api.ready();
 });
 await slow.waitForFunction(()=>window.queueTest.starts.length===1);
 assert.deepEqual(await slow.evaluate(()=>window.queueTest.starts),['first']);
 assert.equal((await slow.evaluate(()=>window.__MUSEUM_STARTUP.stats())).concurrency,1);
 await slow.evaluate(()=>window.queueTest.releases.first());
 await slow.waitForFunction(()=>window.queueTest.starts.length===2);
 await slow.evaluate(()=>window.queueTest.releases.second());
 await slow.evaluate(()=>Promise.all(window.queueTest.promises));
 await slow.close();

 const prefetched=await createCase({preloadMuseum:true,preloader:false});
 const memo=await prefetched.evaluate(async()=>{
  const api=window.__MUSEUM_STARTUP;
  const relative=api.fetchJSON('./data/catalog.json');
  const absolute=api.fetchJSON(new URL('./data/catalog.json',location.href).href);
  return {samePromise:relative===absolute,value:await relative,requests:window.queueTest.requests,
   ready:document.body.classList.contains('museum-ready')};
 });
 assert.equal(memo.ready,false,'Critical JSON starts before the first scene frame');
 assert.equal(memo.requests.length,6,'All six critical datasets start while modules resolve');
 assert.ok(memo.requests.every(request=>request.priority==='low'),'Early JSON leaves network priority to renderer modules');
 assert.ok(memo.requests.every(request=>request.cache===(request.url.includes('?v=')?'default':'no-cache')));
 assert.equal(memo.samePromise,true,'Relative and absolute URLs reuse the same early promise');
 assert.equal(memo.requests.filter(request=>request.url.endsWith('/catalog.json')).length,1);
 assert.equal(memo.value.path,'./data/catalog.json');
 await prefetched.close();

 const failedPrefetch=await createCase({preloadMuseum:true,failCatalog:true,preloader:false});
 // Let a rejected early request pass the browser's unhandled-rejection turn
 // before the scene asks for it. Startup must still show its loading state.
 await failedPrefetch.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
 const retry=await failedPrefetch.evaluate(async()=>{
  const api=window.__MUSEUM_STARTUP;let message;
  try{await api.fetchJSON('./data/catalog.json');}catch(error){message=error.message;}
  const requestsBeforeRetry=window.queueTest.requests.filter(request=>request.url.endsWith('/catalog.json')).length;
  const state=document.getElementById('museumLoading').dataset.state;
  const value=await api.fetchJSON('./data/catalog.json',{cache:'reload'});
  return {message,requestsBeforeRetry,state,value,requests:window.queueTest.requests.filter(request=>request.url.endsWith('/catalog.json'))};
 });
 assert.match(retry.message,/HTTP 503/,'The required consumer still receives an early network failure');
 assert.equal(retry.requestsBeforeRetry,1,'A failed memoized request is not silently fetched twice');
 assert.notEqual(retry.state,'error','Handled prefetch rejection does not trigger the global error screen');
 assert.equal(retry.requests.length,2,'Explicit request options allow a fresh retry');
 assert.equal(retry.requests[1].cache,'reload');assert.equal(retry.value.path,'./data/catalog.json');
 await failedPrefetch.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',cases:['first-frame gate','reveal gate','concurrency limit',
  'selected priority','failed task recovery','queued timeout exclusion','HTTP cache policy','save-data serial queue',
  'early JSON priority','memoized JSON request','failed prefetch recovery']}));
}finally{await browser.close();}
