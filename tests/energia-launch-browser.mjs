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
 
 // Detail launch CTA must be available regardless of the viewing azimuth.
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(220,'pad-250'));
 await draw();
 assert(await page.locator('#energiaLaunchQuickStart').isVisible(),'Any UKSS detail view exposes launch CTA');
 // Pre-rotate around UKSS to verify we do not force an authored start camera.
 await page.mouse.move(735,375);
 await page.mouse.down({button:'right'});
 await page.mouse.move(820,415,{steps:5});
 await page.mouse.up({button:'right'});
 const inputDirection=await page.evaluate(()=>{
  const s=window.__BAIKONUR_QA.cameraState();
  return s.position.map((p,i)=>p-s.target[i]);
 });
 await page.locator('#energiaLaunchQuickStart').click();
 await page.waitForFunction(()=>window.__BAIKONUR_QA.energia.stats()?.active===true,null,{timeout:100000});
 let s=await stats();assert.equal(s.time,-90);assert.equal(s.active,true);
 assert.equal(await page.locator('#year').inputValue(),'1987');
 assert(await page.locator('#energiaLaunchPanel').isVisible());
 assert.equal(s.modelReady,true);
 assert.equal(s.mode,'follow','Tracking the rocket is the default launch camera');
 const originalOrbit=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
 assert.equal(originalOrbit.controls.enablePan,false,'Follow orbit has no panning escape');
 assert.deepEqual(originalOrbit.controls.mouseButtons,{LEFT:0,MIDDLE:1,RIGHT:0},
  'Both mouse drag buttons rotate around rocket while following');
 assert.ok(originalOrbit.position.every(Number.isFinite));
 const currentDirection=originalOrbit.position.map((p,i)=>p-originalOrbit.target[i]);
 const cosine=currentDirection.reduce((sum,v,i)=>sum+v*inputDirection[i],0)/
  (Math.hypot(...currentDirection)*Math.hypot(...inputDirection));
 assert.ok(cosine>.995,'Launch preserves the current camera angle instead of snapping to a pad shot');
 assert.ok(Math.hypot(...originalOrbit.target.map((p,i)=>p-s.orbitTarget[i]))<.05,'Launch orbits the rocket center');
 assert.equal(s.effects.smokeMode,'multi-octave-feathered-billboards');
 assert.equal(s.effects.instancedSmokeCount,3335);
 assert.equal(s.effects.shadowMapEnabled,true);
 assert.equal(s.effects.shadowReceiverCount,6);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.cameraState().controlsEnabled),true,
  'OrbitControls must remain enabled during the launch');
 await shot('prelaunch');
 for(const [t,name] of [[-50,'gantry'],[-45,'gas-purge'],[-10,'water-spray'],[-9.4,'center-ignition'],[-3.2,'booster-ignition'],[0,'liftoff'],[6,'initial-ascent'],[30,'throttle'],[145.9,'boosters-separated'],[467.6,'core-cutoff'],[480,'separation'],[511,'payload-turn'],[568,'orbit-failed'],[600,'end']]){
  s=await seek(t);const e=s.effects;
  evidence.phases.push({t,phase:s.phase,gasPower:e.gasPower,flamePower:e.flamePower,ductJetVisible:e.ductJetVisible,rocketExhaustOffset:e.rocketExhaustOffset});
  assert.ok(Number.isFinite(s.telemetry.altitudeKm)&&Number.isFinite(s.telemetry.speedKmS));
  if(t===-50)assert.ok(e.mobileTowerArms.some(x=>x!==0),'Ground umbilicals begin to move');
  if(t===-10)assert.ok(e.water>0,'Water curtains begin before engine ignition');
  if(t===-9.4)assert.ok(e.engineJetCount===8&&e.engineFlameAttached,'All eight nozzle plumes follow the rocket');
  if(t===-3.2)assert.ok(e.flamePower>0,'Booster ignition produces exhaust');
  if(t===0){
   assert.ok(e.engineCorePower>.9&&e.engineBoosterPower>.9,'Both engine families show bright nozzle flames');
   assert.equal(e.shadowMapEnabled,true,'Live cast shadows enabled only during the launch');
   assert.ok(e.shadowLightIntensity>250,'Engine lights illuminate the UKSS structures');
   assert.equal(e.shadowReceiverCount,6,'Shadow projection covers launch apron and surrounding steppe');
   assert.ok(e.shadowMapResolution>=512,'Shadow map resolution is valid for device');
  }
  if(t===0){assert.equal(e.smokeMode,'multi-octave-feathered-billboards');assert.ok(e.ductJetVisible&&e.gasPower>.9,'One UKSS gas trench visibly ignites');assert.ok(e.lightIntensity.some(n=>n>100),'The fire illuminates its surroundings');await shot('fire-in-trench');}
  if(t===6){assert.equal(s.mode,'follow');assert.ok(e.smokeBillboards===undefined||e.plume>0,'A coherent smoke column persists');assert.ok(e.plume>0,'A soft rising plume accompanies the rocket');assert.ok(e.rocketExhaustOffset[1]>6,'Exhaust follows the ascending rocket');await shot('lift-off');}
  if(t===145.9){assert.ok(e.engineBoosterPower<.1&&e.engineCorePower>.9,'Booster exhaust ends after side engine shutdown');}
  if(t===30){
   assert.equal(e.padFireFade,0,'No standing fire at UKSS after ascent above the pad');
   assert.equal(e.padSmokeFade,0,'The ground cloud has dispersed while rocket exhaust remains active');
   assert.ok(e.engineCorePower>.9,'Rocket engine flame remains bright after the pad dissipates');
  }
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
 // Actual pointer orbit must not cancel or pause the event. The scene-selection
 // onNavigate handler previously called stop() on drag/wheel/keyboard.
 await seek(6);
 await page.locator('#energiaPlay').click();
 const clockBefore=await stats(),cameraBefore=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
 await page.mouse.move(740,370);
 await page.mouse.down();
 await page.mouse.move(840,418,{steps:6});
 await page.mouse.up();
 await draw();
 const manual=await stats(),cameraManual=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
 assert.equal(manual.active,true,'Dragging the camera cannot end the launch');
 assert.equal(manual.paused,false,'Camera orbit cannot pause the flight clock');
 assert.equal(manual.mode,'follow','Rotating the camera must KEEP follow mode');
 assert.ok(cameraBefore.position.some((v,i)=>Math.abs(v-cameraManual.position[i])>.01),
  'Real OrbitControls drag rotates the scene while the launch continues');
 const progressed=await page.evaluate(()=>{
  const q=window.__BAIKONUR_QA;
  q.energia.update(performance.now()+850);
  return q.energia.stats();
 });
 assert.ok(progressed.time>clockBefore.time,'Launch clock must keep progressing after an orbit');
 await shot('manual-camera-flight');
 await page.locator('[data-energia-camera="auto"]').click();
 assert.equal((await stats()).mode,'auto','Auto camera is available as an explicit alternative');
 await page.locator('[data-energia-camera="follow"]').click();
 assert.equal((await stats()).mode,'follow','Following the rocket can be reselected explicitly');
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
 assert.equal(after.camera.controls.enablePan,before.camera.controls.enablePan,'Original panning mode restored');
 assert.deepEqual(after.camera.controls.mouseButtons,before.camera.controls.mouseButtons,'Original mouse mode restored');
 assert.deepEqual(after.camera.controls.touches,before.camera.controls.touches,'Original touch mode restored');
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.energia.stats().effects.shadowMapEnabled)),false,
  'The renderer must restore its previous unshadowed museum state');
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
