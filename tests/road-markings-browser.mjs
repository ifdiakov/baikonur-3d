import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const revision='20261031-facilities-rails-lighting-v3';
const markingsVersion='junction-aware-markings-v1';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-road-markings';
// Source node IDs identify the actual joins. The two upper nodes include
// one-way ramps; the lower T joins have two-way ramps and rounded aprons.
const targets=[
 {name:'upper-merge-east',nodeId:'1833284266',kind:'merge',xz:[-88.26706142284488,995.5127201063574]},
 {name:'upper-merge-west',nodeId:'3734910059',kind:'merge',xz:[-104.18813820783946,998.3406333868828]},
 {name:'lower-t-south',nodeId:'3734910038',kind:'crossing',xz:[-122.29112104850402,1011.138365988853]},
 {name:'lower-t-north',nodeId:'1833284265',kind:'crossing',xz:[-126.82930762856367,995.8785690272796]},
 {name:'cosmodrome-t',nodeId:'687038520',kind:'crossing',xz:[-144.36911353067833,-326.39598266236925]},
 {name:'curved-source-split',nodeId:'439813528',kind:'continuation',xz:[376.82282239276424,-607.256861477827]}
];
const evidence={base,prefix,revision,markingsVersion,targets,errors:[],shaderErrors:[],failedResources:[],failedRequests:[],views:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const sameOrigin=url=>new URL(url).origin===new URL(base).origin;
page.on('pageerror',error=>{evidence.errors.push(error.message);console.error('ROAD_MARKINGS_RUNTIME_ERROR',error.message);});
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{
 if(response.status()>=400&&sameOrigin(response.url()))evidence.failedResources.push({url:response.url(),status:response.status()});
});
page.on('requestfailed',request=>{
 if(sameOrigin(request.url()))evidence.failedRequests.push({url:request.url(),error:request.failure()?.errorText,type:request.resourceType()});
});
// Keep SwiftShader available for screenshots while still drawing a real
// museum frame after each camera change, as in the other focused suites.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__ROAD_MARKINGS_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__ROAD_MARKINGS_FRAME());
async function snapshot(){
 return page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats();
  return {revision:s.museumRevision,camera:q.cameraState(),render:s.render,shadersValid:s.shadersValid,
   evening:s.evening.evening,labelsVisible:s.labelsVisible,
   roadFeatures:s.transport.roadFeatureCount,railFeatures:s.transport.railFeatureCount,
   markings:s.transport.roadSurface.markings,highway:s.transport.roadSurface.highway};
 });
}
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
function elevation(camera){
 const [x,y,z]=camera.position,[tx,ty,tz]=camera.target;
 return Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI;
}
function checkRender(state){
 assert.equal(state.revision,revision);assert.equal(state.shadersValid,true);
 assert(state.render.drawCalls>0&&state.render.triangles>0,'The road inspection renders real scene geometry');
 assert(finitePoint(state.camera.target)&&finitePoint(state.camera.position));
 assert(elevation(state.camera)>=29.99,'The inspection respects the museum camera elevation');
}
function checkMarkings(state){
 const m=state.markings;assert(m,'The rendered network exposes its marking report');
 assert.equal(m.version,markingsVersion);
 const counters=['roadRuns','eligibleRoadRuns','chains','continuationSeams','junctionCount',
  'edgeQuads','centerQuads','dividerQuads','projectedVertices','projectionRejectedQuads',
  'edgeOpenings','centerOpenings','suppressedOneWayCenters','suppressedSingleLaneCenters','suppressedUnpavedRuns','regulatoryMarks'];
 for(const key of counters)assert(Number.isInteger(m[key])&&m[key]>=0,'A finite nonnegative marking counter is reported: '+key);
 assert(m.roadRuns>=m.eligibleRoadRuns&&m.eligibleRoadRuns>0,'Eligible paint runs belong to the rendered road network');
 assert(m.chains>0&&m.continuationSeams>0,'Paint chains continue through degree-two source splits');
 assert(m.junctionCount>=4&&m.edgeOpenings>0&&m.centerOpenings>0,'True junctions open both edge and center markings');
 assert(m.edgeQuads>0&&m.centerQuads>0&&m.dividerQuads>0&&m.projectedVertices>0,'Edge, two-way center, and one-way lane-divider paint reach the rendered output');
 assert.equal(m.projectedVertices,4*(m.edgeQuads+m.centerQuads+m.dividerQuads),'Every accepted paint quad has all four vertices projected onto pavement');
 assert(m.suppressedOneWayCenters>0,'One-way roads do not receive an opposing-traffic centerline');
 assert.equal(m.regulatoryMarks,0,'The display does not invent stop/yield markings without source evidence');
 assert(Array.isArray(m.junctionSamples)&&m.junctionSamples.length>0&&m.junctionSamples.length<=m.junctionCount);
 for(const sample of m.junctionSamples){
  assert(sample.nodeId&&finitePoint(sample.position));assert(['merge','crossing'].includes(sample.type));
  assert(Array.isArray(sample.wayIds)&&sample.wayIds.length>0&&new Set(sample.wayIds).size===sample.wayIds.length);
 }
 assert(Array.isArray(m.seamSamples)&&m.seamSamples.length>0&&m.seamSamples.length<=m.continuationSeams);
 for(const sample of m.seamSamples){
  assert(sample.nodeId&&sample.type==='continuation');
  assert(Array.isArray(sample.roadIds)&&sample.roadIds.length>=2);
 }
 assert.equal(state.roadFeatures,3185);assert.equal(state.railFeatures,543);
 assert.equal(state.highway.sourceTopologyPreserved,true,'Marking changes preserve the source highway graph');
 return {chains:m.chains,continuationSeams:m.continuationSeams,junctions:m.junctionCount,
  paintQuads:m.edgeQuads+m.centerQuads+m.dividerQuads,projectedVertices:m.projectedVertices,
  projectionRejectedQuads:m.projectionRejectedQuads,edgeOpenings:m.edgeOpenings,centerOpenings:m.centerOpenings};
}
async function focus(target,view){
 return page.evaluate(({nodeId,view})=>{
  const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);
  const chosen=q.inspectRoadMarkings(nodeId,view);document.getElementById('close')?.click();return chosen;
 },{nodeId:target.nodeId,view});
}
async function inspect(target,view){
 evidence.lastView=target.name+'-'+view;
 const chosen=await focus(target,view);assert(chosen,'Inspection node is available: '+target.nodeId);
 assert.equal(String(chosen.nodeId),target.nodeId);assert.equal(chosen.view,view);
 assert(finitePoint(chosen.center));assert(Number.isFinite(chosen.range)&&chosen.range>0&&chosen.range<=32,'Thin markings receive a close inspection frame');
 assert(Math.hypot(chosen.center[0]-target.xz[0],chosen.center[2]-target.xz[1])<.001,'The camera uses the selected source node');
 await step();const state=await snapshot();checkRender(state);
 assert.equal(state.evening,false);assert.equal(state.labelsVisible,false);
 assert.equal(await page.locator('#info').isVisible(),false,'The information card leaves the road markings unobstructed');
 assert(Math.hypot(state.camera.target[0]-chosen.center[0],state.camera.target[2]-chosen.center[2])<chosen.range*.1);
 const angle=elevation(state.camera);
 if(view==='top')assert(angle>=89,'The top frame shows line continuity without perspective compression');
 else assert(angle>=30&&angle<=80,'The oblique frame exposes paint floating above or sinking into sloping pavement');
 const projected=await page.evaluate(center=>{
  const q=window.__BAIKONUR_QA;
  return [[0,0],[4,0],[-4,0],[0,4],[0,-4]].map(([dx,dz])=>q.projectWorld(center[0]+dx,center[1],center[2]+dz));
 },chosen.center);
 assert(projected.every(p=>p&&p.x>350&&p.x<1530&&p.y>120&&p.y<870),'The join and its nearby line ends remain inside the unobstructed canvas');
 const name=target.name+'-'+view+'-day';
 await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,nodeId:target.nodeId,kind:target.kind,chosen,camera:state.camera,elevation:angle,projected,render:state.render});
 console.log('ROAD_MARKINGS_VIEW',name);return state;
}

