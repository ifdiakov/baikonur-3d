import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',opts={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);opts.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(opts),page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(180000);await mkdir('qa-a320',{recursive:true});
const evidence={base,errors:[],poses:[]};page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))evidence.errors.push(m.text());});
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=f=>['animate','animateModel'].includes(f.name)?(window.__A320_FRAME=f,0):native(f);});
try{
 await page.goto(new URL('workshop/model.html?model=aircraft',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());
 evidence.viewer=await page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());assert.equal(evidence.viewer.modelId,'aircraft');assert(evidence.viewer.size[2]>37.4&&evidence.viewer.size[2]<37.8);assert(evidence.viewer.drawCalls<60);
 for(const view of ['full','front','side','top']){await page.locator(`[data-view="${view}"]`).click();await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());await page.screenshot({path:`qa-a320/${prefix}-${view}.png`});}
 await page.locator('[data-view="full"]').click();await page.locator('#gear').click();await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());assert.equal(await page.evaluate(()=>window.__MODEL_VIEWER_QA.stats().gear),false);await page.screenshot({path:`qa-a320/${prefix}-retracted.png`});
 if(process.env.A320_VIEWER_ONLY){assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('A320_VIEWER_PASS',JSON.stringify(evidence.viewer));}
 else{
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__BAIKONUR_QA?.arrival.stats().aircraft.status==='ready');
  for(const seconds of [0,84,118,120,123,150,276,300,526]){
   await page.evaluate(t=>{const q=window.__BAIKONUR_QA;q.arrival.seek(t);q.arrival.setFollowing(true);window.__A320_FRAME(performance.now());},seconds);
   const s=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());evidence.poses.push(s);assert.equal(s.aircraft.airframe,'Airbus A320-214');assert.equal(s.aircraft.status,'ready');assert.equal(s.aircraft.gearWheelCount,6);assert.equal(s.aircraft.cabinWindows,82);assert.equal(s.aircraft.error,null);
   if(s.onGround)assert(Math.abs(s.mainWheelBottom-s.runwayY)<.002,`Main wheels must stay on the runway at ${seconds}`);
   if([84,120,150].includes(seconds))await page.screenshot({path:`qa-a320/${prefix}-map-${seconds}.png`});
  }
  await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(true);q.arrival.seek(84);q.arrival.inspect('port');window.__A320_FRAME(performance.now());});await page.screenshot({path:`qa-a320/${prefix}-night.png`});
  const night=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().aircraft);assert(night.cockpitLit&&night.cabinLightIntensity>1);assert(night.gearDoorAngles.some(a=>Math.abs(a)>1));
  const before=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().cameraOffset);await page.evaluate(()=>window.__BAIKONUR_QA.arrival.setFollowing(true));await page.mouse.move(650,430);await page.mouse.down();await page.mouse.move(780,480,{steps:8});await page.mouse.up();await page.evaluate(()=>window.__A320_FRAME(performance.now()));assert.notDeepEqual(await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().cameraOffset),before);
  await page.evaluate(()=>{window.__BAIKONUR_QA.arrival.stopFollowing();window.__BAIKONUR_QA.focusSite('airfield');});await page.locator('#modelCardButton').click();await page.waitForFunction(()=>window.__BAIKONUR_QA.modelInspector.stats().ready);
  // Krayniy's card opens the parked Tu-204 first; select the A320 through the viewer UI.
  assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.modelInspector.stats().modelId),'tu204');
  await page.frameLocator('#modelInspector iframe').locator('#modelSelect').selectOption('aircraft');await page.waitForFunction(()=>{const s=window.__BAIKONUR_QA.modelInspector.stats();return s.ready&&s.modelId==='aircraft';});assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.modelInspector.stats().modelId),'aircraft');await page.locator('.model-inspector-close').click();
  assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('A320_BROWSER_PASS',JSON.stringify({base,poses:evidence.poses.length,gear:true,night:true,follow:true,viewerDrawCalls:evidence.viewer.drawCalls}));
 }
}finally{await writeFile(`qa-a320/${prefix}-report.json`,JSON.stringify(evidence,null,2));await browser.close();}
