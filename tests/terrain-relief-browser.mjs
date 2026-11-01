import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-terrain-relief';
const revision=process.env.BAIKONUR_EXPECTED_REVISION||null,origin=new URL(base).origin;
const evidence={base,prefix,revision,views:[],errors:[],shaderErrors:[],failedResources:[],failedRequests:[]};
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
// Deliberate frames still run the production animation/render loop. This keeps
// the large museum deterministic and leaves actual keyboard events available.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__RELIEF_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
 window.__RELIEF_KEYS=[];
 for(const type of ['keydown','keyup'])document.addEventListener(type,event=>{
  if(['w','d'].includes(event.key.toLowerCase()))window.__RELIEF_KEYS.push({type,key:event.key,trusted:event.isTrusted});
 },true);
});
const step=()=>page.evaluate(()=>window.__RELIEF_FRAME());
const near=(a,b,tolerance,message)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const elevation=c=>Math.atan2(c.position[1]-c.target[1],Math.hypot(c.position[0]-c.target[0],c.position[2]-c.target[2]))*180/Math.PI;
const state=()=>page.evaluate(()=>{
 const q=window.__BAIKONUR_QA,s=q.stats(),terrain=q.terrainRelief.stats();
 const source=typeof terrain.source==='object'?{name:terrain.source.name,zoom:terrain.source.zoom,tiles:terrain.source.tiles?.length}:terrain.source;
 return {revision:s.museumRevision,terrain:{...terrain,source},render:s.render,shadersValid:s.shadersValid,
  evening:s.evening.evening,camera:q.cameraState(),visibility:q.terrainVisibility(),
  reportedTerrainTriangles:s.terrainRelief?.triangles,following:q.arrival.stats().following};
});
function checkFrame(s){
 if(revision)assert.equal(s.revision,revision);
 assert.equal(s.terrain.version,'baikonur-dem-relief-v2');
 assert.equal(s.shadersValid,true,'The shared soil/void shaders compile on the relief');
 assert(s.render.drawCalls>0&&s.render.triangles>0,'The evidence comes from a rendered museum');
 assert([...s.camera.position,...s.camera.target].every(Number.isFinite));
 assert(s.terrain.triangles>10000&&s.terrain.triangles<=350000,'Regional relief has useful resolution within the geometry budget');
 assert.equal(s.reportedTerrainTriangles,s.terrain.triangles);
 assert(s.terrain.maxOffset>1&&s.terrain.maxOffset<80,'The real scene contains nonzero elevation at museum scale');
 assert(s.terrain.maxSlope<.15,'The real protected terrain has broad gentle slopes');
 assert.equal(s.terrain.flatChecks.violations,0);
 assert(s.terrain.flatChecks.protectedVertices>0&&s.terrain.flatChecks.gridMarginSafe);
 assert(s.terrain.protection.corridors>0&&s.terrain.protection.polygons>0,'Roads and area footprints are included in the scene protection');
 assert.equal(s.following,false);
}
async function shot(name){
 evidence.lastView=name;await step();const s=await state();checkFrame(s);
 await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 evidence.views.push({name,...s});console.log('TERRAIN_RELIEF_VIEW',name);return s;
}
async function checkChrome(){
 const chrome=await page.evaluate(()=>{
  const result={width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,items:[]};
  for(const id of ['museumLeftStack','timeDock','nextLaunchPanel']){
   const el=document.getElementById(id),rect=el.getBoundingClientRect(),css=getComputedStyle(el);
   result.items.push({id,x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom,
    opacity:Number(css.opacity),visible:css.display!=='none'&&css.visibility!=='hidden',inert:!!el.closest('[inert]')});
  }
  const attribution=document.getElementById('mapAttribution')?.getBoundingClientRect();
  result.attribution=attribution?{x:attribution.x,y:attribution.y,width:attribution.width,height:attribution.height,
   right:attribution.right,bottom:attribution.bottom}:null;
  return result;
 });
 assert(chrome.scrollWidth<=chrome.width+1,'Relief does not introduce horizontal page overflow');
 for(const el of chrome.items){
  assert(el.visible&&el.opacity>.95&&!el.inert,`${el.id} stays visible and interactive`);
  assert(el.width>100&&el.height>40,`${el.id} retains its visible layout`);
  assert(el.x>=-1&&el.y>=-1&&el.right<=chrome.width+1&&el.bottom<=chrome.height+1,`${el.id} stays inside the viewport`);
 }
 const attribution=chrome.attribution;
 assert(attribution&&attribution.width>0&&attribution.height>0,'Map attribution has a visible layout');
 assert(attribution.x>=-1&&attribution.y>=-1&&attribution.right<=chrome.width+1&&attribution.bottom<=chrome.height+1,
  'Map attribution stays completely inside the viewport');
 for(const dock of chrome.items.filter(el=>['timeDock','nextLaunchPanel'].includes(el.id))){
  const overlaps=attribution.x<dock.right&&attribution.right>dock.x&&attribution.y<dock.bottom&&attribution.bottom>dock.y;
  assert(!overlaps,`Map attribution must not overlap ${dock.id}`);
 }
 return chrome;
}
async function clearanceState(){
 return page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,camera=q.cameraState(),[x,,z]=camera.position;
  return {camera,sample:q.terrainRelief.sample(x,z),height:q.terrainRelief.heightAt(x,z)};
 });
}
function checkClearance(s,minimum){
 assert(s.sample.inBounds&&s.sample.offset>1,'Clearance is exercised over a raised ridge, not the flat background');
 near(s.camera.terrainHeight,s.height,1e-9,'Camera telemetry samples the actual relief triangle');
 near(s.camera.terrainClearance,s.camera.position[1]-s.height,1e-9,'Reported terrain clearance is geometric');
 assert(s.camera.position[1]>=s.height+minimum-1e-6,'Free navigation remains above the local terrain surface');
}

