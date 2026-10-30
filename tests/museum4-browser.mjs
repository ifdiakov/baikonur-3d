import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-museum4';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
const errors=[],shaderErrors=[],evidence={base,prefix};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
// Inspect deliberate render frames; avoid saturating software WebGL during
// screenshot encoding. Animation itself is exercised at exact phase boundaries.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__M4_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__M4_FRAME());
async function shot(name){await step();return page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});}
try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().museumRevision==='20261028-site31-trench-v1',null,{timeout:120000});
 await step();const s=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(s.sites,97);assert.equal(s.catalogEntries,98);assert.deepEqual(s.catalogAliases,[{id:'sector-east',aliasOf:'pad-43'}]);
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.equal(await page.locator('#flanksView,#eveningToggle,#lightingToggle,#trainFollow,#carsFocus,#ui a[href*="archive.html"]').count(),0,'Removed menu shortcuts must not remain in the DOM');
 assert.equal(await page.locator('#all,#top,#fly,#showLabels,[data-layer]').count(),0);
 for(const id of ['arrivalPanel','sitesAccordion','equipmentAccordion','cyclogramsAccordion','mythsAccordion','graveyardAccordion'])assert.equal(await page.locator('#'+id).count(),1);
 await shot('overview-menu');
 const runways=s.airports.map(a=>({key:a.key,length:a.length,width:a.width,worldLength:a.worldLength}));
 assert.equal(runways.find(a=>a.key==='krayniy').length,1550);assert.equal(runways.find(a=>a.key==='yubileiny').length,2250);
 assert.ok(Math.abs(runways.find(a=>a.key==='krayniy').worldLength-434)<1e-8);
 assert.ok(Math.abs(runways.find(a=>a.key==='yubileiny').worldLength-630)<1e-8);evidence.runways=runways;

 const expected=[['pad-110',[670,281],'energia'],['pad-250',[635,220],'tsenki'],['airfield',[539,962],'tsenki'],['pad-42',[1132,295],'baiterek'],['pad-43',[1145,278],'baiterek']];
 evidence.sites=[];
 for(const [id,map,logo]of expected){
  await page.evaluate(id=>window.__BAIKONUR_QA.focusSite(id),id);await step();
  const site=await page.evaluate(id=>window.__BAIKONUR_QA.siteState(id),id);assert.deepEqual(site.map,map);
  assert.ok(Math.abs(site.position[0]-(map[0]-650)*3.4)<1e-8);assert.ok(Math.abs(site.position[2]-(map[1]-522.5)*3.4)<1e-8);
  assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),logo);
  assert.ok((await page.locator('#title').textContent()).includes(id==='airfield'?'Крайний':id.slice(4)));
  if(id==='airfield')assert.ok(!(await page.locator('#description').textContent()).includes('Временный сектор'));
  evidence.sites.push(site);
 }
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.siteState('sector-east')),null);
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(false);window.__BAIKONUR_QA.focusSite('pad-31');});await step();
 const pad31=await page.evaluate(()=>window.__BAIKONUR_QA.stats().portalArchive.models.find(m=>m.id==='pad-31'));
 assert.equal(pad31.features.site31.version,'site31-satellite-trench-v3');assert.equal(pad31.features.site31.serviceMasts,2);assert.equal(pad31.features.site31.supportingArms,4);
 assert.equal(pad31.features.site31.serviceDecks,16);assert.ok(pad31.features.site31.pitFloorY<0);assert.ok(pad31.features.site31.launchPassage.openBelowDeck);assert.ok(pad31.features.primitiveCount>2000);
 const site31=pad31.features.site31,pad31State=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-31'));
 assert.equal(site31.orientationVerified,true);assert.equal(site31.orientationScope,'local-plan-from-satellite');
 assert.equal(site31.heightsVerified,false);assert.equal(site31.globalMapAnchorSurveyed,false);
 assert.equal(site31.satellite.imageryDate,'2025-08-09');assert.equal(site31.satellite.satellite,'WorldView-3');
 assert.equal(site31.satellite.heightsVerified,false);assert.equal(site31.satellite.globalMapAnchorSurveyed,false);
 assert.ok(site31.sources.includes(site31.satellite.sourceUrl));assert.ok(site31.sources.includes(site31.satellite.metadataUrl));
 assert.deepEqual(pad31State.map,[1017,228]);assert.deepEqual(pad31State.scale,[.28,.28,.28]);
 assert.ok(Math.abs(pad31State.rotationY-Math.atan2(245,210))<1e-8,'The rendered site follows the south-east railway vector in the satellite image');
 assert.ok(Math.abs(site31.yaw-pad31State.rotationY)<1e-8);
 assert.equal(site31.pit.shape,'polygon');assert.ok(site31.pit.polygon.length>=20);
 assert.ok(site31.pit.polygon.flat().every(Number.isFinite));
 assert.ok(site31.trench.sections.length>40&&site31.trench.floorTriangles>100&&site31.trench.bankTriangles>500);
 assert.ok(site31.trench.sections.every(s=>[s.z,s.left,s.right,s.floorLeft,s.floorRight,s.floorY].every(Number.isFinite)));
 const site31Cutout=s.terrainVoids.items.find(item=>item.name.startsWith('Пл. 31'));
 assert.ok(site31Cutout,'The rendered site has a terrain cutout');assert.deepEqual(site31Cutout.shape.polygon,site31.pit.polygon);
 await shot('site31-day');
 const site31Views=[];
 for(const view of ['top','duct','connections']){
  await page.evaluate(view=>window.__BAIKONUR_QA.inspectSite31(view),view);await shot('site31-'+view);
  const camera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
  assert.ok([...camera.position,...camera.target].every(Number.isFinite));
  if(view==='top')assert.ok(camera.position[1]-camera.target[1]>10*Math.hypot(camera.position[0]-camera.target[0],camera.position[2]-camera.target[2]),'Top inspection remains near vertical');
  site31Views.push({view,...camera});
 }
 assert.equal(new Set(site31Views.map(view=>view.position.map(n=>n.toFixed(2)).join(','))).size,3,'The three inspection views have distinct cameras');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.inspectSite31('duct');q.evening.setEvening(true);});await shot('site31-evening');
 evidence.site31={...pad31,state:pad31State,views:site31Views};
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.focusSite('pad-110');});await shot('site110-entry');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-42');q.setAltitude(95,'pad-42');});await shot('sites42-43-turn');

 const road=await page.evaluate(()=>window.__BAIKONUR_QA.stats().transport);
 assert.equal(road.roadRoutes,24);assert.equal(road.roadMarkings,'arc-length-paint-with-junction-gaps');
 assert.ok(road.roadSurface.clippedPavementSections>0);assert.ok(road.roadSurface.fillets>0);assert.ok(road.roadSurface.junctionCount>10);
 assert.ok(road.gatePorts.includes('pad-110')&&road.gatePorts.includes('pad-42'));evidence.roads=road.roadSurface;
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.traffic.stopFollowing();q.evening.setEvening(false);q.focusInterchange();});const roadFrame=await shot('roads-junctions-day');
 // These six bridge-dash centres were flat asphalt before the coverage fix.
 // Verify rendered paint, not merely that a marking mesh exists in the scene.
 const roadPaint=await page.evaluate(async encoded=>{
  const source=new Image();source.src='data:image/png;base64,'+encoded;await source.decode();
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const context=canvas.getContext('2d');context.drawImage(source,0,0);
  return [[815,462],[756,447],[700,432],[842,469],[906,485],[972,502]].map(([x,y])=>{
   const data=context.getImageData(x-1,y-1,3,3).data,values=[];
   for(let i=0;i<data.length;i+=4)values.push(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
   return {x,y,contrast:Math.max(...values)-Math.min(...values)};
  });
 },roadFrame.toString('base64'));
 assert.ok(roadPaint.filter(sample=>sample.contrast>8).length>=4,'Subpixel road dashes must remain visible: '+JSON.stringify(roadPaint));evidence.roadPaint=roadPaint;
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(true);q.showFlanks();});await step();
 const flanks=await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts);
 assert.equal(flanks.reliefCount,1);assert.equal(flanks.visibleReliefSurfaces,1);assert.deepEqual(flanks.reliefFlanks,['center']);await shot('saturn-flank-relief');
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleReliefSurfaces),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(180));await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleReliefSurfaces),0);evidence.flanks=flanks;

 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());
 assert.equal(initial.version,'krayniy-circuit-v4');assert.equal(initial.arrivalDuration,120);assert.equal(initial.cycleDuration,812);
 assert.equal(initial.timeline.filter(p=>p.phase==='hold'&&p.duration===20).length,2);
 assert.equal(initial.timeline.filter(p=>p.phase==='away'&&p.duration===60).length,2);
 const phases=[];
 for(const t of [0,120,148,158,168,180,230,242,266,346,405,406,526,554,564,574,586,636,648,672,752,811,812]){
  await page.evaluate(t=>window.__BAIKONUR_QA.arrival.seek(t),t);
  const a=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());
  assert.ok([...a.position,...a.velocity].every(Number.isFinite));
  if(a.segment==='hold'){assert.ok(Math.abs(a.runwayProgress-.8)<1e-8);assert.ok(a.velocity.every(v=>v===0));}
  if(a.segment==='away')assert.equal(a.visible,false);
  if(t===812){assert.equal(a.leg,1);assert.equal(a.elapsed,0);assert.equal(a.visible,true);}
  phases.push({t,leg:a.leg,phase:a.segment,visible:a.visible,progress:a.runwayProgress,direction:a.direction});
 }
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.seek(158);q.arrival.inspect('port');});await shot('alrosa-stop-at-four-fifths');evidence.flight=phases;
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-43'));await step();
 const mobileCard=await page.evaluate(()=>{const card=document.getElementById('info');return card.contains(document.elementFromPoint(100,50));});
 assert.ok(mobileCard,'The open site card must remain readable above the mobile menu');await shot('mobile-site43');
 await page.locator('#close').click();await shot('mobile-menu');
 assert.equal(await page.locator('#ui a[href*="archive.html"],#trainFollow,#flanksView').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,errors,shaderErrors,checkedAt:new Date().toISOString()},null,2));console.log('MUSEUM4_BROWSER_PASS',JSON.stringify({prefix,sites:s.sites,cycle:812,runways}));
}catch(e){await shot('failure').catch(()=>{});await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({message:e.message,errors,shaderErrors},null,2));throw e;}finally{await browser.close();}
