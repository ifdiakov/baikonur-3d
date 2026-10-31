import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const revision='20261031-facilities-rails-lighting-v3';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-facility-lighting';
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],failedRequests:[],views:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const sameOrigin=url=>new URL(url).origin===new URL(base).origin;
page.on('pageerror',error=>{evidence.errors.push(error.message);console.error('FACILITY_LIGHTING_RUNTIME_ERROR',error.message);});
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{if(response.status()>=400&&sameOrigin(response.url()))evidence.failedResources.push({url:response.url(),status:response.status()});});
page.on('requestfailed',request=>{if(sameOrigin(request.url()))evidence.failedRequests.push({url:request.url(),error:request.failure()?.errorText,type:request.resourceType()});});
// Draw a real frame after every state change while leaving SwiftShader free
// to capture screenshots, as in the museum's existing focused browser suites.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__FACILITY_LIGHTING_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__FACILITY_LIGHTING_FRAME());
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
async function snapshot(){
 return page.evaluate(()=>{const q=window.__BAIKONUR_QA,s=q.stats();return {
  revision:s.museumRevision,camera:q.cameraState(),render:s.render,shadersValid:s.shadersValid,
  evening:s.evening,ukss:{version:s.ukss.version,status:s.ukss.status},eastLightingZone:s.eastLightingZone
 };});
}
function checkRender(state){
 assert.equal(state.revision,revision);assert.equal(state.shadersValid,true,'Actual floodlight, beam, pool and beacon shaders compile');
 assert(state.render.drawCalls>0&&state.render.triangles>0,'The museum renders a populated scene');
 assert(finitePoint(state.camera.position)&&finitePoint(state.camera.target));
 const [x,y,z]=state.camera.position,[tx,ty,tz]=state.camera.target;
 assert(Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI>=29.99,'Inspection respects the museum minimum camera elevation');
 const f=state.evening.facilityLighting;
 const projection=state.evening.groundProjection;
 assert(projection?.indexedMeshes>0&&projection.queries>0,'The live lighting uses the exact ground-triangle spatial query');
 assert.equal(projection.staleFallbacks,0,'Static scene surfaces keep their original transforms during lighting placement');
 assert.equal(f.version,'facility-tower-lighting-v1');assert(f.drawCalls>0&&f.drawCalls<=6,'All added fixtures remain batched');
 assert.equal(f.dynamicLights,0,'No individual PointLight or SpotLight is created per mast');
 assert.equal(f.rendered.visibilityLeaks,0,'Hidden source structures leave no orphan luminous instances');
 assert(f.rendered.maximumError<.002,'Actual rendered instance matrices retain source fixture placement');
 assert.equal(f.rendered.lensInstances,f.fixtures);assert.equal(f.rendered.beaconInstances,f.beacons);
 assert.equal(state.evening.bankFilter.outsideBankCount,0);
 assert(!state.evening.powerFilter.litSiteIds.includes('pad-41'),'Site41 retains the established unpowered region');
 const road=state.evening.roadLighting;
 for(const [style,expected] of Object.entries({highway:{spacing:58/1.5,brightness:1.5,poolScale:1.5,colorTemperature:4800},cosmodrome:{spacing:43.5,brightness:2,poolScale:2,colorTemperature:2700}}))
  for(const [key,value] of Object.entries(expected))near(road[style][key],value);
 assert.deepEqual(road.highway.incompletePairs,[]);assert.deepEqual(road.cosmodrome.extraLamps,[],'The established paired/single street layout remains intact');
}
function checkMode(state,evening){
 const f=state.evening.facilityLighting;assert.equal(state.evening.evening,evening);assert.equal(f.evening,evening);
 assert.equal(f.emissiveIntensity,evening?1.3:0);
 assert.equal(f.rendered.activeLenses,evening?f.visibleFixtures:0);assert.equal(f.rendered.activeBeacons,evening?f.visibleBeacons:0);
 if(evening){assert(f.visibleFixtures>0&&f.visibleBeacons>0);assert(f.beaconPulse>=.28&&f.beaconPulse<=1);}
 else assert.equal(f.beaconPulse,0);
 assert.equal(f.beaconPeriod,3.8);
}
function checkRecords(records,state){
 const f=state.evening.facilityLighting,boards=new Map(records.boards.map(b=>[b.id,b])),ids=new Set(),bySite=new Map();
 assert.equal(records.floodlights.length,f.fixtures);assert.equal(records.beacons.length,f.beacons);assert.equal(boards.size,f.boards);
 assert.equal(f.fixtures,907);assert.equal(f.boards,26);assert.equal(f.beacons,77,'Only the audited existing high structures receive beacons');
 assert.equal(state.ukss.status,'ready','The real imported UKSS is required for this release check');
 assert.equal(f.importedUkss.source,'preserved-imported-geometry');assert.equal(f.importedUkss.lensComponents,735);assert.equal(f.importedUkss.boards,7);
 for(const r of [...records.floodlights,...records.beacons]){
  assert(r.id&&!ids.has(r.id));ids.add(r.id);assert(r.siteId&&r.source);
  assert(finitePoint(r.position)&&finitePoint(r.sourcePosition));assert.equal(typeof r.powered,'boolean');assert.equal(typeof r.visible,'boolean');
  assert.notEqual(r.siteId,'pad-41','No light is invented on the Site41 ruins');
  const count=bySite.get(r.siteId)||{fixtures:0,beacons:0};bySite.set(r.siteId,count);
  if(r.normal){
   count.fixtures++;assert(finitePoint(r.normal));near(Math.hypot(...r.normal),1);assert(r.width>0&&r.lensHeight>0);
   assert(distance(r.position,r.sourcePosition.map((n,i)=>n+r.normal[i]*.012))<1e-7,'Light is offset only 12mm in world space from its exact source lens');
   const board=boards.get(r.boardId);assert(board&&board.siteId===r.siteId,'Every luminous lens belongs to an existing source board');
   assert.equal(r.powered,board.powered);assert.equal(r.visible,board.visible);
  }else{
   count.beacons++;near(r.position[0],r.sourcePosition[0]);near(r.position[2],r.sourcePosition[2]);near(r.position[1]-r.sourcePosition[1],.045);
   assert(r.kind&&r.source,'The beacon identifies an actual tower/diverter anchor');
  }
 }
 for(const board of boards.values()){
  const lamps=records.floodlights.filter(r=>r.boardId===board.id);assert.equal(lamps.length,board.lamps);assert(lamps.length>0);
  const center=[0,1,2].map(axis=>lamps.reduce((sum,r)=>sum+r.sourcePosition[axis],0)/lamps.length);
  assert(distance(center,board.position)<1e-7,'The light beam begins at the real source screen');
  assert(finitePoint(board.target)&&board.target[1]<board.position[1]);assert(board.radiusX>0&&board.radiusY>0);
 }
 for(const site of f.sites){const count=bySite.get(site.siteId);assert(count);assert.equal(count.fixtures,site.fixtures);assert.equal(count.beacons,site.beacons);}
 for(const [id,count] of [['pad-1',32],['pad-250',735],['pad-110',115],['pad-31',20],['pad-42',1],['pad-23',4]])assert.equal(bySite.get(id)?.fixtures,count);
 for(const id of ['pad-1','pad-250','pad-110','pad-31','pad-81','pad-200','pad-45','pad-42','pad-112','airfield','pad-251'])assert(bySite.get(id)?.beacons>0,id+' has source tower beacons');
 assert.equal(bySite.get('pad-23').beacons,0,'Dish feeds remain free of speculative beacons');
 return {fixtures:f.fixtures,boards:f.boards,beacons:f.beacons,sites:f.sites,drawCalls:f.drawCalls};
}
async function focus(siteId,view){
 const chosen=await page.evaluate(({siteId,view})=>window.__BAIKONUR_QA.inspectFacilityLighting(siteId,view),{siteId,view});
 assert(chosen&&chosen.siteId===siteId&&chosen.view===view&&finitePoint(chosen.position),'A real '+view+' source target is selected at '+siteId);
 return chosen;
}
async function shot(name,chosen){
 evidence.lastView=name;await step();const state=await snapshot();checkRender(state);
 const projection=await page.evaluate(p=>window.__BAIKONUR_QA.projectWorld(...p),chosen.position);
 assert(projection&&projection.x>350&&projection.x<1500&&projection.y>100&&projection.y<900,'The chosen source fixture is visible in the unobstructed canvas');
 await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,chosen,projection,camera:state.camera,evening:state.evening.evening,render:state.render,facilityLighting:state.evening.facilityLighting});
 console.log('FACILITY_LIGHTING_VIEW',name);return state;
}

