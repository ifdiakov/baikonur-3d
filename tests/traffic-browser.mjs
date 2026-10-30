import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const prefix=process.env.QA_PREFIX||'local',origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';await mkdir('qa-traffic',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(45000);
const errors=[],shaderErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader/i.test(m.text()))shaderErrors.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__BAIKONUR_QA?.traffic,null,{timeout:90000});
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(stats.traffic.cars,20);assert.equal(stats.traffic.version,'ground-traffic-v2');assert.equal(stats.sites,97);
 assert.equal(stats.arrival.attitudeVersion,'positive-approach-v2');assert.equal(stats.mik112.version,'1.3-photo-frames');assert.ok(stats.shadersValid);
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));await page.locator('#arrivalFollow').click();
 for(const t of [84,100,120,124,127]){
  await page.evaluate(t=>window.__BAIKONUR_QA.arrival.seek(t),t);await page.waitForTimeout(120);
  const a=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());
  if(t<=120)assert.ok(a.renderedPitchDeg>3);
  if(t>=120){assert.ok(Math.abs(a.mainWheelBottom-a.runwayY)<1e-5);assert.ok(a.noseWheelBottom>=a.mainWheelBottom-1e-6);}
  if(t===120){assert.ok(a.noseWheelBottom-a.mainWheelBottom>.4);await page.screenshot({path:`qa-traffic/${prefix}-main-gear-first.png`,timeout:60000});}
  if(t===127)assert.ok(Math.abs(a.noseWheelBottom-a.mainWheelBottom)<1e-6);
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(2));await page.evaluate(()=>{const t=window.__BAIKONUR_QA.traffic;t.setFollowing(!t.stats().train.following);});await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().following),false);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),true);
 await page.screenshot({path:`qa-traffic/${prefix}-motovoz-departure.png`,timeout:60000});
 const from=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.locomotive);
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(200));await page.waitForTimeout(200);
 const mid=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.locomotive);assert.ok(Math.hypot(...mid.map((v,i)=>v-from[i]))>100);
 await page.screenshot({path:`qa-traffic/${prefix}-motovoz-mainline.png`,timeout:60000});
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(420));await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.phase),'arrived');
 await page.screenshot({path:`qa-traffic/${prefix}-motovoz-city.png`,timeout:60000});
 await page.evaluate(()=>window.__BAIKONUR_QA.setLayerVisible('rails',false));assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),false);await page.evaluate(()=>window.__BAIKONUR_QA.setLayerVisible('rails',true));
 await page.evaluate(()=>{window.__BAIKONUR_QA.traffic.seek(0);window.__BAIKONUR_QA.traffic.focusHighway();});
 const cars=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().carStates.map(c=>c.position));
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(20));
 const moved=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().carStates.map(c=>c.position));assert.ok(cars.every((p,i)=>Math.hypot(...moved[i].map((v,j)=>v-p[j]))>100));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA,s=q.traffic.stats();const car=s.carStates[0];q.traffic.seek(((s.bridgeDistance-car.phase*s.highwayLength+s.highwayLength)%s.highwayLength)/car.speed);q.traffic.focusHighway();});
 assert.ok((await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().carStates[0].position))[1]>8,'The car follows the upper bridge deck');
 await page.screenshot({path:`qa-traffic/${prefix}-highway.png`,timeout:60000});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().night),false);await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 await page.evaluate(()=>{const t=window.__BAIKONUR_QA.traffic;t.setFollowing(!t.stats().train.following);});await page.mouse.move(800,450);await page.mouse.wheel(0,-30);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),false);
 const url=new URL(origin);url.searchParams.set('view','motovoz');await page.goto(url.toString(),{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__BAIKONUR_QA?.traffic,null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),true);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);assert.equal(await page.locator('#trainFollow').count(),0,'Train shortcut was removed from the visitor menu');
 await page.screenshot({path:`qa-traffic/${prefix}-mobile.png`,timeout:60000});
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 await writeFile(`qa-traffic/${prefix}-result.json`,JSON.stringify({passed:true,stats,errors,shaderErrors},null,2));console.log('TRAFFIC_BROWSER_PASS');
}catch(e){await page.screenshot({path:`qa-traffic/${prefix}-failure.png`,timeout:30000}).catch(()=>{});console.error(JSON.stringify({message:e.message,errors,shaderErrors}));throw e;}
finally{await browser.close();}
