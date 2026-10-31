import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const revision='20261031-facilities-rails-lighting-v2';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-facility-access';
const manifest=JSON.parse(await readFile(new URL('../assets/models/tua/manifest-v2.json',import.meta.url),'utf8'));
const destinations={
 'mzk-through':'6336523428','mzk-side':'1834612260','sdi-west':'2529010043','sdi-east':'2529010042',
 'site110-left-west':'1834613559','site110-left-east':'1834613553','site110-right-west':'1834613467','site110-right-east':'1834613464'
};
const initialRocketModels={gagarin:'soyuz',site31:'soyuz',ukss:'energia-polyus',site110:'energia-buran','mik112-hall':'energia-buran','tua-0':'energia-buran','tua-1':'energia-buran'};
const views=[['mik112-gates','top'],['mik112-gates','oblique'],['mik112-fanout','top'],
 ['mzk','top'],['mzk','oblique'],['sdi','top'],['sdi','oblique'],['site110-left','oblique'],['site110-right','oblique']];
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],failedRequests:[],views:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
const sameOrigin=url=>new URL(url).origin===new URL(base).origin;
page.on('pageerror',error=>{evidence.errors.push(error.message);console.error('FACILITY_ACCESS_RUNTIME_ERROR',error.message);});
page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());});
page.on('response',response=>{if(response.status()>=400&&sameOrigin(response.url()))evidence.failedResources.push({url:response.url(),status:response.status()});});
page.on('requestfailed',request=>{if(sameOrigin(request.url()))evidence.failedRequests.push({url:request.url(),error:request.failure()?.errorText,type:request.resourceType()});});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__FACILITY_ACCESS_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__FACILITY_ACCESS_FRAME());
const near=(a,b,tolerance,message)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const pointNear=(a,b,message)=>{assert(finitePoint(a)&&finitePoint(b),message+' finite coordinates');a.forEach((v,i)=>near(v,b[i],1e-7,message+'['+i+']'));};
const elevation=camera=>Math.atan2(camera.position[1]-camera.target[1],Math.hypot(camera.position[0]-camera.target[0],camera.position[2]-camera.target[2]))*180/Math.PI;
async function snapshot(){return page.evaluate(()=>{
 const q=window.__BAIKONUR_QA,s=q.stats();return {revision:s.museumRevision,render:s.render,shadersValid:s.shadersValid,camera:q.cameraState(),
  evening:s.evening.evening,labelsVisible:s.labelsVisible,commonMetre:s.commonMetre,mik112:s.mik112,mik112Rail:s.mik112Rail,
  railProfile:s.transport.railProfile,railPorts:s.transport.facilityRailPorts,roadFeatures:s.transport.roadFeatureCount,railFeatures:s.transport.railFeatureCount,
  rockets:q.rockets.stats()};
});}
function checkState(s){
 assert.equal(s.revision,revision);assert.equal(s.shadersValid,true);assert(s.render.drawCalls>0&&s.render.triangles>0);
 near(s.commonMetre,.14,1e-12,'The existing museum metre');assert.equal(s.roadFeatures,3185);assert.equal(s.railFeatures,543);
 const m=s.mik112,r=s.mik112Rail,p=s.railProfile;
 assert.equal(m.version,'2.1-two-energia-gates');assert.equal(m.features['energia-gate'],2);assert.equal(m.features['low-hall-gate'],2);
 assert.equal(m.railGates.length,2);assert.equal(m.railHeadEntries.length,4);assert.equal(m.railLayout.tracksPerGate,2);
 assert.deepEqual(m.railGates.map(g=>g.centerX),[-71,-19]);assert.deepEqual(m.railGates.map(g=>g.trackIndices),[[0,1],[2,3]]);
 assert.equal(m.tua.status,'ready','Both detailed source carriers must be installed before railway inspection');
 assert.equal(m.tua.version,'tua-drive-model-v2');assert.equal(m.tua.instanceCount,2);assert.equal(m.tua.assetStats.triangleCount,93800);
 assert.deepEqual(m.tua.placements,manifest.placements,'The authored carrier poses stay unchanged');
 assert.equal(m.tua.runningGear.retentionAudit.afterVehicleWheels,128);assert.equal(m.tua.runningGear.retentionAudit.afterVehicleAxles,64);
 assert.deepEqual(m.tua.runningGear.retentionAudit.missingProtectedIDs,[]);
 assert.equal(r.connected,true);assert.equal(r.version,'mik112-two-gates-osm-rails-v1');assert.equal(r.tracks.length,4);
 assert.deepEqual(r.sourceSwitches,['1834612063','1834612065']);assert.equal(r.replacedSourceEdges,39);near(r.joinGap,0,1e-8,'Four approach joins');
 near(p.gauge,1.52*.14,1e-12,'Uniform railway gauge');near(p.headWidth,.20*.14,1e-12,'Uniform rail-head width');near(p.railHeight,.27*.14,1e-12,'Uniform rail profile');
 near(r.railGauge,p.gauge,1e-12,'MIK approach gauge');
 for(const track of r.tracks){
  assert.equal(track.sourceNodeId,r.sourceSwitches[Math.floor(track.trackIndex/2)]);
  pointNear(track.localEntry,m.railHeadEntries[track.trackIndex],'Installed MIK head port');pointNear(track.localStart,track.localEntry,'Approach starts at the installed model port');
  near(track.modelHeadGap,0,1e-8,'MIK model head join');near(track.junctionGap,0,1e-8,'MIK source switch join');
  pointNear(track.curveSamples[0],track.start,'First approach sample');pointNear(track.curveSamples.at(-1),track.end,'Last approach sample');
 }
 assert.equal(r.destinationRoutes.length,8);assert.deepEqual(r.destinationRoutes.map(row=>row.id).sort(),Object.keys(destinations).sort());
 const mapped=s.railPorts.filter(port=>port.sourceRouteId);assert.equal(mapped.length,8);
 for(const port of mapped){
  const route=r.destinationRoutes.find(route=>route.id===port.sourceRouteId);assert(route,'Every destination approach uses a selected OSM route');
  assert.equal(route.nodeIds.at(-1),destinations[port.sourceRouteId]);assert.equal(port.sourceNodeId,destinations[port.sourceRouteId]);
  assert(route.sourceWayIds.includes(port.sourceWayId),'The displayed approach branches from its selected source route');
  pointNear(port.renderedHeadCenter,port.headCenter,'Actual destination rail-head attachment');
  pointNear(port.points[0],port.sourcePoint,'Actual source attachment');near(port.headCenterGap,0,1e-8,'Destination head gap');near(port.networkDatumGap,0,1e-8,'Source datum gap');
  near(port.networkGauge,p.gauge,1e-12,'Approach network gauge');near(port.portGauge,p.gauge,1e-12,'Approach model gauge');
 }
 return {gates:2,carrierCount:2,tracks:4,destinations:8,gaugeMetres:1.52,headWidthMetres:.20};
}

