import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-interchange';
const revision='20261031-highway-lighting-v4';
const reference='https://sketchfab.com/3d-models/bridge-design-6c2d7e65a2e14600bde311a01e1baa27';
const views=['bridge','all','side','top'];
const evidence={base,prefix,revision,errors:[],shaderErrors:[],failedResources:[],failedRequests:[],rocketReadiness:[],views:[],mobile:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 ...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',error=>{evidence.errors.push(error.message);console.error('INTERCHANGE_RUNTIME_ERROR',error.message);});
page.on('console',message=>{
 if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(message.text()))evidence.shaderErrors.push(message.text());
});
page.on('response',response=>{
 if(response.status()>=400&&new URL(response.url()).origin===new URL(base).origin)evidence.failedResources.push({url:response.url(),status:response.status()});
});
page.on('requestfailed',request=>{
 if(new URL(request.url()).origin===new URL(base).origin)evidence.failedRequests.push({url:request.url(),error:request.failure()?.errorText,type:request.resourceType()});
});
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__INTERCHANGE_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__INTERCHANGE_FRAME());
function url(view){const u=new URL(base);u.searchParams.delete('site');u.searchParams.delete('station');u.searchParams.set('view','south-interchange');u.searchParams.set('detail',view);return u.href;}
async function ready(){
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 const models=await page.evaluate(async()=>{const q=window.__BAIKONUR_QA;return {results:await q.rockets.whenReady(),...q.rockets.stats()};});
 evidence.rocketReadiness.push(models);
 assert(models.results.every(Boolean),'The bridge view retains the existing loaded rocket exhibits: '+JSON.stringify(models.placements.filter(p=>p.status!=='ready').map(({key,status,error})=>({key,status,error}))));
 await step();assert.equal(await page.locator('#error').isVisible(),false);
}
async function snapshot(){
 return page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,s=q.stats(),bridge=s.transport.interchange.bridges.find(b=>String(b.osmWayId)==='172422627');
  return{bridge,camera:q.cameraState(),view:s.interchangeView,shadersValid:s.shadersValid,render:s.render,
   roadFeatures:s.transport.roadFeatureCount,railFeatures:s.transport.railFeatureCount,trainSource:s.transport.trainSource,trainWayCount:s.transport.trainWayCount};
 });
}
async function shot(name){
 await step();await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});
 const state=await snapshot();evidence.views.push({name,camera:state.camera,view:state.view,evening:state.bridge.evening});
 console.log('INTERCHANGE_VIEW',name);
}
async function assertCurrent(view){
 const state=await snapshot();assert.equal(state.view,view);
 assert.equal(await page.locator('#info').evaluate(el=>el.classList.contains('bridge-active')),true);
 assert.equal(await page.locator('#interchangeViews [aria-pressed="true"]').count(),1);
 assert.equal(await page.locator(`#interchangeViews [data-interchange-view="${view}"]`).getAttribute('aria-pressed'),'true');
 const [x,y,z]=state.camera.position,[tx,ty,tz]=state.camera.target;
 const elevation=Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI;
 assert(elevation>=29.99&&elevation<=90.01,'The view respects the museum camera angle');
 assert([...state.camera.position,...state.camera.target].every(Number.isFinite));
 assert(state.shadersValid&&state.render.drawCalls>0);
 return {...state,elevation};
}
async function mobileLayout(){
 const layout=await page.evaluate(()=>{
  const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  return{viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,
   card:box('#info'),dock:box('#timeDock'),header:box('#museumLeftStack'),
   buttons:[...document.querySelectorAll('#interchangeViews button')].map(button=>({view:button.dataset.interchangeView,...box(`[data-interchange-view="${button.dataset.interchangeView}"]`)}))};
 });
 assert(layout.documentWidth<=layout.viewport[0]+1,'Phone page has no horizontal overflow');
 assert(layout.card.x>=0&&layout.card.right<=layout.viewport[0]+1,'The card fits the phone width');
 assert(layout.card.bottom<=layout.dock.y-5,'The card clears the timeline');
 assert(layout.card.y>=layout.header.bottom+20,'The card leaves the map visible below the header');
 for(const button of layout.buttons){
  assert(button.x>=layout.card.x&&button.right<=layout.card.right+1,'Each view button fits the card width');
  assert(button.y>=layout.card.y&&button.bottom<=layout.card.bottom,'All four view buttons remain visible');
 }
 return layout;
}

