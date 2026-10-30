import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local';await mkdir('qa-train',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1});page.setDefaultTimeout(90000);
// Render deliberate static frames for screenshot QA; continuous SwiftShader frames
// otherwise saturate the shared renderer. This only instruments the test page.
await page.addInitScript(()=>{
 const raf=requestAnimationFrame.bind(window);window.__TRAIN_PENDING=null;
 window.requestAnimationFrame=callback=>raf(time=>{if(callback.name==='animate')window.__TRAIN_PENDING=callback;else callback(time);});
 window.__TRAIN_FRAME=()=>{const callback=window.__TRAIN_PENDING;window.__TRAIN_PENDING=null;callback?.(performance.now());};
});
async function snapshot(name){console.log('SNAPSHOT',name);await page.evaluate(()=>window.__TRAIN_FRAME());await page.waitForFunction(()=>window.__TRAIN_PENDING,null,{polling:100});await page.screenshot({path:`qa-train/${prefix}-${name}.png`,timeout:90000});}
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|compile shader|VALIDATE_STATUS|mergeGeometries/.test(m.text()))errors.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
try{
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__BAIKONUR_QA?.traffic&&window.__TRAIN_PENDING,null,{polling:100});
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train);
 assert.equal(initial.coachCount,4);assert.equal(initial.version,'motovoz-photo-shunter-v3');
 assert.equal(initial.coaches.filter(c=>c.tailLights).length,1);assert.equal(initial.coaches[3].tailLights,true);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.seek(0);q.traffic.setFollowing(true);});
 await page.waitForTimeout(180);await snapshot('departure');
 for(const t of [80,200,420]){
  await page.evaluate(t=>window.__BAIKONUR_QA.traffic.seek(t),t);await page.waitForTimeout(180);
  const s=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train);
  assert.equal(s.wheelContacts.length,22);assert.ok(s.wheelContacts.every(c=>Math.hypot(...c.position.map((v,i)=>v-c.railPosition[i]))<1e-6));
  if(t===80)await snapshot('close-evening');
  if(t===420){assert.equal(s.phase,'arrived');await snapshot('arrival');}
 }
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.seek(80);q.traffic.focusTrain(24);});
 await page.waitForTimeout(180);await snapshot('distant-evening');
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.setFollowing(true));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().night),false);
 await page.waitForTimeout(180);await snapshot('day');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(!q.evening.evening);});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__BAIKONUR_QA.traffic.setFollowing(true));await page.waitForTimeout(180);
 await snapshot('mobile');
 const mobileControls=await page.locator('#ui').boundingBox();assert.ok(mobileControls.height<110,'Follow controls leave the mobile train visible');
 assert.equal(await page.locator('#trainFollow').count(),0,'Train shortcut was removed from the visitor menu');
 await page.mouse.move(310,450);await page.mouse.wheel(0,-10);assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats().train.following),false);
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 const final=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());
 await writeFile(`qa-train/${prefix}-result.json`,JSON.stringify({passed:true,errors,initial,final},null,2));console.log('TRAIN_BROWSER_PASS',JSON.stringify({coachCount:final.train.coachCount,axles:final.train.wheelContacts.length,errors}));
}catch(e){await page.screenshot({path:`qa-train/${prefix}-failure.png`,timeout:30000}).catch(()=>{});console.error(JSON.stringify({message:e.message,errors}));throw e;}
finally{await browser.close();}
