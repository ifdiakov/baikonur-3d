import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-highway-lighting';
const revision='20261031-highway-lighting-v2';
const factors={highway:1.5,cosmodrome:2};
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],views:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',error=>{evidence.errors.push(error.message);console.error('HIGHWAY_LIGHTING_RUNTIME_ERROR',error.message);});
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{
 if(response.status()>=400&&new URL(response.url()).origin===new URL(base).origin)evidence.failedResources.push({url:response.url(),status:response.status()});
});
// Render a real frame for each state without starving screenshots in SwiftShader.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__HIGHWAY_LIGHTING_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__HIGHWAY_LIGHTING_FRAME());
async function snapshot(){
 return page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats();
  return {revision:s.museumRevision,camera:q.cameraState(),render:s.render,shadersValid:s.shadersValid,
   evening:s.evening,highway:s.transport.roadSurface.highway,
   bridge:s.transport.interchange.bridges.find(b=>String(b.osmWayId)==='172422627')};
 });
}
function checkRender(state){
 assert.equal(state.revision,revision);
 assert.equal(state.shadersValid,true,'Both fixture families and asphalt shaders compile in the real renderer');
 assert(state.render.drawCalls>0&&state.render.triangles>0,'A nonempty museum frame is rendered');
 assert([...state.camera.target,...state.camera.position].every(Number.isFinite));
 const [x,y,z]=state.camera.position,[tx,ty,tz]=state.camera.target;
 assert(Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI>=29.99,'Inspection respects the museum minimum camera elevation');
}
function checkLightingMode(state,night,recordCount,poweredCount){
 const field=state.evening.roadFixtures;
 assert.equal(state.evening.evening,night);assert.equal(field.evening,night);
 assert.equal(field.hardwareVisible,true,'Physical road fixtures remain visible in both daylight and evening');
 assert.equal(field.physicalPoles,recordCount);assert.equal(field.count,recordCount);
 assert.equal(field.poweredLamps,poweredCount);
 assert(field.fixtureDrawCalls>0&&field.drawCalls<=10,'The two fixture families remain instanced');
 if(night)assert(field.emissiveIntensity>0&&field.poweredLamps>0,'Powered lamp lenses glow at night');
 else assert.equal(field.emissiveIntensity,0,'Daytime lamp lenses do not emit light');
 for(const [style,factor] of Object.entries(factors)){
  const actual=field.styles[style];assert(actual,'Renderer reports the '+style+' fixture family');
  assert.equal(actual.brightness,factor);assert.equal(actual.density,factor);assert.equal(actual.poolScale,factor);
  assert(Math.abs(actual.spacing-58/factor)<1e-9,'The '+style+' row uses the requested closer spacing');
  assert(Math.abs(actual.emissiveIntensity-(night?1.65*factor:0))<1e-9,'The '+style+' lenses use their own requested brightness');
 }
 assert.equal(state.bridge.evening,night);
 assert.equal(state.bridge.visibleLampGlows,night?state.bridge.lamps:0);
 assert.equal(state.bridge.lightSpill.enabled,night);
}
async function shot(name,extra={}){
 evidence.lastView=name;await step();
 const state=await snapshot();checkRender(state);
 await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,camera:state.camera,evening:state.evening.evening,render:state.render,...extra});
 console.log('HIGHWAY_LIGHTING_VIEW',name);return state;
}
function checkAllStations(records,stats){
 assert(records.length>0);assert.equal(stats.roadLights,records.length);
 const stations=new Map(),positions=new Set();
 for(const r of records){
  assert(['highway','cosmodrome'].includes(r.style));
  assert(r.stationId&&r.roadId);assert([r.height,...r.position,...r.center].every(Number.isFinite));
  assert.equal(r.color,r.style==='highway'?0xd8e8ff:0xffbf7b,'The light tint follows the road family');
  assert.equal(r.brightness,factors[r.style],'Every emitted light record carries its own brightness multiplier');
  assert(Math.abs(r.poolRadiusY-8.5*factors[r.style])<1e-9,'Each ground-light pool has the requested enlarged length');
  assert(Number.isFinite(r.poolRadiusX)&&r.poolRadiusX>0,'The enlarged light pool retains a usable width');
  assert(r.height>0);assert([-1,1].includes(r.side));
  const key=r.position.map(n=>n.toFixed(5)).join(':');
  assert(!positions.has(key),'A source-way boundary must not duplicate a pole');positions.add(key);
  const group=stations.get(r.stationId)||[];group.push(r);stations.set(r.stationId,group);
 }
 let highwayStations=0,cosmodromeStations=0,maxPairMidpointError=0;
 for(const [id,group] of stations){
  const style=group[0].style;assert(group.every(r=>r.style===style&&r.roadId===group[0].roadId));
  if(style==='highway'){
   highwayStations++;assert.equal(group.length,2,'Highway station '+id+' must have exactly two lamps');
   assert.deepEqual(group.map(r=>r.side).sort((a,b)=>a-b),[-1,1]);
   const [a,b]=group;assert.deepEqual(a.center,b.center);assert.equal(a.powered,b.powered,'A highway pair switches as one station');
   const error=Math.hypot((a.position[0]+b.position[0])/2-a.center[0],(a.position[2]+b.position[2])/2-a.center[2]);
   maxPairMidpointError=Math.max(maxPairMidpointError,error);
   assert(error<1e-6,'The two poles must face each other across the road');
  }else{
   cosmodromeStations++;assert.equal(group.length,1,'Cosmodrome station '+id+' must have exactly one lamp');
  }
 }
 assert(highwayStations>1&&cosmodromeStations>1,'Both complete road families are exercised');
 const layout=stats.roadLighting;
 assert.equal(layout.version,'road-lighting-modern-vintage-v2');
 assert.equal(layout.highway.fixture,'modern-led');assert.equal(layout.cosmodrome.fixture,'vintage-industrial');
 assert.equal(layout.highway.colorTemperature,4800);assert.equal(layout.cosmodrome.colorTemperature,2700);
 for(const [style,factor] of Object.entries(factors)){
  const actual=layout[style];assert.equal(actual.brightness,factor);assert.equal(actual.density,factor);assert.equal(actual.poolScale,factor);
  assert(Math.abs(actual.spacing-58/factor)<1e-9,'Requested density is applied along the '+style+' road family');
 }
 assert.equal(layout.highway.stations,highwayStations);assert.equal(layout.highway.lamps,highwayStations*2);
 assert.equal(layout.cosmodrome.stations,cosmodromeStations);assert.equal(layout.cosmodrome.lamps,cosmodromeStations);
 assert.deepEqual(layout.highway.incompletePairs,[]);assert.deepEqual(layout.cosmodrome.extraLamps,[]);
 assert.equal(stats.bankFilter.outsideBankCount,0,'The lighting still respects the river-bank exclusion');
 return {lamps:records.length,highwayStations,cosmodromeStations,maxPairMidpointError,
  poweredLamps:records.filter(r=>r.powered!==false).length};
}