try{
 await page.goto(url('bridge'),{waitUntil:'domcontentloaded',timeout:90000});await ready();
 const initial=await snapshot();evidence.initial=initial;
 assert.equal(initial.bridge.version,'reference-viaduct-v1');
 assert.equal(initial.bridge.sourceWayId,'172422627');
 assert.equal(initial.bridge.sourceTopologyPreserved,true);
 assert(initial.bridge.length>initial.bridge.sourceSpanLength*5,'The visual viaduct includes its approaches');
 assert(initial.bridge.triangles>1000&&initial.bridge.triangles<=32000,'The bridge, shared curved lamps and two smooth embankments stay within their batched geometry budget');
 assert(initial.bridge.drawCalls<=16);assert(initial.bridge.lamps>=12);
 assert.equal(initial.roadFeatures,3185);assert.equal(initial.railFeatures,543);
 assert.equal(initial.trainSource,'OpenStreetMap');assert.equal(initial.trainWayCount,7);
 assert(initial.bridge.protectedCorridors.some(c=>c.kind==='road'&&c.wayId==='1082534308'));
 assert(initial.bridge.protectedCorridors.some(c=>c.kind==='rail'&&c.wayId==='37545112'));
 assert.equal(initial.bridge.reference.author,'3DtechVN');assert.equal(initial.bridge.reference.license,'CC BY 4.0');
 assert.equal(await page.locator(`#interchangeCredit a[href="${reference}"]`).isVisible(),true);
 assert.equal(await page.locator('#interchangeCredit a[href="https://creativecommons.org/licenses/by/4.0/"]').isVisible(),true);
 assert.equal(await page.locator('#interchangeViews button').count(),4);
 assert.equal(await page.evaluate(()=>{try{JSON.stringify(window.__BAIKONUR_QA.stats());return true;}catch{return false;}}),true,'Statistics remain serializable');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);});
 for(const view of views){
  await page.locator(`[data-interchange-view="${view}"]`).click();await step();
  await assertCurrent(view);await shot(view+'-day');
 }
 const cameras=evidence.views.map(v=>JSON.stringify(v.camera.position));assert.equal(new Set(cameras).size,4,'The four views have distinct cameras');
 await page.locator('[data-interchange-view="bridge"]').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await step();
 const nightBridge=(await snapshot()).bridge;
 assert.equal(nightBridge.evening,true);
 assert.equal(nightBridge.visibleLampGlows,nightBridge.lamps,'Every bridge lamp is visibly enabled in the evening');
 assert.equal(nightBridge.lightSpill.enabled,true,'The bridge deck receives the lamp light');
 assert.equal(nightBridge.lightSpill.type,'conforming-deck-overlay');
 assert(nightBridge.lightSpill.drawCalls<=1,'The deck lighting stays batched');
 evidence.nightLighting={visibleLampGlows:nightBridge.visibleLampGlows,lightSpill:nightBridge.lightSpill};
 await shot('bridge-evening');
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 const dayBridge=(await snapshot()).bridge;
 assert.equal(dayBridge.evening,false);assert.equal(dayBridge.visibleLampGlows,0);assert.equal(dayBridge.lightSpill.enabled,false);

 // Select the rendered bridge, using the same physical hit test as a visitor.
 await page.locator('#close').click();await step();
 assert.equal(await page.locator('#info').isVisible(),false);
 const hit=await page.evaluate(()=>window.__BAIKONUR_QA.selection.pointForSite(-1));
 assert(hit,'A visible physical bridge surface is selectable');
 await page.mouse.click(hit.x,hit.y);await step();await assertCurrent('bridge');
 const picked=await page.evaluate(()=>window.__BAIKONUR_QA.selectionState());
 assert.equal(picked.lastSelected,-1);assert.match(picked.title,/Развязка/);evidence.selection={hit,state:picked};

 await page.setViewportSize({width:390,height:844});
 for(const view of ['bridge','side','top']){
  await page.locator(`[data-interchange-view="${view}"]`).click();await step();
  const layout=await mobileLayout();await assertCurrent(view);evidence.mobile.push({view,layout});
  if(view!=='side')await shot('mobile-'+view);
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-112'));await step();
 assert.equal(await page.locator('#info').evaluate(el=>el.classList.contains('bridge-active')),false);
 assert.equal(await page.locator('#interchangeViews').isVisible(),false);
 assert.equal(await page.locator('#interchangeCredit').isVisible(),false);
 assert.equal(await page.locator('#mik112Controls').isVisible(),true);
 assert.equal(await page.locator('#detailMore').isVisible(),true);
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-1'));await step();
 assert.equal(await page.locator('#rocketExhibitToggle').isVisible(),true);
 assert.equal(await page.locator('#detailMore').isVisible(),true);
 assert.equal(await page.locator('#interchangeViews').isVisible(),false);

 // A fresh portrait navigation must build the bridge and open its chosen view.
 await page.goto(url('side'),{waitUntil:'domcontentloaded',timeout:90000});await ready();
 await assertCurrent('side');evidence.freshMobile=await mobileLayout();await shot('mobile-deep-link');
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.failedResources,[]);
 const final=await snapshot();assert(final.shadersValid);evidence.final=final;
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('INTERCHANGE_BROWSER_PASS',JSON.stringify({prefix,triangles:final.bridge.triangles,draws:final.bridge.drawCalls,lamps:final.bridge.lamps,views:views.length,mobile:true,selection:true,errors:[]}));
}catch(error){
 console.error('INTERCHANGE_BROWSER_FAILURE',error.message);
 const diagnostic=evidence.failureDiagnostics={views:[],errors:[]};
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:90000}).catch(failure=>diagnostic.errors.push({stage:'original-frame',message:failure.message}));
 try{
  Object.assign(diagnostic,await page.evaluate(()=>{
   const q=window.__BAIKONUR_QA,result={qaAvailable:!!q,startupState:document.getElementById('museumLoading')?.dataset.state};
   if(!q)return result;
   try{
    const rockets=q.rockets.stats();
    result.rockets={version:rockets.version,loadedAssetCount:rockets.loadedAssetCount,
     placements:rockets.placements.map(({key,siteId,modelId,status,error,visible,effectiveVisible})=>({key,siteId,modelId,status,error,visible,effectiveVisible}))};
   }catch(failure){result.rocketStatsError=failure.message;}
   try{
    const bridge=q.stats().transport?.interchange?.bridges.find(b=>String(b.osmWayId)==='172422627');
    if(bridge){
     const {version,sourceWayId,sourceTopologyPreserved,center,length,sourceSpanLength,totalWidth,deckTop,clearance,
      asphaltColor,markings,embankments,lighting,lamps,drawCalls,triangles,bounds,evening}=bridge;
     result.bridge={version,sourceWayId,sourceTopologyPreserved,center,length,sourceSpanLength,totalWidth,deckTop,clearance,
      asphaltColor,markings,embankments,lighting,lamps,drawCalls,triangles,bounds,evening,approachProfileSamples:bridge.approachProfile?.length};
    }
   }catch(failure){result.bridgeStatsError=failure.message;}
   return result;
  }));
  if(diagnostic.qaAvailable&&diagnostic.startupState==='ready'){
   await page.setViewportSize({width:1600,height:1000});
   for(const view of ['all','side','top']){
    try{
     const state=await page.evaluate(view=>{
      const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);
      const selected=q.focusInterchange(view);document.getElementById('close')?.click();
      return {view:selected,camera:q.cameraState()};
     },view);
     await step();
     const name=`failure-${view}-day`,path=`${out}/${prefix}-${name}.png`;
     await page.screenshot({path,timeout:15000});
     diagnostic.views.push({name,path,...state,evening:false});
     console.log('INTERCHANGE_DIAGNOSTIC_VIEW',name);
    }catch(failure){diagnostic.errors.push({stage:`daylight-${view}`,message:failure.message});}
   }
  }
 }catch(failure){diagnostic.errors.push({stage:'capture',message:failure.message});}
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2))
  .catch(failure=>console.error('INTERCHANGE_DIAGNOSTIC_WRITE_FAILURE',failure.message));
 throw error;
}finally{await browser.close();}