try{
 const url=new URL(base);url.searchParams.delete('site');url.searchParams.delete('station');url.searchParams.set('view','ukss');url.searchParams.set('detail','overview');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 await page.evaluate(()=>window.__BAIKONUR_QA.rockets.whenReady());await step();
 assert.equal(await page.locator('#error').isVisible(),false);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.setLabelsVisible(false);q.evening.setEvening(true);});
 const initial=await snapshot(),records=await page.evaluate(()=>window.__BAIKONUR_QA.evening.facilityLightRecords());
 checkRender(initial);evidence.initial=initial;evidence.layout=checkRecords(records,initial);
 await writeFile(`${out}/${prefix}-source-fixtures.json`,JSON.stringify(records,null,2));
 for(const [siteId,name] of [['pad-1','gagarin'],['pad-250','ukss-source'],['pad-110','site110']]){
  const all=await focus(siteId,'all');let state=await shot(name+'-all-evening',all);checkMode(state,true);
  const chosen=await focus(siteId,'fixture');
  assert(records.boards.some(b=>b.id===chosen.id&&b.siteId===siteId),'The camera targets a registered board');
  await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));state=await shot(name+'-fixture-day',chosen);checkMode(state,false);const dayCamera=state.camera;
  await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));state=await shot(name+'-fixture-evening',chosen);checkMode(state,true);
  assert.deepEqual(state.camera,dayCamera,'The day/evening comparison preserves exact framing');
 }
 for(const [siteId,name,view] of [
  ['pad-250','ukss-source-diverter','beacon'],['pad-110','site110-diverter','beacon'],
  ['pad-31','site31-projectors','fixture'],['pad-42','mik42-roof-light','fixture'],['pad-81','proton-tower','beacon']
 ]){
  const chosen=await focus(siteId,view),source=(view==='beacon'?records.beacons:records.boards).find(r=>r.id===chosen.id&&r.siteId===siteId);
  assert(source&&source.powered,'Additional site view selects its actual powered source structure');
  const state=await shot(name+'-evening',chosen);checkMode(state,true);
 }
 // The shader's beacon strength is measured at three deterministic points in
 // its slow cycle; ordinary render frames continue to use real elapsed time.
 evidence.pulse=await page.evaluate(()=>{const q=window.__BAIKONUR_QA,qStats=()=>q.stats().evening.facilityLighting;
  q.evening.update(0);const low=qStats().beaconPulse;q.evening.update(1900);const high=qStats().beaconPulse;
  q.evening.update(3800);const repeat=qStats().beaconPulse;return {low,high,repeat,period:qStats().beaconPeriod};});
 assert(evidence.pulse.low>.27&&evidence.pulse.low<.29);assert(evidence.pulse.high>.99);near(evidence.pulse.repeat,evidence.pulse.low);assert.equal(evidence.pulse.period,3.8);
 // Historical visibility must reach the separate global light batches. This
 // checks the real year-control path and both enabled flags and GPU matrices.
 await page.evaluate(()=>{const year=document.getElementById('year');year.value='1955';year.dispatchEvent(new Event('input',{bubbles:true}));window.__BAIKONUR_QA.evening.setEvening(true);});
 const hidden=await page.evaluate(()=>({records:window.__BAIKONUR_QA.evening.facilityLightRecords(),stats:window.__BAIKONUR_QA.stats().evening.facilityLighting}));
 assert(hidden.records.floodlights.filter(r=>r.siteId==='pad-250').every(r=>!r.visible),'The pre-UKSS year hides all imported source lamps');
 assert(hidden.records.beacons.filter(r=>r.siteId==='pad-250').every(r=>!r.visible),'The pre-UKSS year hides its tower beacons');
 assert.equal(hidden.stats.rendered.visibilityLeaks,0);evidence.historicalVisibility={year:1955,stats:hidden.stats};
 await page.evaluate(()=>{const year=document.getElementById('year');year.value='2026';year.dispatchEvent(new Event('input',{bubbles:true}));window.__BAIKONUR_QA.evening.setEvening(true);});
 const restored=await page.evaluate(()=>window.__BAIKONUR_QA.evening.facilityLightRecords());
 for(const key of ['floodlights','beacons'])assert.deepEqual(restored[key].map(({visible,...r})=>r),records[key].map(({visible,...r})=>r),'Day/night and historical visibility do not change source positions or layout');
 await step();evidence.final=await snapshot();checkRender(evidence.final);checkMode(evidence.final,true);
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);assert.deepEqual(evidence.failedRequests,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('FACILITY_LIGHTING_BROWSER_PASS',JSON.stringify({prefix,...evidence.layout,views:evidence.views.length,errors:[]}));
}catch(error){
 console.error('FACILITY_LIGHTING_BROWSER_FAILURE',error.message);
 evidence.failureStats=await snapshot().catch(()=>null);
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
