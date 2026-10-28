import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local';
await mkdir('qa-road-vehicles',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1}),errors=[],shaderErrors=[];
if(process.env.BAIKONUR_STEPPED_QA)await page.addInitScript(()=>{const native=window.requestAnimationFrame.bind(window);let frame;window.requestAnimationFrame=callback=>{if(callback.name==='animate'){frame=callback;return 0;}return native(callback);};window.__qaMuseumFrame=()=>frame?.(performance.now());});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader/.test(m.text()))shaderErrors.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__BAIKONUR_QA?.traffic,null,{timeout:90000});
 await page.locator('#showLabels').uncheck();
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.traffic.seek(0);q.traffic.focusCars();});
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());assert.equal(initial.cars,20);assert.equal(initial.roadVehicles.routeCount,4);assert.equal(initial.roadVehicles.extensionLength,2900);assert.equal(initial.roadVehicles.extensionLamps,52);
 assert.ok(initial.carStates[0].position[1]>6,'Car is visibly on the highway bridge');
 await page.evaluate(()=>window.__qaMuseumFrame?.());await page.screenshot({animations:'disabled',path:`qa-road-vehicles/${prefix}-car-night.png`,timeout:90000});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().night),false);
 await page.evaluate(()=>window.__qaMuseumFrame?.());await page.screenshot({animations:'disabled',path:`qa-road-vehicles/${prefix}-car-day.png`,timeout:90000});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.focusHighway();});await page.evaluate(()=>window.__qaMuseumFrame?.());await page.screenshot({animations:'disabled',path:`qa-road-vehicles/${prefix}-junction-wide.png`,timeout:90000});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;const s=q.traffic.stats(),r=s.roadVehicles.routes.find(r=>r.id===s.carStates[16].routeId),car=s.carStates[16];const target=(r.rampStart+r.rampEnd)/2;q.traffic.seek((target-car.phase*car.routeLength)/car.speed);q.traffic.focusCars(16);});
 await page.evaluate(()=>window.__qaMuseumFrame?.());await page.screenshot({animations:'disabled',path:`qa-road-vehicles/${prefix}-turning-car.png`,timeout:90000});
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(10));const moved=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());
 for(let i=0;i<initial.carStates.length;i++){
  assert.ok(Math.hypot(...initial.carStates[i].position.map((v,j)=>v-moved.carStates[i].position[j]))>50);
  assert.notEqual(initial.carStates[i].wheelRotation,moved.carStates[i].wheelRotation);assert.equal(moved.carStates[i].lightCount,4);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__BAIKONUR_QA.traffic.focusCars(8));await page.evaluate(()=>window.__qaMuseumFrame?.());await page.screenshot({animations:'disabled',path:`qa-road-vehicles/${prefix}-mobile-cars.png`,timeout:90000});
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 await writeFile(`qa-road-vehicles/${prefix}-result.json`,JSON.stringify({passed:true,initial,errors,shaderErrors},null,2));console.log('ROAD_VEHICLES_BROWSER_PASS');
}catch(error){await page.evaluate(()=>window.__qaMuseumFrame?.());await page.screenshot({animations:'disabled',path:`qa-road-vehicles/${prefix}-failure.png`,timeout:90000}).catch(()=>{});console.error(JSON.stringify({message:error.message,errors,shaderErrors}));throw error;}
finally{await browser.close();}