try{
 const url=new URL(base);url.searchParams.delete('site');url.searchParams.delete('station');
 url.searchParams.set('view','south-interchange');url.searchParams.set('detail','all');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&
  document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 await step();assert.equal(await page.locator('#error').isVisible(),false);
 const initial=await snapshot();evidence.initial=initial;checkRender(initial);
 evidence.coverage=checkMarkings(initial);
 for(const target of targets){
  const top=await inspect(target,'top'),oblique=await inspect(target,'oblique');
  assert.notDeepEqual(top.camera.position,oblique.camera.position,'Top and oblique inspection use distinct cameras');
  assert.deepEqual(top.camera.target,oblique.camera.target,'Paired frames inspect the same physical join');
 }
 assert.equal(evidence.views.length,targets.length*2);
 const final=await snapshot();checkRender(final);evidence.final=final;
 assert.deepEqual(final.markings,initial.markings,'Inspection does not rebuild or change road paint');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);
 assert.deepEqual(evidence.failedResources,[]);assert.deepEqual(evidence.failedRequests,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('ROAD_MARKINGS_BROWSER_PASS',JSON.stringify({prefix,...evidence.coverage,targets:targets.length,views:evidence.views.length,errors:[]}));
}catch(error){
 console.error('ROAD_MARKINGS_BROWSER_FAILURE',error.message);
 const diagnostic=evidence.failureDiagnostics={views:[],errors:[]};
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:30000}).catch(failure=>diagnostic.errors.push({stage:'original-frame',message:failure.message}));
 try{
  diagnostic.state=await snapshot();
  const available=await page.evaluate(()=>typeof window.__BAIKONUR_QA?.inspectRoadMarkings==='function'&&document.getElementById('museumLoading')?.dataset.state==='ready');
  if(available)for(const target of [targets[0],targets[2]]){
   try{
    const chosen=await focus(target,'top');await step();
    const name=`failure-${target.name}-top`,path=`${out}/${prefix}-${name}.png`;
    await page.screenshot({path,timeout:15000});diagnostic.views.push({name,path,chosen});
   }catch(failure){diagnostic.errors.push({stage:target.name,message:failure.message});}
  }
 }catch(failure){diagnostic.errors.push({stage:'capture',message:failure.message});}
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2))
  .catch(failure=>console.error('ROAD_MARKINGS_DIAGNOSTIC_WRITE_FAILURE',failure.message));
 throw error;
}finally{await browser.close();}
