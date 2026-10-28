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
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().arrival?.appearanceVersion==='alrosa-realistic-v1',null,{timeout:90000});
 await page.waitForTimeout(500);
 await frame();
 let s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(s.sites,98);assert.equal(s.stations,7);assert.equal(s.mik112.version,'1.2-plan-aligned-ne');
 assert.equal(s.evening.evening,true);assert.ok(s.evening.roadLights>100);assert.ok(s.evening.siteLights>300);assert.ok(s.evening.runwayLights>90);
 assert.ok(s.arrival.elapsed>0&&s.arrival.elapsed<30);assert.equal(s.arrival.duration,120);assert.ok(s.shadersValid);
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
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('starboard'));await snapshot('alrosa-starboard-evening');
 await page.locator('#eveningToggle').click();
 const day=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().appearance);
 assert.equal(day.night,false);assert.ok(day.cabinLightIntensity<night.cabinLightIntensity);
 assert.ok(day.cockpitLightIntensity<night.cockpitLightIntensity);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('port'));await snapshot('alrosa-port-day');
 await page.locator('#eveningToggle').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.inspect('front'));await snapshot('alrosa-cockpit');
 await page.locator('#arrivalFollow').click();await page.waitForTimeout(300);
 await snapshot('aircraft');
 assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).following);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(96));await page.waitForTimeout(200);
 await snapshot('approach');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(108));await page.waitForTimeout(200);
 s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(s.arrival.onGround,true);assert.equal(s.arrival.gear,1);
 await snapshot('touchdown');
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(120));await page.waitForTimeout(200);
 assert.equal(await page.locator('#arrivalPhase').textContent(),'Посадка завершена');
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).trail.visibleSamples,0);
 const stopped=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().position);await page.waitForTimeout(200);
 assert.deepEqual(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().position),stopped);
 await page.locator('#eveningToggle').click();assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.stats())).evening.evening,false);
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).following,true,'Changing the lights keeps aircraft follow active');
 await snapshot('day');
 await page.locator('#eveningToggle').click();
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.seek(.02);});
 const blink1=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().strobeVisible);
 await page.evaluate(()=>window.__BAIKONUR_QA.arrival.seek(.7));const blink2=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().strobeVisible);
 assert.notEqual(blink1,blink2,'Strobes must blink');
 await page.locator('#arrivalReplay').click();await page.waitForTimeout(250);
 assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).elapsed<10);
 await page.mouse.move(800,450);await page.mouse.wheel(0,-50);
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats())).following,false);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite(0);q.arrival.seek(50);});
 await page.locator('#close').click();await snapshot('gagarin');
 await page.locator('#lightingToggle').click();const count=await page.evaluate(()=>window.__BAIKONUR_QA.lighting.stats().count);
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
