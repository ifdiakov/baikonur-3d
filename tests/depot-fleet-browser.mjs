import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-depot-fleet';await mkdir(out,{recursive:true});
const errors=[],browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let paused=false,pending=[];window.requestAnimationFrame=fn=>raf(t=>{if(paused&&fn.name==='animate')pending.push(fn);else fn(t)});window.__qaPauseFrames=()=>{paused=true};window.__qaResumeFrames=()=>{paused=false;const jobs=pending;pending=[];for(const fn of jobs)window.requestAnimationFrame(fn)};});
 await page.goto(new URL('tests/fixtures/depot-fleet.html',base).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.fixtureReady,null,{timeout:90000});
 const fixture=await page.evaluate(()=>fixtureState);assert.equal(fixture.depot.status,'ready');for(const car of fixture.cars){assert.equal(car.status,'ready',JSON.stringify(car));assert.equal(car.wheels,4);}
 for(const view of ['depot','depot-top','fleet','fleet-rear','fleet-night']){await page.evaluate(v=>fixtureRender(v),view);await page.screenshot({path:out+'/'+view+'.png',timeout:90000});}
 await page.goto(new URL('?view=depot&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.depot&&document.body.classList.contains('museum-ready'),null,{timeout:240000});
 const loads=await page.evaluate(async()=>{const q=__BAIKONUR_QA;return Promise.all([q.traffic.loadRoadFleet(),q.traffic.loadSprinters()])});assert(loads.every(Boolean));
 await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(false);__BAIKONUR_QA.traffic.seek(0)});
 const initial=await page.evaluate(()=>({depot:__BAIKONUR_QA.depot.stats(),site:__BAIKONUR_QA.siteState('kosmotrans-depot'),traffic:__BAIKONUR_QA.traffic.stats()}));
 assert.deepEqual(initial.depot,{removed:true},'The owner-removed depot must stay absent');
 assert(!initial.site?.present,'The removed depot must not expose a map card');
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.depot.load()),false);
 const allowed=new Set(['land-cruiser','uaz-patriot','uaz-bukhanka','sprinter']);assert.deepEqual(new Set(initial.traffic.carStates.map(c=>c.type)),allowed);
 for(const car of [...initial.traffic.roadVehicles.fleet,...initial.traffic.roadVehicles.sprinters])assert.equal(car.status,'ready');
 const shot=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{__qaPauseFrames();resolve()})));await page.screenshot({path:out+'/'+name+'.png',timeout:90000});await page.evaluate(()=>__qaResumeFrames());};
 await shot('fleet-overview');
 await page.evaluate(()=>__BAIKONUR_QA.traffic.seek(10));const moved=await page.evaluate(()=>__BAIKONUR_QA.traffic.stats());
 for(let i=0;i<initial.traffic.carStates.length;i++){const a=initial.traffic.carStates[i],b=moved.carStates[i];assert(Math.hypot(...a.position.map((n,j)=>n-b.position[j]))>.1);assert.notEqual(a.wheelRotation,b.wheelRotation);}
 await page.evaluate(()=>__BAIKONUR_QA.traffic.focusCars(0));await shot('cars-map');
 await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(true));await shot('cars-night');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(false);__BAIKONUR_QA.traffic.focusCars(0)});await shot('cars-mobile');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({pass:true,fixture,initial,moved,errors},null,2));console.log('DEPOT_FLEET_BROWSER_PASS');
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({message:error.message,errors},null,2));throw error}finally{await browser.close()}
