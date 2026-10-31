import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-buran-landing';
const revision=process.env.BAIKONUR_EXPECTED_REVISION||'20261031-facilities-rails-lighting-v5';
const origin=new URL(base).origin;
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],failedRequests:[],views:[],contacts:[],controls:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',error=>evidence.errors.push(error.message));
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{
 if(response.status()>=400&&new URL(response.url()).origin===origin)evidence.failedResources.push({url:response.url(),status:response.status()});
});
page.on('requestfailed',request=>{
 if(new URL(request.url()).origin===origin)evidence.failedRequests.push({url:request.url(),error:request.failure()?.errorText});
});
// Only the museum's named render loop is frozen. Browser UI/RAF scheduling is
// unchanged, and every captured frame goes through the production renderer.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__BURAN_FRAME=()=>{const fn=pending;pending=null;const started=performance.now();fn?.(started);return started;};
 window.__BURAN_INPUT=[];
 for(const type of ['click','keydown','input','change'])document.addEventListener(type,event=>{
  if(event.target.id?.startsWith('buranLanding'))window.__BURAN_INPUT.push({type,id:event.target.id,key:event.key,value:event.target.value,trusted:event.isTrusted});
 },{capture:true,passive:true});
});
const step=()=>page.evaluate(()=>window.__BURAN_FRAME());
const near=(actual,expected,tolerance,message)=>assert(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} != ${expected}`);
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const clock=seconds=>[Math.floor(seconds/3600),Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(n=>String(n).padStart(2,'0')).join(':');

async function state(){
 return page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats(),b=q.buranLanding.stats();
  const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  return {revision:s.museumRevision,landing:b,scene:s.buranLandingScene,airport:s.airports.find(a=>a.id==='pad-251'),
   airportTransform:q.siteState('pad-251'),camera:q.cameraState(),render:s.render,shadersValid:s.shadersValid,
   arrival:q.arrival.stats(),selection:q.selectionState(),width:innerWidth,height:innerHeight,
   projected:{buran:b.position?q.projectWorld(...b.position):null,mig:b.escort?.position?q.projectWorld(...b.escort.position):null},
   ui:{panelHidden:document.getElementById('buranLandingPanel').hidden,panel:rect(document.getElementById('buranLandingPanel')),
    clock:document.getElementById('buranLandingClock').textContent,dateTime:document.getElementById('buranLandingClock').dateTime,
    phase:document.getElementById('buranLandingPhase').textContent,factTitle:document.getElementById('buranFactTitle').textContent,
    factText:document.getElementById('buranFactText').textContent,source:document.getElementById('buranFactSource').href,
    progress:Number(document.getElementById('buranLandingProgress').value),pause:document.getElementById('buranLandingPause').textContent,
    follow:document.getElementById('buranLandingFollow').getAttribute('aria-pressed'),
    activeClass:document.body.classList.contains('buran-landing-active'),followingClass:document.body.classList.contains('following-buran'),
    callsignHidden:document.getElementById('buranCallsign').hidden,activeElement:document.activeElement?.id}};
 });
}
function checkRender(s){
 assert.equal(s.revision,revision);assert.equal(s.shadersValid,true);
 assert(s.render.drawCalls>0&&s.render.triangles>0,'The event is exercised in the actual rendered museum');
 assert([...s.camera.position,...s.camera.target].every(Number.isFinite));
}
function checkActive(s){
 const b=s.landing;assert.equal(b.active,true);assert.equal(s.ui.panelHidden,false);assert.equal(s.ui.activeClass,true);
 assert.equal(s.scene.year,1988);assert.equal(s.scene.evening,false);
 assert.equal(s.scene.mriyaVisible,false,'The later An-225 exhibit is hidden during the 1988 event');
 assert.equal(s.scene.modernAircraftSuppressed,true);assert.equal(s.scene.modernAircraftVisible,false);
 assert.equal(s.ui.clock,b.clock+' МСК');assert.equal(b.clock,clock(b.times.start+b.elapsed));
 assert.equal(s.ui.dateTime,'1988-11-15T'+b.clock+'+03:00');near(s.ui.progress,b.elapsed,.051,'The real timeline follows event time');
 assert(Object.values(b.sources).some(source=>source.url===s.ui.source),'Every displayed fact links to a declared archive source');
 assert(s.ui.factTitle.length>5&&s.ui.factText.length>20);
 if(b.following){assert.equal(s.ui.follow,'true');assert.equal(s.ui.followingClass,true);assert.equal(s.camera.controls.enablePan,false);}
}
function checkClosed(s,baseline){
 assert.equal(s.landing.active,false);assert.equal(s.landing.following,false);assert.equal(s.ui.panelHidden,true);
 assert.equal(s.ui.activeClass,false);assert.equal(s.ui.followingClass,false);assert.equal(s.ui.callsignHidden,true);
 assert(s.landing.actualGearContacts.every(contact=>!contact.visible),'The actual event aircraft is hidden through its parent after closing');
 assert.deepEqual(s.scene,baseline.scene,'Closing restores the selected year, lighting, Mriya and current flight visibility');
 assert.deepEqual(s.camera.controls,baseline.camera.controls,'Closing restores every exposed OrbitControls setting');
 assert.equal(s.arrival.totalElapsed,baseline.arrival.totalElapsed,'The interrupted modern flight does not silently advance during the reconstruction');
}
function runwayPoint(point,s){
 const a=s.airportTransform,dx=point[0]-a.position[0],dz=point[2]-a.position[2],c=Math.cos(a.rotationY),n=Math.sin(a.rotationY);
 const metre=a.scale[0]*s.airport.physicalToLocal;
 return {x:(c*dx-n*dz)/metre,z:(n*dx+c*dz)/metre};
}
function checkTyres(s,{noseOnGround=false,noseRaised=false}={}){
 const b=s.landing,contacts=b.actualGearContacts,ground=b.path.runwayY;
 assert.deepEqual(contacts.map(c=>c.id).sort(),['main-left','main-right','nose']);
 near(ground,s.airportTransform.position[1]+s.airport.runwayY*s.airportTransform.scale[1],1e-9,'The contact datum is the transformed physical runway');
 for(const contact of contacts){
  assert.equal(contact.visible,true);assert([...contact.lowestPoint,contact.minimumY].every(Number.isFinite));
  near(contact.minimumY,contact.lowestPoint[1],1e-10,'The reported height belongs to an actual tyre vertex');
  assert(contact.minimumY>=ground-2e-5,'No actual tyre penetrates the runway');
  if(contact.id.startsWith('main-')||noseOnGround)near(contact.minimumY,ground,2e-5,'The appropriate actual tyre contacts the runway');
  if(contact.id==='nose'&&noseRaised)assert(contact.minimumY>ground+.15,'The nose tyre remains visibly raised after main-wheel touchdown');
  const p=runwayPoint(contact.lowestPoint,s);
  assert(Math.abs(p.x)<42&&Math.abs(p.z)<2250,'The real tyre contact remains within the 4500 × 84 m runway');
 }
 evidence.contacts.push({elapsed:b.elapsed,clock:b.clock,ground,contacts});
}
async function shot(name,{active=true,craft=false}={}){
 evidence.lastView=name;await step();const s=await state();checkRender(s);if(active)checkActive(s);
 if(craft){
  assert(s.projected.buran,'The event aircraft is inside the captured viewport');
  assert(s.projected.buran.y<s.ui.panel.y-12,'The aircraft remains above the event panel');
 }
 await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,...s});console.log('BURAN_LANDING_VIEW',name);return s;
}
async function openSection(id){
 const toggle=page.locator('#mobileMenuToggle');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 if(!await page.locator('#'+id).evaluate(element=>element.open))await page.locator('#'+id+' > summary').click();
}
async function openAirport(){
 await openSection('infrastructureAccordion');
 await page.locator('#infrastructureSearch').fill('Юбилейный');
 await page.locator('#infrastructureList .entry[data-site-id="pad-251"]').click();
 const s=await state();assert.equal(s.selection.currentObject,s.airportTransform.index);
 assert.equal(await page.locator('#buranLandingStart').isVisible(),true);
 assert.equal(await page.locator('#airportViews button').count(),2,'The two existing airport views remain distinct from the landing action');
 assert.equal(await page.locator('#airportViews #buranLandingStart').count(),0);
}
async function seek(seconds){await page.evaluate(t=>window.__BAIKONUR_QA.buranLanding.seek(t),seconds);return state();}
async function canvasPoint(){
 return page.evaluate(()=>{
  const canvas=document.querySelector('#view canvas');
  for(const [u,v]of [[.82,.32],[.72,.27],[.85,.42],[.65,.24]]){
   const x=Math.round(innerWidth*u),y=Math.round(innerHeight*v);if(document.elementFromPoint(x,y)===canvas)return{x,y};
  }
  throw new Error('The event leaves no unobstructed canvas area for a real zoom gesture');
 });
}
async function wheel(delta){
 const p=await canvasPoint();await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,delta);await page.waitForTimeout(40);await step();
}
async function followFresh(){
 if((await state()).landing.following)await page.locator('#buranLandingFollow').click();
 await page.locator('#buranLandingFollow').click();
 await step();
 const s=await state();assert.equal(s.landing.following,true);assert.equal(s.landing.mode,'craft');
}

try{
 const url=new URL(base);for(const key of ['view','detail','site','station'])url.searchParams.delete(key);
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&
  document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().airports.find(a=>a.id==='pad-251')?.mriya?.status==='ready',null,{timeout:180000});
 assert.equal(await page.locator('#error').isVisible(),false);await step();
 await openAirport();
 // Establish a non-default historical/light state and a known visible, paused
 // modern flight so the later restoration cannot pass merely by coincidence.
 await page.locator('#year').focus();await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');
 assert.equal(await page.locator('#year').inputValue(),'2025');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(true);q.arrival.seek(148);});
 await shot('yubileiny-card',{active:false});evidence.baseline=await state();
 assert.equal(evidence.baseline.scene.mriyaVisible,true);assert.equal(evidence.baseline.scene.modernAircraftVisible,true);

 await page.locator('#buranLandingStart').click();await page.locator('#buranLandingPause').click();
 let s=await state();checkActive(s);assert.equal(s.landing.paused,true);assert.equal(s.landing.elapsed,0);
 assert.equal(s.landing.version,'buran-landing-event-v1');
 const b=s.landing,source=b.aircraft.source;
 assert.equal(b.path.version,'buran-radar-landing-path-v1');assert.equal(b.path.observationCount,19);
 assert.equal(b.path.interpolatedObservationCount,16);assert.equal(b.path.rawObservationsPreserved,true);
 assert.equal(b.path.runwayDesignator,'24');assert.equal(b.path.sourceAirportHeadingPreserved,true);near(b.path.metresToWorld,.14,1e-12,'The runway and aircraft retain the common physical scale');
 assert.equal(b.path.escortJoinAltitudeM,8200);assert(b.path.escortJoinElapsed>163.8&&b.path.escortJoinElapsed<187.4,'Escort join is interpolated between the bracketing radar observations');
 assert.equal(b.path.rolloutM,1620);assert.equal(b.path.rolloutSeconds,42);assert.equal(b.sourceDiscrepancies,6);
 assert.match(b.notice,/реконструкц|восстановлен/i);assert.equal(b.path.reconstruction.touchdownFromThresholdM,810);
 assert.equal(source.retainedTriangles,33853);assert.equal(source.sourceTriangles,78388);assert.equal(source.immutable,true);
 for(const [i,expected]of [23.918848037719727,14.160736030016942,36.3599739074707].entries())near(source.bounds.size[i],expected,1e-6,'The existing source Buran geometry retains its dimensions');
 assert.equal(b.aircraft.version,'buran-landing-aircraft-v1');assert.equal(b.aircraft.gearStruts,3);assert.equal(b.aircraft.gearWheels,6);
 assert.equal(b.aircraft.parachuteCount,3);assert.equal(b.aircraft.deployedParachutes,0);
 assert.equal(b.aircraft.escort.count,1);assert.equal(b.aircraft.escort.boardNumber,'22');assert.equal(b.aircraft.escort.schematic,true);
 assert.equal(b.escort.count,1);assert.equal(b.escort.visible,false,'The escort is absent before its documented rendezvous stage');
 assert(b.aircraft.budget.buran.triangles>=33853&&b.aircraft.budget.buran.triangles<41000&&b.aircraft.budget.buran.draws<=80);
 assert(b.aircraft.budget.mig.triangles<5000&&b.aircraft.budget.mig.draws<=6);
 evidence.initialEvent=s;

 // Range and playback controls receive real pointer/keyboard events. QA seek
 // is reserved for reproducible physical milestones and close visual frames.
 const slider=page.locator('#buranLandingProgress'),box=await slider.boundingBox();
 await slider.click({position:{x:box.width*.5,y:box.height*.5}});
 s=await state();checkActive(s);assert(s.landing.elapsed>180&&s.landing.elapsed<260);assert.notEqual(s.ui.factText,evidence.initialEvent.ui.factText);
 await slider.focus();await page.keyboard.press('Home');s=await state();assert.equal(s.landing.elapsed,0);
 await page.keyboard.press('End');await step();s=await state();assert.equal(s.landing.elapsed,b.times.end);assert.equal(s.ui.pause,'Сначала');
 await page.keyboard.press('ArrowLeft');s=await state();near(s.landing.elapsed,b.times.end-.1,1e-8,'A native range key changes event time');
 await page.locator('#buranLandingReplay').click();s=await state();assert.equal(s.landing.elapsed,0);assert.equal(s.landing.paused,false);assert.equal(s.ui.pause,'Пауза','Replay clears a previous paused/end label');
 await page.locator('#buranLandingSpeed').focus();await page.keyboard.press('End');await page.keyboard.press('Tab');
 assert.equal((await state()).landing.speed,6);
 const firstFrame=await step(),beforePlayback=await state();await page.waitForTimeout(130);const secondFrame=await step(),afterPlayback=await state();
 near(afterPlayback.landing.elapsed-beforePlayback.landing.elapsed,6*(secondFrame-firstFrame)/1000,.04,'The real ×6 control scales production-frame playback');
 await page.locator('#buranLandingPause').click();const paused=await state();assert.equal(paused.landing.paused,true);
 await page.waitForTimeout(80);await step();near((await state()).landing.elapsed,paused.landing.elapsed,1e-9,'Pause freezes event time across real frames');
 evidence.controls.push({kind:'native-range-and-playback',beforePlayback,afterPlayback,paused});

 await seek(0);await page.locator('#buranLandingOverview').click();s=await shot('whole-manoeuvre');
 assert.equal(s.landing.mode,'overview');assert.equal(s.landing.following,false);assert.equal(s.camera.controls.enablePan,true);
 await page.locator('#buranLandingPanel .buran-event-note > summary').click();
 assert.equal(await page.locator('#buranSources a').count(),5);assert.match(await page.locator('#buranReconstructionNotice').textContent(),/телеметр|реконструкц/i);
 await page.locator('#buranLandingPanel .buran-event-note > summary').click();

 await seek(b.path.escortJoinElapsed+10);await followFresh();
 // Fit the real companion as well as Buran. Zoom changes go through the
 // canvas input handler; no test camera or artificial render is substituted.
 for(let i=0;i<5;i++){
  s=await state();const p=s.projected.mig;
  if(p&&p.x>24&&p.x<s.width-24&&p.y>24&&p.y<s.ui.panel.y-20)break;
  await wheel(900);
 }
 s=await shot('mig25-escort',{craft:true});assert.equal(s.landing.escort.visible,true);assert.equal(s.landing.escort.count,1);
 assert(s.projected.mig&&s.projected.mig.y<s.ui.panel.y-12,'The sole MiG-25 is visible in the escort review frame');
 assert(distance([s.projected.buran.x,s.projected.buran.y],[s.projected.mig.x,s.projected.mig.y])>20,'The two aircraft can be distinguished in the image');

 await seek(b.times.touchdown-9);await followFresh();await wheel(-900);
 s=await shot('final-flare',{craft:true});assert.equal(s.landing.state.onGround,false);near(s.landing.state.gear,1,1e-8,'Landing gear is fully extended before touchdown');
 assert(s.landing.actualGearContacts.every(c=>c.minimumY>s.landing.path.runwayY),'The final flare has not yet contacted the runway');
 const touchdown=await seek(b.times.touchdown);checkTyres(touchdown,{noseRaised:true});
 assert.equal(touchdown.landing.clock,'09:24:42');assert.equal(touchdown.landing.state.onGround,true);
 assert.equal(touchdown.landing.aircraft.deployedParachutes,0);near(touchdown.landing.state.pitchDeg,11,1e-8,'The nose remains raised at touchdown');
 assert.equal(touchdown.ui.source,touchdown.landing.sources.report.url);
 await shot('main-wheel-touchdown',{craft:true});

 await seek(b.times.parachutes+.6);s=await shot('three-parachutes-opening',{craft:true});
 assert.equal(s.landing.aircraft.deployedParachutes,3);assert(s.landing.state.chute>0&&s.landing.state.chute<1);
 assert.equal(s.ui.source,s.landing.sources.flightText.url);
 s=await seek(b.times.noseWheel);checkTyres(s,{noseOnGround:true});assert.equal(s.landing.clock,'09:24:52');
 near(s.landing.state.pitchDeg,0,1e-9,'The nose tyre settles onto the runway at the documented approximate time');
 await seek(b.times.parachutes+1.5);s=await shot('three-parachutes-deployed',{craft:true});checkTyres(s,{noseOnGround:true});
 near(s.landing.state.chute,1,1e-9,'All three parachutes fully deploy');assert.equal(s.landing.aircraft.deployedParachutes,3);

 const stopped=await seek(b.times.stop);checkTyres(stopped,{noseOnGround:true});
 assert.equal(stopped.landing.clock,'09:25:24');near(stopped.landing.state.sourcePose.rolloutM,1620,1e-8,'The live rollout reaches the documented distance');
 const contactLocal=runwayPoint(touchdown.landing.mainWheel,touchdown),stopLocal=runwayPoint(stopped.landing.mainWheel,stopped);
 near(contactLocal.z-stopLocal.z,1620,1e-6,'Actual aircraft movement along the native runway is 1620 metres');
 near(2250-contactLocal.z,810,1e-6,'The stated approximate touchdown point is measured from the northeast threshold');
 assert.equal(stopped.ui.source,stopped.landing.sources.chronology.url);assert.match(stopped.ui.factText,/1620/);
 await shot('rollout-stop',{craft:true});
 const flyby=await seek(b.times.stop+10);assert(distance(flyby.landing.mainWheel,stopped.landing.mainWheel)<1e-8,'Buran remains stopped during the escort flyby');
 assert.equal(flyby.landing.escort.visible,true);assert.equal(flyby.ui.source,flyby.landing.sources.flight.url);
 assert.match(flyby.ui.factText,/09:35/);evidence.flyby=flyby;

 await page.locator('#buranLandingClose').click();await step();s=await state();checkClosed(s,evidence.baseline);evidence.closed=s;
 // An archive story hides card-specific controls. Reopening the airport must
 // clear that inline style as well as its hidden attribute.
 const story=page.locator('[data-museum-action^="story:"]').first();
 const storySection=await story.evaluate(element=>element.closest('details').id);
 await openSection(storySection);await story.click();assert.equal(await page.locator('#buranLandingStart').isVisible(),false);
 await openAirport();
 await page.locator('#buranLandingStart').click();await seek(b.times.touchdown);
 const airportEntry=page.locator('#infrastructureList .entry[data-site-id="pad-251"]');
 await airportEntry.focus();assert.equal((await state()).landing.active,true);await page.keyboard.press('Enter');
 s=await state();assert.equal(s.landing.active,false,'A keyboard-activated map action stops the event before moving its camera');
 assert.equal(s.selection.currentObject,s.airportTransform.index);assert.equal(await page.locator('#buranLandingStart').isVisible(),true);
 evidence.controls.push({kind:'archive-return-and-keyboard-exit',state:s});

 // One narrow viewport reuses the same WebGL context and loaded source model.
 await page.setViewportSize({width:375,height:812});await openAirport();const mobileBaseline=await state();
 await page.locator('#buranLandingStart').click();await seek(b.times.touchdown);s=await shot('mobile-touchdown',{craft:true});
 assert.equal(s.width,375);assert(s.ui.panel.x>=0&&s.ui.panel.right<=375.5&&s.ui.panel.bottom<=812.5,'The event panel fits a 375 px phone');
 const mobileControls=await page.locator('#buranLandingPanel .buran-event-controls').evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth}));
 assert(mobileControls.scroll<=mobileControls.client+1,'Playback controls wrap without horizontal overflow');
 checkTyres(s,{noseRaised:true});
 await page.locator('#buranLandingOverview').click();s=await shot('mobile-manoeuvre');assert.equal(s.landing.mode,'overview');
 await page.locator('#buranLandingClose').click();await step();checkClosed(await state(),mobileBaseline);

 evidence.inputEvents=await page.evaluate(()=>window.__BURAN_INPUT);
 for(const id of ['buranLandingStart','buranLandingPause','buranLandingReplay','buranLandingOverview','buranLandingFollow','buranLandingClose'])
  assert(evidence.inputEvents.some(e=>e.type==='click'&&e.id===id&&e.trusted),'The browser received a real click on '+id);
 assert(evidence.inputEvents.some(e=>e.type==='input'&&e.id==='buranLandingProgress'&&e.trusted),'The native range input really changed');
 assert(evidence.inputEvents.some(e=>e.type==='change'&&e.id==='buranLandingSpeed'&&e.trusted),'The real speed selector changed');
 assert(evidence.inputEvents.every(e=>e.trusted),'Event UI coverage uses trusted browser input');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);
 assert.deepEqual(evidence.failedResources,[]);assert.deepEqual(evidence.failedRequests,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('BURAN_LANDING_BROWSER_PASS',JSON.stringify({prefix,revision,views:evidence.views.length,physicalContactStates:evidence.contacts.length,sourceTriangles:33853,escortCount:1,parachutes:3,runway:'24',rolloutM:1620,widths:[1600,375]}));
}catch(error){
 evidence.failureState=await state().catch(()=>null);
 evidence.inputEvents=await page.evaluate(()=>window.__BURAN_INPUT||[]).catch(()=>[]);
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));
 throw error;
}finally{await browser.close();}
