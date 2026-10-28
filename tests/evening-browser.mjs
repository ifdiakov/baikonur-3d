import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const prefix=process.env.QA_PREFIX||'local';await mkdir('qa-evening',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(45000);
// Keep browser instrumentation RAF running, but render museum frames on demand.
// SwiftShader can otherwise starve screenshots while the full terrain animates.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);window.__EVENING_PENDING=null;
 window.requestAnimationFrame=fn=>fn.name==='animate'?native(()=>{window.__EVENING_PENDING=fn;}):native(fn);
 window.__EVENING_FRAME=()=>{const fn=window.__EVENING_PENDING;window.__EVENING_PENDING=null;fn?.(performance.now());};
});
async function frame(){await page.evaluate(()=>window.__EVENING_FRAME());await page.waitForFunction(()=>window.__EVENING_PENDING,null,{polling:100});}
async function snapshot(name){await frame();console.log('EVENING_SNAPSHOT',name);await page.screenshot({path:`qa-evening/${prefix}-${name}.png`,timeout:90000});}
const errors=[],shaderErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader/i.test(m.text()))shaderErrors.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',route=>route.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(route.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
try{
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().arrival?.version==='krayniy-circuit-v4',null,{timeout:90000});
 await page.waitForTimeout(500);
 await frame();
 let s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(s.sites,97);assert.equal(s.stations,7);assert.equal(s.mik112.version,'1.3-photo-frames');
 assert.equal(s.evening.evening,true);assert.ok(s.evening.roadLights>100);assert.ok(s.evening.siteLights>300);assert.ok(s.evening.runwayLights>90);
 assert.ok(s.arrival.elapsed>0&&s.arrival.elapsed<30);assert.equal(s.arrival.duration,812);assert.equal(s.arrival.arrivalDuration,120);assert.ok(s.shadersValid);
 const night=s.arrival.appearance;
 assert.equal(night.livery,'АЛРОСА');assert.equal(night.night,true);
 assert.equal(night.fuselageTitles,2);assert.equal(night.tailEmblems,2);
 assert.equal(night.engineCount,2);assert.ok(night.fanBladesPerEngine>=12);
 assert.equal(night.cabinWindows,60);assert.equal(night.cockpitPanels,6);
 assert.ok(night.cabinLightIntensity>night.cockpitLightIntensity&&night.cockpitLightIntensity>0);
 assert.equal(night.pointLights,0,'Window lighting stays batched');
 await page.locator('#showLabels').uncheck();
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(26));
 await snapshot('overview');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('port'));await snapshot('alrosa-port-evening');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('starboard'));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 const day=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().appearance);
 assert.equal(day.night,false);assert.ok(day.cabinLightIntensity<night.cabinLightIntensity);
 assert.ok(day.cockpitLightIntensity<night.cockpitLightIntensity);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('port'));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('front'));
 await page.locator('#arrivalFollow').click();await page.waitForTimeout(300);
 await snapshot('aircraft');
 assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).following);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(96));await page.waitForTimeout(200);
 await snapshot('approach');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(120));await page.waitForTimeout(200);
 s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(s.arrival.onGround,true);assert.equal(s.arrival.gear,1);
 await snapshot('touchdown');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(148));await page.waitForTimeout(200);
 assert.equal(await page.locator('#arrivalPhase').textContent(),'Стоянка · 20 секунд');
 assert.ok(Math.abs((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).runwayProgress-.8)<1e-9);await snapshot('runway-stop-80-percent');
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).trail.visibleSamples,0);
 const stopped=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().position);await page.waitForTimeout(200);
 assert.deepEqual(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().position),stopped);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.stats())).evening.evening,false);
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).following,true,'Changing the lights keeps aircraft follow active');

 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 // Exercise both sorties in the actual renderer without waiting thirteen minutes.
 for(const [t,segment,leg] of [[174,'turn-back',1],[205,'taxi-back',1],[236,'turn-takeoff',1],[260,'takeoff',1],[322,'departure',1],[376,'away',1],[432,'approach',2],[526,'rollout',2],[554,'hold',2],[728,'departure',2],[782,'away',2],[838,'approach',1]]){
  await page.evaluate(t=>window.__BAIKONUR_QA.arrival.seek(t),t);await frame();
  const a=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());
  assert.equal(a.segment,segment);assert.equal(a.leg,leg);assert.equal(a.visible,segment!=='away');
  if(segment==='hold')assert.ok(Math.abs(a.runwayProgress-.8)<1e-9);
  if(t===174)await snapshot('first-turnaround');
  if(t===322)await snapshot('northeast-departure');
  if(t===432)await snapshot('west-return');
  if(t===728)await snapshot('north-departure');
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(490));
 const secondGear=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());
 assert.ok(secondGear.gear>0&&secondGear.gear<1);assert.ok(secondGear.aircraft.gearDoorAngles.some(a=>Math.abs(a)>1),'Gear doors also animate on the second approach');
 assert.equal(await page.locator('#ui #eveningToggle,#ui #lightingToggle,#ui #trainFollow,#ui #flanksView,#ui #carsFocus,#ui .archive-link').count(),0);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.seek(.02);});
 const blink1=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().strobeVisible);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(.7));const blink2=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().strobeVisible);
 assert.notEqual(blink1,blink2,'Strobes must blink');
 await page.locator('#arrivalReplay').click();await page.waitForTimeout(250);
 assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).elapsed<10);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.setFollowing(true));await page.mouse.move(800,450);await page.mouse.wheel(0,-50);
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).following,true);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(0);q.arrival.seek(50);});
 await page.locator('#close').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.lighting.setActive(true));const count=await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats().count);
 await page.mouse.click(1050,730);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats().count),count+1);
 await page.locator('[data-action="undo"]').click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats().count),count);
 await page.locator('[data-action="close"]').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
 assert.ok(await page.locator('#arrivalFollow').isVisible());assert.equal(await page.locator('#error').isVisible(),false);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(84));
 await page.locator('#arrivalFollow').click();
 await snapshot('mobile');
 assert.ok((await page.locator('#ui').boundingBox()).height<150,'Mobile follow controls leave the aircraft visible');
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.stats())).shadersValid);
 await writeFile(`qa-evening/${prefix}-result.json`,JSON.stringify({passed:true,stats:s,errors,shaderErrors},null,2));
 console.log('EVENING_BROWSER_PASS',JSON.stringify(s.evening));
}catch(e){await page.screenshot({path:`qa-evening/${prefix}-failure.png`,timeout:30000}).catch(()=>{});console.error('EVENING_FAILURE',JSON.stringify({message:e.message,errors,shaderErrors}));throw e;}
finally{await browser.close();}
