import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local';
const output='qa-energia-launch';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:920},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION|Uncaught TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__ENERGIA_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const stats=()=>page.evaluate(()=>window.__BAIKONUR_QA.energia.stats());
const draw=()=>page.evaluate(()=>window.__ENERGIA_FRAME());
const shot=async name=>{await draw();await page.screenshot({path:output+'/'+prefix+'-'+name+'.png',timeout:180000});};
const seek=async seconds=>{
 await page.evaluate(t=>window.__BAIKONUR_QA.energia.seek(t),seconds);
 await draw();const state=await stats();
 assert.equal(state.time,seconds,'Timeline seek must land on requested phase');
 assert.equal(state.active,true);
 return state;
};
const evidence={base,prefix,phases:[],sources:[],restored:null,mobile:null,errors};
try{
 const u=new URL(base);u.searchParams.set('view','ukss');
 await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.energia?.stats()&&document.getElementById('museumLoading')?.dataset.state==='ready',null,{timeout:180000});
 const before=await page.evaluate(()=>({
  year:document.getElementById('year').value,
  evening:window.__BAIKONUR_QA.evening.stats().evening,
  rocket:window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='ukss'),
  camera:window.__BAIKONUR_QA.cameraState()
 }));
 assert.equal(before.rocket.modelId,'energia-polyus');
 await page.locator('#energiaLaunchStart').click();
 await page.waitForFunction(()=>window.__BAIKONUR_QA.energia.stats()?.active===true,null,{timeout:100000});
 let s=await stats();assert.equal(s.time,-90);assert.equal(s.active,true);
 assert.equal(await page.locator('#year').inputValue(),'1987');
 assert(await page.locator('#energiaLaunchPanel').isVisible());
 assert.equal(s.modelReady,true);
 assert.equal(s.effects.smokeMode,'soft-feathered-billboards');
 assert.equal(s.effects.instancedSmokeCount,1305);
 await shot('prelaunch');
 for(const [t,name] of [[-50,'gantry'],[-45,'gas-purge'],[-10,'water-spray'],[-9.4,'center-ignition'],[-3.2,'booster-ignition'],[0,'liftoff'],[6,'initial-ascent'],[30,'throttle'],[145.9,'boosters-separated'],[467.6,'core-cutoff'],[480,'separation'],[511,'payload-turn'],[568,'orbit-failed'],[600,'end']]){
  s=await seek(t);const e=s.effects;
  evidence.phases.push({t,phase:s.phase,gasPower:e.gasPower,flamePower:e.flamePower,ductJetVisible:e.ductJetVisible,rocketExhaustOffset:e.rocketExhaustOffset});
  assert.ok(Number.isFinite(s.telemetry.altitudeKm)&&Number.isFinite(s.telemetry.speedKmS));
  if(t===-50)assert.ok(e.mobileTowerArms.some(x=>x!==0),'Ground umbilicals begin to move');
  if(t===-10)assert.ok(e.water>0,'Water curtains begin before engine ignition');
  if(t===-3.2)assert.ok(e.flamePower>0,'Booster ignition produces exhaust');
  if(t===0){assert.equal(e.smokeMode,'soft-feathered-billboards');assert.ok(e.ductJetVisible&&e.gasPower>.9,'One UKSS gas trench visibly ignites');assert.ok(e.lightIntensity.some(n=>n>100),'The fire illuminates its surroundings');await shot('fire-in-trench');}
  if(t===6){assert.ok(e.plume>0,'A soft rising plume accompanies the rocket');assert.ok(e.rocketExhaustOffset[1]>6,'Exhaust follows the ascending rocket');await shot('lift-off');}
  if(t===480){assert.equal(s.rocketVisible,false,'The launch assembly remains visible until payload separation');assert.equal(s.telemetry.altitudeKm,110);assert.equal(s.telemetry.payloadSeparated,true);await shot('polyus-separation');}
  if(t===511)assert.equal(s.telemetry.payloadTurn,true);
  if(t===0)assert.equal(s.flightRate,1,'Liftoff must reset the clock to realtime');
  if(t===0)assert.ok(s.rocketVerticalWorld<.1,'At zero the rocket stays on its support');
  if(t===6)assert.ok(s.rocketVerticalWorld<18,'First seconds are shown near the pad');
 }
 await page.locator('#energiaRestart').click();s=await stats();assert.equal(s.time,-90);
 await page.locator('#energiaSpeed').selectOption('4');
 await page.locator('#energiaPlay').click();s=await stats();assert(s.paused);
 await page.locator('#energiaPlay').click();s=await stats();assert(!s.paused);
 await page.locator('#energiaClose').click();
 await draw();
 s=await stats();assert.equal(s.active,false);
 const after=await page.evaluate(()=>({
  year:document.getElementById('year').value,
  evening:window.__BAIKONUR_QA.evening.stats().evening,
  rocket:window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='ukss'),
  camera:window.__BAIKONUR_QA.cameraState(),
  hidden:document.getElementById('energiaLaunchPanel').hidden,
  active:document.body.classList.contains('energia-launch-active')
 }));
 assert.equal(after.year,before.year);assert.equal(after.evening,before.evening);
 assert.deepEqual(after.rocket.position,before.rocket.position);assert.deepEqual(after.rocket.quaternion,before.rocket.quaternion);
 assert.equal(after.rocket.visible,before.rocket.visible);assert(after.hidden);assert(!after.active);
 evidence.restored=after;
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__BAIKONUR_QA.energia.start());
 await seek(0);
 const mobile=await page.locator('#energiaLaunchPanel').evaluate(el=>{
  const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};
 });
 assert(mobile.left>=0&&mobile.right<=390.5&&mobile.bottom<=844.5,'Mobile telemetry panel fits viewport');
 evidence.mobile=mobile;await shot('mobile-ignition');
 await page.evaluate(()=>window.__BAIKONUR_QA.energia.stop());
 assert.equal((await stats()).active,false);
 const shader=await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid);
 assert.equal(shader,true,'All dynamic fire and smoke shader programs compiled');
 assert.deepEqual(errors,[]);
 await writeFile(output+'/'+prefix+'-report.json',JSON.stringify(evidence,null,2));
 console.log('ENERGIA_LAUNCH_BROWSER_PASS',JSON.stringify({prefix,phases:evidence.phases.length,renderedScenes:5,mobile}));
}finally{await browser.close();}
