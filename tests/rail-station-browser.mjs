import {mobileEnabled,mobileCoverage} from './helpers/qa-scope.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-rail-station';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);let requests=0,successful=0,fail=true;
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__STATION_FRAME=()=>pending?.(performance.now());});
await page.route('**/assets/models/rail-station/model-v1.glb*',r=>{requests++;if(fail)return r.abort();successful++;return r.continue();});
const frame=()=>page.evaluate(()=>window.__STATION_FRAME());
try{
 await page.goto(base+'?station=osm-station-687010843',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:180000});
 await page.evaluate(()=>window.__BAIKONUR_QA.railStations.load());assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.railStations.stats().status),'error');
 fail=false;assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.railStations.load()),true);
 assert.equal(successful,1);assert(requests>=2);const stats=await page.evaluate(()=>window.__BAIKONUR_QA.railStations.stats());assert.equal(stats.version,'rail-station-road-clearance-v2');assert(stats.bytes<20000);assert(stats.triangles<2000);assert(stats.count>=30);
 for(const [id,name]of [['osm-station-687010843','gorodskaya'],['osm-station-4031286685','toretam'],['osm-station-7537674245','severnaya']]){
  await page.evaluate(id=>{const q=window.__BAIKONUR_QA;q.focusStation(id);q.evening.setEvening(false);q.setLabelsVisible(false);},id);await frame();const pose=await page.evaluate(id=>{const q=window.__BAIKONUR_QA,p=q.railStations.plans().find(p=>p.id===id);return {camera:q.cameraState(),position:p.position,visible:q.railStations.stats().visible,projection:q.projectWorld(p.position[0],p.position[1]+.7,p.position[2])};},id);assert(Math.hypot(pose.camera.target[0]-pose.position[0],pose.camera.target[2]-pose.position[2])<.1,'Station focus remains on its real location');assert(pose.visible>0);await writeFile(out+'/'+prefix+'-'+name+'-pose.json',JSON.stringify(pose,null,2));await page.screenshot({path:out+'/'+prefix+'-'+name+'.png'});
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await frame();await page.screenshot({path:out+'/'+prefix+'-night.png'});
 if(mobileEnabled){
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.__BAIKONUR_QA.focusStation('osm-station-687010843');window.__BAIKONUR_QA.evening.setEvening(false);});await frame();await page.screenshot({path:out+'/'+prefix+'-mobile.png'});
 }
 assert.deepEqual(errors,[]);assert(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 await writeFile(out+'/'+prefix+'-result.json',JSON.stringify({passed:true,mobileCoverage,requests,successful,stats,errors},null,2));console.log('RAIL_STATION_BROWSER_PASS');
}catch(error){await writeFile(out+'/'+prefix+'-failure.json',JSON.stringify({error:error.message,errors},null,2));await page.screenshot({path:out+'/'+prefix+'-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
