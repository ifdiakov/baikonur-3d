import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local';
const opts={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);opts.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(opts),page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(120000);await mkdir('qa-pua',{recursive:true});
const evidence={base,errors:[],phases:[]};page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))evidence.errors.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=f=>['animate','animateModel'].includes(f.name)?(window.__PUA_FRAME=f,0):native(f);});
const frame=()=>page.evaluate(()=>window.__PUA_FRAME?.(performance.now()));
try{
 await page.goto(new URL('?view=pua',base).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.puaLoading.stats().active&&window.__BAIKONUR_QA.stats().airports.find(a=>a.key==='yubileiny').mriya.status==='ready');
 await page.evaluate(()=>{window.__BAIKONUR_QA.setLabelsVisible(false);window.__BAIKONUR_QA.puaLoading.pause();});
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().airports.find(a=>a.key==='yubileiny').mriya.orbiterMeshCount),8);
 for(const [seconds,view]of [[0,'all'],[20,'side'],[45,'all'],[76,'rigging'],[90,'side'],[110,'all']]){
  await page.evaluate(({seconds,view})=>{const q=window.__BAIKONUR_QA.puaLoading;q.seek(seconds);q.view(view);},{seconds,view});await frame();
  const s=await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats());assert.equal(s.elapsed,seconds);assert.equal(s.aircraftPose.lift,s.pose.lift);assert.equal(s.aircraftPose.aircraftZ,s.pose.aircraftZ);assert.equal(s.aircraftPose.orbiterZ,s.pose.orbiterZ);evidence.phases.push(s);
  await page.screenshot({path:`qa-pua/${prefix}-${seconds}.png`});
 }
 // Pause, resume, slider, speed and repeat are actual UI actions.
 await page.locator('#puaRestart').click();await page.locator('#puaPlay').click();assert((await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats())).paused);
 await page.locator('#puaSeek').fill('72');assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats())).elapsed,72);
 await page.locator('#puaSpeed').selectOption('2');assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats())).speed,2);
 const cameraBefore=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState().position);await page.mouse.move(650,380);await page.mouse.down();await page.mouse.move(760,440,{steps:8});await page.mouse.up();await frame();const cameraAfter=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState().position);assert.notDeepEqual(cameraAfter,cameraBefore,'Free orbit during loading');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await frame();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.locator('#puaLoadingPanel').boundingBox();assert(box.x>=0&&box.x+box.width<=390);await page.screenshot({path:`qa-pua/${prefix}-mobile.png`});
 await page.setViewportSize({width:1440,height:1000});await page.locator('#puaClose').click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats().active),false);
 const reset=await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats().aircraftPose);assert.deepEqual(reset,{aircraftZ:0,lift:0,orbiterZ:0});
 // Both historic scenes share the aircraft exhibit and must be mutually exclusive.
 await page.evaluate(()=>{window.__BAIKONUR_QA.puaLoading.start();window.__BAIKONUR_QA.buranLanding.start();});assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stats().active),false);
 await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.start());assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.buranLanding.stats().active),false);
 await page.evaluate(()=>{window.__BAIKONUR_QA.puaLoading.stop();window.__BAIKONUR_QA.focusSite('pad-251');});await frame();assert(await page.locator('#puaLoadingStart').isVisible());assert(await page.locator('#puaLoadingStart').isEnabled());await page.locator('#puaLoadingStart').click();assert(await page.locator('#puaLoadingPanel').isVisible());
 await page.evaluate(()=>window.__BAIKONUR_QA.puaLoading.stop());await page.goto(new URL('workshop/model.html?model=pua-100',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());evidence.viewer=await page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());assert.equal(evidence.viewer.modelId,'pua-100');assert(evidence.viewer.drawCalls<45);await page.screenshot({path:`qa-pua/${prefix}-model.png`});
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('PUA_BROWSER_PASS',JSON.stringify({base,phases:6,independentOrbiter:true,freeOrbit:true,mobile:true,mutualExclusion:true,viewerDrawCalls:evidence.viewer.drawCalls}));
}finally{await writeFile(`qa-pua/${prefix}-report.json`,JSON.stringify(evidence,null,2));await browser.close();}