try{
 const url=new URL(base);url.searchParams.delete('site');url.searchParams.delete('station');
 url.searchParams.set('view','south-interchange');url.searchParams.set('detail','all');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&
  document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 await page.evaluate(()=>window.__BAIKONUR_QA.rockets.whenReady());await step();
 assert.equal(await page.locator('#error').isVisible(),false);
 const records=await page.evaluate(()=>window.__BAIKONUR_QA.evening.roadLightRecords());
 const initial=await snapshot();checkRender(initial);evidence.initial=initial;
 const layout=checkAllStations(records,initial.evening);evidence.layout=layout;
 await writeFile(`${out}/${prefix}-stations.json`,JSON.stringify(records,null,2));
 assert.equal(initial.highway.version,'continuous-highway-v1');
 assert.equal(initial.highway.asphaltColor,'#42494c');assert.equal(initial.highway.sharedWithBridge,true);
 assert.equal(initial.highway.sourceTopologyPreserved,true);
 assert(initial.highway.edgeCount>0&&initial.highway.sampleCount>initial.highway.edgeCount);
 assert.equal(initial.bridge.asphaltColor,initial.highway.asphaltColor,'The highway and bridge use the same asphalt');
 assert.equal(initial.bridge.lighting.style,'modern-led');assert.equal(initial.bridge.lighting.color,'#d8e8ff');
 assert.equal(initial.bridge.lighting.colorTemperature,4800);
 assert.equal(initial.bridge.lighting.pairs*2,initial.bridge.lamps,'Bridge lights continue the opposite-pair layout');
 assert.equal(initial.bridge.lamps,24,'The bridge retains opposite pairs at 1.5 times the previous lamp density');

 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.setLabelsVisible(false);q.evening.setEvening(false);});
 await page.locator('#close').click();
 let state=await shot('interchange-day');checkLightingMode(state,false,layout.lamps,layout.poweredLamps);
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));
 state=await shot('interchange-evening');checkLightingMode(state,true,layout.lamps,layout.poweredLamps);

 // Close frames make the cantilever/LED blade and concrete/gooseneck/reflector
 // inspectable; run frames separately show pair versus single-row placement.
 for(const style of ['highway','cosmodrome']){
  const chosen=await page.evaluate(style=>window.__BAIKONUR_QA.inspectRoadLighting(style,'fixture'),style);
  assert(chosen&&chosen.style===style,'A powered '+style+' fixture is available inside the museum');
  const record=records.find(r=>r.stationId===chosen.stationId&&r.side===1);
  assert(record&&record.powered!==false);
  await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
  state=await shot(style+'-fixture-day',{chosen});checkLightingMode(state,false,layout.lamps,layout.poweredLamps);
  const projected=await page.evaluate(r=>window.__BAIKONUR_QA.projectWorld(r.position[0],r.position[1]+r.height*.55,r.position[2]),record);
  assert(projected&&projected.x>350&&projected.x<1500&&projected.y>120&&projected.y<850,'The selected fixture is framed in the unobstructed canvas');
  const dayCamera=state.camera;
  await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));
  state=await shot(style+'-fixture-evening',{chosen});checkLightingMode(state,true,layout.lamps,layout.poweredLamps);
  assert.deepEqual(state.camera,dayCamera,'Day/evening comparisons keep the same framing');
  const run=await page.evaluate(style=>window.__BAIKONUR_QA.inspectRoadLighting(style,'run'),style);
  assert(run&&run.style===style);await shot(style+'-run-evening',{chosen:run});
 }
 assert.deepEqual(await page.evaluate(()=>window.__BAIKONUR_QA.evening.roadLightRecords()),records,'Day/night and camera changes do not regenerate the layout');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 evidence.final=await snapshot();checkRender(evidence.final);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('HIGHWAY_LIGHTING_BROWSER_PASS',JSON.stringify({prefix,...layout,views:evidence.views.length,errors:[]}));
}catch(error){
 console.error('HIGHWAY_LIGHTING_BROWSER_FAILURE',error.message);
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
