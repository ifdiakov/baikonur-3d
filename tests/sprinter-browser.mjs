import {mobileEnabled,mobileCoverage} from './helpers/qa-scope.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-sprinter';await mkdir(out,{recursive:true});
let phase='start',requests=0,successfulRequests=0,failSource=true;const errors=[];
const checkpoint=async name=>{phase=name;console.log('SPRINTER_PHASE',name);await writeFile(`${out}/${prefix}-progress.json`,JSON.stringify({phase,errors,requests}));};
const watchdog=setTimeout(()=>{console.error('SPRINTER_WATCHDOG',phase);process.exit(1);},360000);watchdog.unref();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SPRINTER_FRAME=()=>pending?.(performance.now());});
await page.route('**/assets/models/sprinter/model-v1.glb*',r=>{requests++;if(failSource)return r.abort();successfulRequests++;return r.continue();});
const frame=()=>page.evaluate(()=>window.__SPRINTER_FRAME());
try{
 await checkpoint('navigate');await page.goto(base+'?view=sprinter',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:180000});
 await checkpoint('failure-recovery');await page.waitForFunction(()=>window.__BAIKONUR_QA.traffic.stats().roadVehicles.sprinters.every(v=>v.status==='error'));
 failSource=false;await page.locator('#sprinterCredit button').filter({hasText:'Повторить'}).click();await page.waitForFunction(()=>window.__BAIKONUR_QA.traffic.stats().roadVehicles.sprinters.every(v=>v.status==='ready'));
 assert.equal(successfulRequests,1,'One shared successful GLB fetch for all Sprinters');assert.ok(requests>=2,'Failure followed by a successful retry');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.traffic.seek(0);q.traffic.focusSprinter();q.evening.setEvening(false);q.setLabelsVisible(false);});await frame();
 await checkpoint('day');const initial=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());assert.ok(initial.roadVehicles.sprinters.length>=1);for(const s of initial.roadVehicles.sprinters){assert.equal(s.detailVersion,'sprinter-photo-detail-v3');assert(s.detail.hoodLogo);assert.equal(s.detail.rearDoorWordmark,'ROCKETTRIP');}assert.ok(initial.followingSprinter!==null);assert(await page.getByRole('link',{name:'Res1n',exact:true}).isVisible());
 await page.screenshot({path:`${out}/${prefix}-sprinter-day.png`});
 await checkpoint('moving');await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(2));await frame();const moved=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());
 for(const {index}of initial.roadVehicles.sprinters){const a=initial.carStates[index],b=moved.carStates[index];assert.notEqual(a.wheelRotation,b.wheelRotation);assert.ok(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))>1);}
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await frame();await page.screenshot({path:`${out}/${prefix}-sprinter-night.png`});
 if(mobileEnabled){
 await checkpoint('mobile');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.focusSprinter();q.evening.setEvening(false);});await frame();await page.screenshot({path:`${out}/${prefix}-sprinter-mobile.png`});
 const rect=await page.locator('#sprinterCredit').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);await page.locator('#sprinterCredit button').first().click();assert.equal(await page.locator('#sprinterCredit').isVisible(),false);
 await page.mouse.click(350,380);assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats())).followingSprinter,null);
 }
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,mobileCoverage,requests,initial,moved,errors},null,2));console.log('SPRINTER_BROWSER_PASS');
}catch(error){await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({phase,error:error.message,errors}));await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:10000}).catch(()=>{});throw error;}
finally{clearTimeout(watchdog);await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);}
