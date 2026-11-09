// EVENING_NAVIGATION_V1
import {verifyEveningNavigation} from './evening-navigation-browser-checks.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-original-museum/local';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const report={base,reference:'dfdeed5a331773275c412068f801d25ef9737baf',environment:'Chromium/Linux/SwiftShader; animation frame stepping is test-only. This is not an FPS test or a physical phone.',checks:[],passed:false};let page;
const digest=b=>createHash('sha256').update(b).digest('hex');
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  report.publicHashes={};
  for(const f of ['index.html','museum.html','workshop.html','src/road-editor.js','src/terrain-voids.js','src/workshop-road-editor.js','src/workshop-terrain-voids.js','src/evening-scene.js','src/arrival-flight.js','src/arrival-follow-availability.js','src/museum-menu.js','src/evening.css']){
   const expected=digest(await readFile(f));let actual;
   for(let i=0;i<24;i++){const r=await fetch(new URL(f+'?restoration='+Date.now(),base));if(r.ok){actual=digest(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;}await new Promise(r=>setTimeout(r,5000));}
   assert.equal(actual,expected,'Live file mismatch: '+f);report.publicHashes[f]=actual;
  }
 }
 for(const mode of (process.env.QA_MODES?.split(',')||['desktop','mobile','workshop'])){
  const mobile=mode==='mobile',workshop=mode==='workshop';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  page=await context.newPage();page.setDefaultTimeout(180000);const errors=[],shaderErrors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let fn;window.requestAnimationFrame=cb=>cb.name==='animate'?(fn=cb,0):raf(cb);window.__RESTORE_FRAME=()=>fn?.();});
  const route=workshop?'workshop.html?tour=0':mobile?'museum.html?tour=0':'';
  await page.goto(new URL(route,base).href,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:240000});
  await page.evaluate(()=>window.__RESTORE_FRAME());
  const state=await page.evaluate(()=>{const q=window.__BAIKONUR_QA,s=q.stats(),m=window.__MUSEUM_STARTUP.stats().marks,t=n=>m.find(x=>x.name===n)?.at;return {navigationToReadyMs:Math.round(performance.now()),firstFrameMs:Math.round(t('first-frame')-t('startup')),interactiveMs:Math.round(t('interactive')-t('startup')),sites:s.sites,render:s.render,evening:{enabled:s.evening.evening,roadLights:s.evening.roadLights,siteLights:s.evening.siteLights,runwayLights:s.evening.runwayLights},flanks:s.flankDistricts,menu:[...document.querySelectorAll('#ui .sites-accordion-title')].map(e=>e.textContent.trim()),camera:q.cameraState(),shadersValid:s.shadersValid,cars:s.traffic.cars,grid:window.__MUSEUM_COORD_GRID.isEnabled(),admin:!!window.__MUSEUM_WORKSHOP,simplified:!!window.__MUSEUM_PUBLIC};});
  assert.equal(state.simplified,false);assert.equal(state.admin,workshop);assert.equal(state.grid,workshop);assert(state.sites>=90);assert(state.shadersValid);
  for(const title of ['СТАРТОВЫЕ КОМПЛЕКСЫ','РАКЕТЫ И ТЕХНИКА','ЦИФРОВЫЕ РЕКОНСТРУКЦИИ','МИФЫ И ЛЕГЕНДЫ','ЭНЦИКЛОПЕДИЯ'])assert(state.menu.includes(title),'Missing original menu '+title);
  assert(state.evening.enabled);assert(state.evening.roadLights>100);assert(state.evening.runwayLights>100);assert(state.cars>0);
  assert(!requests.some(url=>/\/src\/public-museum\.js|\/assets\/public-v1\//.test(url)),'Rejected simplified runtime was loaded');
  await page.screenshot({path:out+'/'+mode+'-overview.png',timeout:180000});
  state.requestedChanges=await verifyEveningNavigation(page,{mode,out});
  if(mode==='desktop'){
   await page.evaluate(async()=>{const q=window.__BAIKONUR_QA;await Promise.all([q.traffic.loadRoadFleet(),q.traffic.loadSprinters(),q.traffic.whenReady()]);});
   const transport=await page.evaluate(()=>__BAIKONUR_QA.traffic.stats());assert(transport.train.modelsReady,'Original train models failed to load');assert.deepEqual(new Set(transport.carStates.map(c=>c.type)),new Set(['land-cruiser','uaz-patriot','uaz-bukhanka','sprinter']));
   await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.seek(80);q.arrival.seek(80);q.traffic.resume();q.arrival.resume();window.__RESTORE_FRAME();});
   const before=await page.evaluate(()=>({cars:__BAIKONUR_QA.traffic.stats().carStates,train:__BAIKONUR_QA.traffic.stats().train.locomotive,plane:__BAIKONUR_QA.arrival.stats().position}));
   await page.waitForTimeout(500);await page.evaluate(()=>window.__RESTORE_FRAME());
   const after=await page.evaluate(()=>({cars:__BAIKONUR_QA.traffic.stats().carStates,train:__BAIKONUR_QA.traffic.stats().train.locomotive,plane:__BAIKONUR_QA.arrival.stats().position}));
   const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));assert(after.cars.some((c,i)=>distance(c.position,before.cars[i].position)>.001),'Cars did not move');assert(distance(after.train,before.train)>.001,'Train did not move');assert(distance(after.plane,before.plane)>.001,'Aircraft did not move');state.motion={cars:true,train:true,aircraft:true};
   await page.evaluate(()=>{__BAIKONUR_QA.showFlanks();window.__RESTORE_FRAME();});await page.screenshot({path:out+'/desktop-flanks.png',timeout:180000});
   await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(false);window.__RESTORE_FRAME();});assert.equal(await page.evaluate(()=>__BAIKONUR_QA.evening.evening),true,'Daylight requests must leave the museum in evening mode');
   await page.evaluate(async()=>{await __BAIKONUR_QA.gagarinTable.load();__BAIKONUR_QA.evening.setEvening(true);__BAIKONUR_QA.gagarinTable.inspect('structure');window.__RESTORE_FRAME();});
   await page.waitForFunction(()=>!__BAIKONUR_QA.stats().transportBake.detailLoading,null,{timeout:240000});await page.evaluate(()=>window.__RESTORE_FRAME());await page.screenshot({path:out+'/desktop-gagarin-night.png',timeout:180000});
  }
  if(workshop){
   assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());
   await page.evaluate(()=>window.__MUSEUM_WORKSHOP.select('pad-113'));const old=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(old+1));await page.locator('#wsApply').click();assert.equal((await page.evaluate(()=>__MUSEUM_WORKSHOP.snapshot())).objects['pad-113'].position[1],old+1);await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),old);
   await page.locator('#wsRoadDetails').evaluate(e=>e.open=true);await page.locator('#wsRoadDraw').click();assert(await page.locator('#roadEditorPanel').isVisible());await page.locator('#wsRoadDraw').click();state.editing={height:true,undo:true,roads:true};
  }
  assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.checks.push({mode,...state,errors,shaderErrors});await context.close();
 }
 report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:60000}).catch(()=>{});throw e;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('ORIGINAL_MUSEUM_BROWSER_PASS',JSON.stringify(report.checks.map(({mode,navigationToReadyMs,motion,editing})=>({mode,navigationToReadyMs,motion,editing}))));