try{
 const url=new URL(base);url.searchParams.delete('site');url.searchParams.delete('station');url.searchParams.set('view','mik112');url.searchParams.set('detail','tua');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 const readiness=await page.evaluate(async()=>{const q=window.__BAIKONUR_QA;return {results:await q.rockets.whenReady(),...q.rockets.stats()};});
 evidence.rocketReadiness=readiness;
 const failed=readiness.placements.filter(p=>p.status!=='ready'||p.error).map(({key,modelId,status,error})=>({key,modelId,status,error}));
 console.log('FACILITY_ACCESS_ROCKET_READINESS',JSON.stringify({results:readiness.results,placements:readiness.placements.map(({key,modelId,status,error})=>({key,modelId,status,error}))}));
 assert.deepEqual(Object.fromEntries(readiness.placements.map(p=>[p.key,p.modelId])),initialRocketModels,'All seven initial rocket placements are registered for this museum view');
 assert.deepEqual(readiness.results,Array(Object.keys(initialRocketModels).length).fill(true),'Every requested source rocket loads successfully: '+JSON.stringify(failed));
 assert.deepEqual(failed,[],'No failed or incomplete rocket asset may enter the inspection');
 await step();assert.equal(await page.locator('#error').isVisible(),false);
 const initial=await snapshot();evidence.initial=initial;evidence.coverage=checkState(initial);
 for(const [target,view] of views){
  evidence.lastView=target+'-'+view;
  const chosen=await page.evaluate(({target,view})=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);document.getElementById('close')?.click();return q.inspectFacilityAccess(target,view);},{target,view});
  assert(chosen,'The requested facility view is available');assert.equal(chosen.target,target);assert.equal(chosen.view,view);
  assert(finitePoint(chosen.center)&&finitePoint(chosen.eye));assert(chosen.range>0&&Number.isFinite(chosen.range));near(chosen.gauge,.2128,1e-12,'Inspection gauge');
  await step();const state=await snapshot();assert.equal(state.shadersValid,true);assert(state.render.drawCalls>0&&state.render.triangles>0);
  assert.equal(state.evening,false);assert.equal(state.labelsVisible,false);assert.equal(await page.locator('#info').isVisible(),false);
  pointNear(state.camera.target,chosen.center,'Camera targets the actual head-port bounds');const angle=elevation(state.camera);
  assert(angle>=29.99);if(view==='top')assert(angle>=89);else assert(angle>=30&&angle<=70);
  const projected=await page.evaluate(anchors=>anchors.map(anchor=>({...anchor,screen:window.__BAIKONUR_QA.projectWorld(...anchor.position)})),chosen.anchors);
  assert(projected.length>=4,'The view contains both tracks and their physical attachment evidence');
  for(const anchor of projected)assert(anchor.screen&&anchor.screen.x>350&&anchor.screen.x<1530&&anchor.screen.y>100&&anchor.screen.y<810,'A physical railway anchor is obscured or outside the close frame: '+anchor.id);
  if(target==='mik112-gates')for(const track of initial.mik112Rail.tracks)pointNear(chosen.anchors.find(a=>a.id==='mik112-track-'+track.trackIndex)?.position,track.start,'Rendered MIK transform and network agree');
  for(const port of initial.railPorts.filter(port=>port.sourceRouteId)){
   const anchor=chosen.anchors.find(anchor=>anchor.id===port.portId);if(anchor)pointNear(anchor.position,port.headCenter,'Rendered destination transform and network agree');
  }
  const name=target+'-'+view+'-day';await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
  evidence.views.push({name,chosen,camera:state.camera,elevation:angle,projected,render:state.render});console.log('FACILITY_ACCESS_VIEW',name);
 }
 const final=await snapshot();checkState(final);evidence.final=final;
 assert.deepEqual(final.mik112Rail,initial.mik112Rail,'Inspection does not rebuild the installed railway');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);assert.deepEqual(evidence.failedRequests,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('FACILITY_ACCESS_BROWSER_PASS',JSON.stringify({prefix,...evidence.coverage,views:evidence.views.length}));
}catch(error){
 evidence.failure={message:error.message,stack:error.stack};console.error('FACILITY_ACCESS_BROWSER_FAILURE',error.message);
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:30000}).catch(failure=>evidence.failure.screenshotError=failure.message);
 try{evidence.failure.state=await snapshot();}catch(failure){evidence.failure.snapshotError=failure.message;}
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false},null,2));throw error;
}finally{await browser.close();}
