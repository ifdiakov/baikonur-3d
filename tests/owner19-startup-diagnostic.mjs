import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const out='qa-ci/startup';await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const results=[];
try{for(const file of ['museum.html','workshop.html']){
 const context=await browser.newContext({viewport:{width:1200,height:900},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),events=[];
 page.on('pageerror',e=>events.push({type:'pageerror',message:e.stack}));page.on('console',e=>{if(['error','warning'].includes(e.type()))events.push({type:e.type(),message:e.text()});});page.on('requestfailed',r=>events.push({type:'requestfailed',url:r.url(),message:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)events.push({type:'http',status:r.status(),url:r.url()});});
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?0:raf(fn);});
 const start=Date.now();let timeout=null;
 await page.goto('https://ifdiakov.github.io/baikonur-3d/'+file+'?tour=0',{waitUntil:'domcontentloaded',timeout:60000});
 try{await page.waitForFunction(()=>document.body.classList.contains('museum-ready')||document.querySelector('#museumRetry')?.hidden===false,null,{timeout:90000,polling:250});}catch(e){timeout=e.message;}
 const state=await page.evaluate(()=>({ready:document.body.classList.contains('museum-ready'),qa:!!window.__BAIKONUR_QA,error:document.querySelector('#error')?.textContent,loading:document.querySelector('#museumLoadingMessage')?.textContent,startup:window.__MUSEUM_STARTUP?.stats?.(),resources:performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400).map(r=>({name:r.name,status:r.responseStatus}))}));
 results.push({file,elapsedMs:Date.now()-start,timeout,...state,events});console.log('PUBLIC_STARTUP_DIAGNOSTIC',JSON.stringify(results.at(-1)));await page.screenshot({path:out+'/'+file+'.png',timeout:20000}).catch(()=>{});await writeFile(out+'/report.json',JSON.stringify({passed:results.every(r=>r.ready),checks:results},null,2));await context.close();
}}finally{await browser.close();}if(results.some(r=>!r.ready))process.exitCode=1;
