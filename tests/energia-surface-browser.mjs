import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Full approved museum, exact candidate files. The extra handle and stepped
// renderer exist only in this test; production receives no diagnostic code.
let base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',baseline=process.env.ENERGIA_BASELINE==='1';
const out='qa-energia-surface/'+prefix;await mkdir(out,{recursive:true});
const report={base,prefix,baseline,passed:false,
 environment:'Chromium/Linux SwiftShader, deterministic frames. Timings are software-renderer diagnostics, not physical-device FPS.',
 phases:[],screenshots:[],errors:[],failedRequests:[]};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(90000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|Uncaught|ReferenceError|TypeError/.test(message.text()))report.errors.push(message.text());});
page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__ENERGIA_SURFACE_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
await page.route('**/museum.html*',async route=>{
 const response=await route.fetch();const source=await response.text();
 assert.ok(source.includes('window.__BAIKONUR_QA={'),'Museum diagnostic injection anchor exists');
 const body=source.replace('window.__BAIKONUR_QA={',
  'window.__ENERGIA_SURFACE_TEST={THREE,renderer,scene,camera,ctl,ukssGroup};window.__BAIKONUR_QA={');
 await route.fulfill({response,body});
});
const state=()=>page.evaluate(()=>window.__BAIKONUR_QA.energia.stats());
const draw=()=>page.evaluate(()=>{
 const e=window.__ENERGIA_SURFACE_TEST,t=performance.now();
 e.renderer.render(e.scene,e.camera);e.renderer.getContext().finish();
 const renderMs=performance.now()-t;
 let visibleLights=0,shadowLights=0,shadowTextures=0;
 e.scene.traverseVisible(object=>{if(object.isLight){visibleLights++;if(object.castShadow)shadowLights++;if(object.shadow?.map)shadowTextures++;}});
 return {renderMs,drawCalls:e.renderer.info.render.calls,triangles:e.renderer.info.render.triangles,
  programs:e.renderer.info.programs.length,shadersValid:e.renderer.info.programs.every(p=>p.diagnostics?.runnable!==false),
  visibleLights,shadowLights,shadowTextures,shadowEnabled:e.renderer.shadowMap.enabled,
  memory:{...e.renderer.info.memory}};
});
async function shot(name){await page.screenshot({path:out+'/'+name+'.png',timeout:120000});report.screenshots.push(name+'.png');}
async function seek(seconds){
 const updateMs=await page.evaluate(time=>{const start=performance.now();window.__BAIKONUR_QA.energia.seek(time);return performance.now()-start;},seconds);
 const current=await state();assert.equal(current.time,seconds);assert.equal(current.active,true);
 const rendered=await draw();report.phases.push({time:seconds,updateMs,...rendered,effects:current.effects});
 assert.equal(rendered.shadersValid,true,'Fire, ground and smoke shaders compile');
 if(!baseline){
  const fx=current.effects;
  assert.equal(fx.shadowMapEnabled,false);assert.equal(fx.shadowReceiverCount,0);
  assert.equal(fx.shadowCasterCount,0);assert.equal(fx.shadowMapResolution,0);
  assert.equal(fx.dynamicShadowCount,0);assert.equal(fx.overlayGlowCount,0);
  assert.equal(fx.groundLighting.mode,'terrain-material-glow');
  assert.ok(fx.groundLighting.materials>0);assert.equal(fx.groundLighting.extraDrawCalls,0);
  assert.equal(fx.groundLightCount,2);assert.deepEqual(fx.groundLightRanges,[42,38]);
  assert.equal(fx.ductDepthTest,true);assert.equal(fx.ductDepthCompatible,true);
  assert.equal(fx.smokeSinglePass,true);assert.equal(fx.instancedSmokeCount,3335);
  assert.equal(fx.groundOcclusion.contourSource,'source-model');
  assert.equal(rendered.shadowEnabled,report.before.shadowEnabled,'Launch preserves renderer shadow policy');
  assert.equal(rendered.shadowTextures,report.before.shadowTextures,'No launch shadow texture allocation');
 }
 console.log('ENERGIA_SURFACE_PHASE '+JSON.stringify({time:seconds,updateMs:Math.round(updateMs),...rendered}));
 return current;
}
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  // Resolve Pages/custom-domain redirects before interception. Fulfilling a
  // fetched redirect response at the old origin would break relative assets.
  const destination=await fetch(new URL('museum.html',base));
  assert.ok(destination.ok,'Published museum entry point');
  report.requestedBase=base;base=new URL('./',destination.url).href;report.base=base;
  await destination.body?.cancel();
  report.publicHashes={};
  for(const file of ['index.html','museum.html','workshop.html','src/energia-polyus-launch.js','src/energia-rocket-exhaust.js','src/energia-ground-light.js','src/energia-ground-occlusion.js']){
   const response=await fetch(new URL(file+'?energia_surface='+Date.now(),base));assert.ok(response.ok,'Published file '+file);
   const actual=digest(Buffer.from(await response.arrayBuffer())),expected=digest(await readFile(file));
   assert.equal(actual,expected,'Published candidate bytes: '+file);report.publicHashes[file]=actual;
  }
 }
 await page.goto(new URL('museum.html?view=ukss&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA&&document.body.classList.contains('museum-ready'),null,{timeout:240000});
 await page.evaluate(()=>window.__ENERGIA_SURFACE_FRAME());
 await page.waitForFunction(()=>window.__ENERGIA_SURFACE_TEST.ukssGroup.userData.ukssModel?.status==='ready'
  &&window.__BAIKONUR_QA.rockets.stats().placements.find(placement=>placement.key==='ukss')?.status==='ready',null,{timeout:120000});
 report.before={...await draw(),...await page.evaluate(()=>({year:document.getElementById('year').value,
  evening:window.__BAIKONUR_QA.evening.stats().evening,camera:window.__BAIKONUR_QA.cameraState(),
  ukss:window.__ENERGIA_SURFACE_TEST.ukssGroup.userData.ukssModel.status}))};
 assert.equal(report.before.ukss,'ready','Test the actual imported UKSS, not a fallback');
 assert.equal(report.before.evening,true);
 // Lazy loading is intentional: the controller need not exist before this CTA.
 assert.equal(await page.locator('#energiaLaunchQuickStart').count(),0);
 await page.locator('#energiaLaunchStart').click();
 await page.waitForFunction(()=>window.__BAIKONUR_QA.energia.stats()?.active===true,null,{timeout:120000});
 if(!baseline)await page.waitForFunction(()=>window.__BAIKONUR_QA.energia.stats()?.effects?.warmup?.status==='ready',null,{timeout:90000});
 const opening=await state();assert.equal(opening.time,-90);assert.equal(opening.mode,'follow');
 report.warmup=opening.effects.warmup;
 assert.deepEqual(opening.initialCameraPose.position,report.before.camera.position,'Opening keeps chosen eye');
 for(const time of [-10,-8,-2,0,6]){
  const current=await seek(time);
  if(time===-8)await shot('center-ignition');
  if(time===0){
   assert.equal(current.flightRate,1);assert.equal(current.effects.engineNozzleGlowVisible,8);
   assert.ok(current.effects.engineCorePower>.9&&current.effects.engineBoosterPower>.9);
   if(!baseline)assert.ok(current.effects.groundLighting.power>0);
   await shot('liftoff');
  }
  if(time===6){assert.ok(current.effects.plume>0);assert.equal(current.effects.engineFlameAttached,true);await shot('ascent');}
 }
 if(!baseline){
  assert.equal(new Set(report.phases.map(phase=>phase.visibleLights)).size,1,'No light-count shader changes at engine ignition');
 }
 // Both banks and the actual gas outlet must remain readable from normal views.
 for(const [name,eye]of [['bank-left',[-180,165,180]],['bank-right',[230,180,-190]]]){
  await page.evaluate(eye=>{
   const e=window.__ENERGIA_SURFACE_TEST;window.__BAIKONUR_QA.energia.seek(0);
   e.camera.position.copy(e.ukssGroup.localToWorld(new e.THREE.Vector3(...eye)));
   e.ctl.target.copy(e.ukssGroup.localToWorld(new e.THREE.Vector3(35,0,0)));
   e.camera.lookAt(e.ctl.target);e.camera.updateMatrixWorld(true);
  },eye);
  await draw();await shot(name);
 }
 await page.evaluate(()=>{window.__BAIKONUR_QA.energia.seek(0);window.__BAIKONUR_QA.inspectUkss('trench');});
 assert.equal((await state()).active,true,'Changing the UKSS inspection angle keeps the launch active');
 await draw();await shot('trench');
 if(!baseline){
  // Render the REAL gas shader below each rim and above grade as a control.
  // This catches a missing logarithmic-depth shader chunk, not just a flag.
  report.depthProbes=await page.evaluate(()=>{
   const e=window.__ENERGIA_SURFACE_TEST,{THREE}=e,q=window.__BAIKONUR_QA;
   q.energia.seek(-90);
   let jet,depth;e.ukssGroup.traverse(object=>{
    if(object.name==='Газоход · огненный факел 1')jet=object;
    if(object.userData.museumComponent==='launch-ground-depth')depth=object;
   });
   if(!jet||!depth)throw new Error('Missing live jet or terrain depth mesh');
   const material=jet.material.clone();material.uniforms.uPower.value=1;
   material.uniforms.uTime.value=2;material.uniforms.uTint.value.set(0xff00ff);
   const marker=new THREE.Mesh(new THREE.SphereGeometry(1.15,16,8),material);
   marker.renderOrder=33;marker.frustumCulled=false;e.ukssGroup.add(marker);
   const gl=e.renderer.getContext(),width=e.renderer.domElement.width,height=e.renderer.domElement.height;
   const read=()=>{
    e.renderer.render(e.scene,e.camera);gl.finish();
    const pixels=new Uint8Array(64*64*4);
    gl.readPixels(Math.floor(width/2)-32,Math.floor(height/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
   };
   const probe=(label,x,y,z)=>{
    marker.position.set(x,y,z);const target=e.ukssGroup.localToWorld(new THREE.Vector3(x,y,z));
    e.camera.position.copy(e.ukssGroup.localToWorld(new THREE.Vector3(x,60,z+40)));
    e.camera.lookAt(target);e.camera.updateMatrixWorld(true);
    marker.visible=false;const without=read();marker.visible=true;const withMarker=read();
    let changedPixels=0,maxDelta=0;
    for(let i=0;i<withMarker.length;i+=4){let delta=0;for(let j=0;j<3;j++)delta=Math.max(delta,Math.abs(withMarker[i+j]-without[i+j]));maxDelta=Math.max(maxDelta,delta);if(delta>8)changedPixels++;}
    return {label,point:[x,y,z],changedPixels,maxDelta};
   };
   try{return {material:{depthTest:material.depthTest,logVertex:material.vertexShader.includes('logdepthbuf_vertex'),logFragment:material.fragmentShader.includes('logdepthbuf_fragment')},
    probes:[probe('north-below',195,-2,36),probe('north-above',195,4,36),
     probe('south-below',195,-2,-35),probe('south-above',195,4,-35),probe('open-channel',150,-5,0)]};}
   finally{marker.removeFromParent();marker.geometry.dispose();material.dispose();}
  });
  for(const probe of report.depthProbes.probes){
   if(probe.label.endsWith('below'))assert.ok(probe.changedPixels<=1,'Gas shader must be occluded below soil: '+JSON.stringify(probe));
   else assert.ok(probe.changedPixels>12,'Positive control/open trench remains visible: '+JSON.stringify(probe));
  }
 }
 // Replay reconstructs the same illumination, then departure leaves no pit fire.
 await page.evaluate(()=>window.__BAIKONUR_QA.energia.start());
 const replay=await seek(0);report.replay={mode:replay.mode,glows:replay.effects.engineNozzleGlowVisible};
 assert.equal(replay.mode,'follow');assert.equal(replay.effects.engineNozzleGlowVisible,8);
 const departed=await seek(30);assert.equal(departed.effects.padFireFade,0);assert.equal(departed.effects.padSmokeFade,0);
 if(!baseline)assert.equal(departed.effects.groundLighting.power,0);
 await page.locator('#energiaClose').click();await draw();
 report.restored=await page.evaluate(()=>({active:window.__BAIKONUR_QA.energia.stats().active,
  year:document.getElementById('year').value,evening:window.__BAIKONUR_QA.evening.stats().evening,
  shadowEnabled:window.__ENERGIA_SURFACE_TEST.renderer.shadowMap.enabled,fx:window.__BAIKONUR_QA.energia.stats().effects}));
 assert.equal(report.restored.active,false);assert.equal(report.restored.year,report.before.year);
 assert.equal(report.restored.evening,true);assert.equal(report.restored.shadowEnabled,report.before.shadowEnabled);
 if(!baseline)assert.equal(report.restored.fx.groundLighting.power,0);
 // Same retained scene at a narrow viewport, without reloading all assets.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__BAIKONUR_QA.energia.start());await seek(0);
 report.mobile=await page.locator('#energiaLaunchPanel').evaluate(element=>{const b=element.getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom};});
 assert.ok(report.mobile.left>=0&&report.mobile.right<=390.5&&report.mobile.bottom<=844.5);
 await shot('mobile-ignition');await page.evaluate(()=>window.__BAIKONUR_QA.energia.stop());
 assert.deepEqual(report.errors,[]);report.passed=true;
 console.log('ENERGIA_SURFACE_BROWSER_PASS '+JSON.stringify({prefix,baseline,phases:report.phases.length,depthProbes:report.depthProbes?.probes,shots:report.screenshots.length}));
}catch(error){report.error=error.stack;await page.screenshot({path:out+'/failure.png',timeout:60000}).catch(()=>{});throw error;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
