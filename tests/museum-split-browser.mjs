import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-museum-split',runs=Number(process.env.QA_RUNS||2);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const report={measuredAt:new Date().toISOString(),base,environment:'Chromium / Linux / SwiftShader software WebGL; not a real phone; unthrottled connection',measurements:[],functional:{}};let activePage;
try{
 for(const mode of ['museum','workshop'])for(let i=0;i<runs;i++){
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];activePage=page;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  if(mode==='workshop')await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let callback;window.requestAnimationFrame=fn=>fn.name==='animate'?(callback=fn,0):raf(fn);window.__QA_FRAME=()=>callback?.(performance.now());});
  const started=Date.now();await page.goto(base+mode+'.html?tour=0',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(mode=>mode==='museum'?window.__MUSEUM_PUBLIC?.metrics().ready:document.body.classList.contains('museum-ready')&&window.__MUSEUM_WORKSHOP,mode,{timeout:240000});
  const measurement=await page.evaluate(mode=>{
   const resources=performance.getEntriesByType('resource'),sizes=resources.reduce((a,r)=>({transfer:a.transfer+r.transferSize,encoded:a.encoded+r.encodedBodySize,decoded:a.decoded+r.decodedBodySize}),{transfer:0,encoded:0,decoded:0});
   if(mode==='museum')return {...window.__MUSEUM_PUBLIC.metrics(),resources:resources.length,sizes};
   const marks=window.__MUSEUM_STARTUP.stats().marks,get=n=>marks.find(m=>m.name===n)?.at;return {firstFrameMs:Math.round(get('first-frame')-get('startup')),interactiveMs:Math.round(get('interactive')-get('startup')),navigationToReadyMs:Math.round(performance.now()),resources:resources.length,sizes};
  },mode);
  report.measurements.push({...measurement,mode,run:i+1,cache:'cold isolated browser context',wallMs:Date.now()-started,errors});assert.deepEqual(errors,[]);
  if(i===0){
   if(mode==='museum'){
    assert(!requests.some(r=>/road-editor|osm-transport|roads\.geojson|archive-models|encyclopedia\.json/.test(r)),'Visitor must not load authoring or full source network');
    assert.equal(measurement.roadMeshes,0);assert.equal(measurement.loadedDetails.length,0);assert(measurement.drawCalls<300,'Overview draw-call budget');assert(measurement.triangles<600000,'Overview triangle budget');
    await page.screenshot({path:out+'/museum-desktop.png'});
    await page.evaluate(()=>window.__MUSEUM_PUBLIC.focusSite('pad-113'));
    await page.waitForFunction(()=>window.__MUSEUM_PUBLIC.metrics().loadedDetails.includes('pad-113'),null,{timeout:90000});
    await page.waitForTimeout(1200);await page.screenshot({path:out+'/museum-site113.png'});
    for(const id of ['pad-31','pad-1','pad-110','pad-95']){await page.evaluate(id=>window.__MUSEUM_PUBLIC.focusSite(id),id);await page.waitForFunction(id=>window.__MUSEUM_PUBLIC.metrics().loadedDetails.includes(id),id,{timeout:90000});}
    const after=await page.evaluate(()=>window.__MUSEUM_PUBLIC.metrics());assert(after.loadedDetails.length<=3);assert(after.detailEvictions>=2);report.functional.detailCache=after;
    await page.locator('#encyclopediaButton').click();await page.waitForFunction(()=>document.querySelector('#experienceBody iframe')?.contentDocument?.readyState==='complete',null,{timeout:60000});assert(await page.locator('#experienceDialog').isVisible());await page.locator('#closeExperience').click();assert.equal(await page.locator('#experienceBody iframe').count(),0,'Closing frees the iframe/WebGL context');
    const before=await page.evaluate(()=>window.__MUSEUM_PUBLIC.metrics().frames);await page.waitForTimeout(1200);const afterIdle=await page.evaluate(()=>window.__MUSEUM_PUBLIC.metrics().frames);report.functional.idleFrames=afterIdle-before;assert(afterIdle-before<15,'Static museum stops continuous rendering');
   }else{
    assert(await page.locator('#cameraAltitude').isVisible());assert(await page.evaluate(()=>window.__MUSEUM_COORD_GRID.isEnabled()));assert(await page.locator('#workshopPanel').isVisible());
    await page.evaluate(()=>window.__MUSEUM_WORKSHOP.select('pad-113'));const initial=await page.locator('#wsHeight').inputValue();await page.locator('#wsHeight').fill(String(Number(initial)+2));await page.locator('#wsApply').click();assert.equal((await page.evaluate(()=>window.__MUSEUM_WORKSHOP.snapshot())).objects['pad-113'].position[1],Number(initial)+2);
    await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),Number(initial));await page.locator('#wsRedo').click();assert(Math.abs(Number(await page.locator('#wsHeight').inputValue())-Number(initial)-2)<1e-6);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__MUSEUM_WORKSHOP,null,{timeout:240000});assert.equal((await page.evaluate(()=>window.__MUSEUM_WORKSHOP.snapshot())).objects['pad-113'].position[1],Number(initial)+2);report.functional.localAutosave=true;
    await page.evaluate(()=>window.__MUSEUM_WORKSHOP.select('pad-113'));await page.locator('#wsReset').click();await page.evaluate(()=>window.__QA_FRAME());await page.screenshot({path:out+'/workshop-desktop.png'});
    await page.locator('#wsRoadDetails').evaluate(el=>el.open=true);await page.locator('#wsRoadDraw').click();assert(await page.locator('#roadEditorPanel').isVisible());report.functional.roadEditorVisible=true;await page.locator('#wsRoadDraw').click();const beforeRoad=await page.evaluate(()=>window.__MUSEUM_WORKSHOP.snapshot());const x=Number(await page.locator('#wsRoadX').inputValue());await page.locator('#wsRoadX').fill(String(x+.2));await page.locator('#wsPointApply').click();await page.locator('#wsRoadApply').click();assert((await page.evaluate(()=>window.__MUSEUM_WORKSHOP.snapshot())).roadEdits.added.length>beforeRoad.roadEdits.added.length);await page.locator('#wsUndo').click();report.functional.numericRoadEditing=true;
   }
  }
  assert.deepEqual(errors,[]);if(mode==='museum')assert((await page.evaluate(()=>window.__MUSEUM_PUBLIC.metrics())).shadersValid);await context.close();
 }
 for(const mode of ['museum','workshop']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),p=await context.newPage();activePage=p;const errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(mode==='workshop')await p.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let callback;window.requestAnimationFrame=fn=>fn.name==='animate'?(callback=fn,0):raf(fn);window.__QA_FRAME=()=>callback?.(performance.now());});
  await p.goto(base+mode+'.html?tour=0',{waitUntil:'domcontentloaded'});await p.waitForFunction(mode=>mode==='museum'?window.__MUSEUM_PUBLIC?.metrics().ready:document.body.classList.contains('museum-ready')&&window.__MUSEUM_WORKSHOP,mode,{timeout:240000});
  if(mode==='workshop')await p.evaluate(()=>window.__QA_FRAME());await p.screenshot({path:out+'/'+mode+'-mobile.png'});assert.deepEqual(errors,[]);
  report.measurements.push({mode,device:'mobile viewport emulation, not physical phone',...(await p.evaluate(mode=>mode==='museum'?window.__MUSEUM_PUBLIC.metrics():{navigationToReadyMs:Math.round(performance.now())},mode))});await context.close();
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;await activePage?.screenshot({path:out+'/failure.png'}).catch(()=>{});report.body=await activePage?.locator('body').innerText().catch(()=>null);throw e;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('MUSEUM_SPLIT_PASS',JSON.stringify(report.measurements.map(r=>({mode:r.mode,run:r.run,first:r.firstFrameMs,interactive:r.interactiveMs,device:r.device}))));
