import assert from 'node:assert/strict';

// Exercise the live tour controller and normal render, accelerating only time.
// No model, destination or camera API is replaced by this test.
export async function checkOnboardingRoute(page,mode,out){
 await page.waitForFunction(()=>window.__MUSEUM_ONBOARDING?.stats().ready,null,{timeout:30000});
 const setup=await page.evaluate(()=>{
  const q=__BAIKONUR_QA,t=__MUSEUM_ONBOARDING;t.skip();q.mapCameraSmoothing.cancel();
  if(!q.openObject('pad-250'))throw Error('UKSS unavailable');
  const expected=q.cameraState(),gagarin=q.siteState('pad-1');
  q.showOverview();q.mapCameraSmoothing.cancel();
  const realNow=performance.now.bind(performance),clock={now:realNow(),elapsed:0};
  window.__TOUR_CLOCK=clock;window.__TOUR_RESTORE_CLOCK=()=>Object.defineProperty(performance,'now',{configurable:true,value:realNow});
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock.now});
  document.getElementById('museumTourStart').click();
  if(!t.stats().active||t.stats().focused)throw Error('Replay button did not start the normal overview tour');
  const initial=q.cameraState();t.update(clock.now);
  return {expected,gagarin,initial,durationMs:t.stats().durationMs};
 });
 const advance=async end=>page.evaluate(end=>{
  const c=__TOUR_CLOCK;
  while(c.elapsed<end){const step=Math.min(100,end-c.elapsed);c.now+=step;c.elapsed+=step;__MUSEUM_ONBOARDING.update(c.now);}
  __DELIVERY_FRAME();
  return {tour:__MUSEUM_ONBOARDING.stats(),camera:__BAIKONUR_QA.cameraState(),selected:__MUSEUM_SHARE.current(),title:document.getElementById('title').textContent};
 },end);
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 try{
  const arrived=await advance(20000);
  assert.equal(arrived.selected.id,'pad-250','Tour must select UKSS, not Gagarin');
  assert(arrived.title.includes('УКСС'));
  assert.equal(arrived.tour.step,4);assert(arrived.tour.active);
  assert(distance(arrived.camera.target,setup.expected.target)<1e-6,'Flight missed UKSS inspection target');
  assert(distance(arrived.camera.target,setup.gagarin.position)>100,'Tour still targets Gagarin');
  await page.screenshot({path:out+'/onboarding-ukss.png',timeout:60000});
  const orbit=await advance(24000);
  assert(distance(orbit.camera.target,setup.expected.target)<1e-6,'Orbit changed its centre');
  assert(distance(orbit.camera.position,arrived.camera.position)>.1,'Fly-around did not move');
  const finished=await advance(29000);
  assert.equal(finished.tour.active,false);assert.equal(finished.camera.controlsEnabled,true);
  assert(distance(finished.camera.position,setup.initial.position)<1e-5,'End did not restore initial view');
  assert(distance(finished.camera.target,setup.initial.target)<1e-5,'End did not restore initial target');
  await page.evaluate(()=>{
   document.getElementById('museumTourStart').click();__TOUR_CLOCK.elapsed=0;
   __MUSEUM_ONBOARDING.update(__TOUR_CLOCK.now);
  });
  const beforeSkip=await advance(17000);
  const afterSkip=await page.evaluate(()=>{document.querySelector('.museum-tour__skip').click();return {tour:__MUSEUM_ONBOARDING.stats(),camera:__BAIKONUR_QA.cameraState()};});
  assert.equal(afterSkip.tour.active,false);assert.equal(afterSkip.camera.controlsEnabled,true);
  assert(distance(afterSkip.camera.position,beforeSkip.camera.position)<1e-6,'Skip jumped the camera');
  assert(distance(afterSkip.camera.target,beforeSkip.camera.target)<1e-6,'Skip jumped the target');
  if(mode==='workshop'){assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());}
  return {passed:true,targetId:'pad-250',durationMs:setup.durationMs,expected:setup.expected,arrived,orbit,finished,skipPreservesPose:true,
   coverage:'Live replay handler, exact UKSS arrival, orbit,29s overview return, replay and skip. Test clock and software rendering; not FPS or physical device.'};
 }finally{await page.evaluate(()=>{__MUSEUM_ONBOARDING.skip();window.__TOUR_RESTORE_CLOCK?.();});}
}