try{
 const url=new URL(base);url.searchParams.set('view','terrain');url.searchParams.set('detail','wide');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>{
  const q=window.__BAIKONUR_QA;
  return q?.terrainRelief&&typeof q.inspectTerrainRelief==='function'&&document.getElementById('museumLoading')?.dataset.state==='ready';
 },null,{timeout:180000});
 await page.waitForFunction(()=>['museumLeftStack','timeDock','nextLaunchPanel'].every(id=>{
  const el=document.getElementById(id);return el&&!el.closest('[inert]')&&Number(getComputedStyle(el).opacity)>.95;
 }));
 assert.equal(await page.locator('#error').isVisible(),false);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.inspectTerrainRelief('wide');});
 const wide=await shot('wide-day');evidence.chrome=await checkChrome();
 assert(elevation(wide.camera)>=29.99&&elevation(wide.camera)<70,'Relief is examined obliquely rather than hidden in a vertical map view');
 assert.equal(wide.visibility.visible.relief,true);

 // Reproduce the user's scale: continuous flank tint must span both the
 // raised terrain and the flat engineering corridors without a depth seam.
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.setLabelsVisible(true);q.showFlanks();});
 await shot('flanks-day');
 const flanks=await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts);
 assert(flanks.alpha>.9&&flanks.visibleZones===3,'All three flanks are visible at the regression camera');
 assert.equal(flanks.continuousReliefFill,true);
 assert.equal(flanks.flatFillMeshesVisible,0,'A flat tint layer cannot intersect the raised fill');
 evidence.flanks=flanks;
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));
 await shot('flanks-evening');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.inspectFlankBoundaries();});
 await shot('flank-boundaries-day');

 // Check real scene placements in addition to the independent geometry test.
 // Runway edge/approach light coordinates give us probes along the complete
 // protected airport strips, without duplicating their mask implementation.
 const protectedProbes=await page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,result=[];
  for(const id of ['pad-1','pad-31','pad-45','pad-110','pad-250','pad-41','airfield','pad-251']){
   const site=q.siteState(id);if(!site)throw new Error('Missing scene footprint: '+id);
   const [x,,z]=site.position;result.push({kind:'site',id,x,z,...q.terrainRelief.sample(x,z)});
  }
  for(const airport of ['krayniy','yubileiny'])for(const [index,light]of q.evening.airportLightPositions(airport).entries()){
   const [x,,z]=light.position;result.push({kind:'runway-light',id:airport+'-'+index,x,z,...q.terrainRelief.sample(x,z)});
  }
  const river=q.inspectRiver('islands'),[x,,z]=river.target;
  result.push({kind:'river',id:'islands',x,z,...q.terrainRelief.sample(x,z)});
  return result;
 });
 assert(protectedProbes.filter(p=>p.kind==='runway-light').length>150,'Both airport strips are sampled through their rendered light layout');
 for(const p of protectedProbes)assert(p.offset<1e-6,`Relief must stay below the existing ${p.kind} ${p.id}: ${p.offset}`);
 evidence.protectedProbes=protectedProbes;

 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.setLabelsVisible(false);q.inspectTerrainRelief('ridge');});
 const ridge=await shot('ridge-day');
 assert(elevation(ridge.camera)>=29.99&&elevation(ridge.camera)<70);
 // Visibility telemetry alone cannot prove that a new mesh is rendered. Hide
 // only the relief in the same view and measure the actual triangle reduction.
 await page.evaluate(()=>window.__BAIKONUR_QA.terrainVisibility({relief:false}));await step();
 const hidden=await state();assert.equal(hidden.visibility.visible.relief,false);
 const removedTriangles=ridge.render.triangles-hidden.render.triangles;
 assert(removedTriangles>=ridge.terrain.triangles*.9,'The new regional mesh contributes real rendered terrain triangles');
 for(const id of ['main','regional','intermediate','satellite'])assert.equal(hidden.visibility.visible[id],ridge.visibility.visible[id]);
 evidence.visibilityCheck={visibleTriangles:ridge.render.triangles,hiddenTriangles:hidden.render.triangles,removedTriangles};
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.terrainVisibility({relief:true});q.evening.setEvening(true);});
 const evening=await shot('ridge-evening');assert.equal(evening.evening,true);assert.equal(evening.visibility.visible.relief,true);

 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 const attempt=await page.evaluate(()=>window.__BAIKONUR_QA.inspectTerrainRelief('clearance'));
 assert(attempt.attemptedClearance<attempt.minimumClearance,'The fixture deliberately attempts to enter the protected eye clearance');
 near(attempt.minimumClearance,.98,1e-9,'Camera clearance retains the approved seven-metre museum allowance');
 const corrected=await clearanceState();checkClearance(corrected,attempt.minimumClearance);
 near(corrected.camera.terrainClearance,attempt.minimumClearance,1e-5,'The production constraint lifts the eye to the local surface allowance');
 evidence.clearance={attempt,corrected,movements:[]};
 for(const key of ['d','w']){
  const before=await clearanceState();await page.keyboard.down(key);await page.waitForTimeout(80);await step();await page.keyboard.up(key);
  const after=await clearanceState();checkClearance(after,attempt.minimumClearance);
  const moved=Math.hypot(after.camera.position[0]-before.camera.position[0],after.camera.position[2]-before.camera.position[2]);
  assert(moved>.1,'Real WASD navigation moves across the ridge');
  evidence.clearance.movements.push({key,moved,before,after});
 }
 evidence.keyboardEvents=await page.evaluate(()=>window.__RELIEF_KEYS);
 assert.equal(evidence.keyboardEvents.length,4);assert(evidence.keyboardEvents.every(event=>event.trusted));
 await shot('ridge-camera-clearance');await checkChrome();
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);
 assert.deepEqual(evidence.failedResources,[]);assert.deepEqual(evidence.failedRequests,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('TERRAIN_RELIEF_BROWSER_PASS',JSON.stringify({prefix,views:evidence.views.length,
  vertices:wide.terrain.vertices,triangles:wide.terrain.triangles,maxOffset:wide.terrain.maxOffset,maxSlope:wide.terrain.maxSlope,
  protectedProbes:protectedProbes.length,minimumCameraClearance:attempt.minimumClearance,errors:[]}));
}catch(error){
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:30000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));
 throw error;
}finally{await browser.close();}
