import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createMuseumGeography} from '../src/osm-geography.js';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-osm-release';
const revision='20261028-museum4-osm-live-v1';
await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const matches=JSON.parse(await readFile('data/osm/catalog-matches.json','utf8'));
const geography=createMuseumGeography({catalog,matches});
const airportFeatures=JSON.parse(await readFile('data/osm/airports.geojson','utf8')).features;
const expectedSites=new Map(geography.sites.map(s=>[s.id,s]));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const errors=[],shaderErrors=[],failedResources=[],evidence={base,prefix,revision};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
page.on('response',r=>{if(r.status()>=400&&/\.(?:js|geojson|json)(?:\?|$)/.test(r.url())&&new URL(r.url()).origin===new URL(base).origin)failedResources.push({url:r.url(),status:r.status()});});
// Deliberate frames keep software WebGL deterministic during image encoding.
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__OSM_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const step=()=>page.evaluate(()=>window.__OSM_FRAME());
const near=(a,b,tolerance=1e-5)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<tolerance);
async function shot(name){await step();return page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});}
function inside(p,ring){let value=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[j],b=ring[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])value=!value;
}return value;}

try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected,revision,{timeout:180000});
 await step();
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.equal(initial.sites,97);assert.equal(initial.catalogEntries,98);
 assert.equal(initial.geography.version,'osm-geography-v1');assert.equal(initial.geography.anchored,71);assert.equal(initial.geography.inferred,26);
 assert.equal(initial.transport.version,'osm-transport-v1');assert.equal(initial.transport.source,'OpenStreetMap');
 assert.equal(initial.transport.roadFeatureCount,3185);assert.equal(initial.transport.railFeatureCount,543);
 assert.ok(initial.transport.roadRoutes>2500&&initial.transport.railRoutes>400);
 assert.ok(initial.transport.junctionCount>100&&initial.transport.markingSegments>100);
 assert.ok(initial.transport.mergedMeshCount<=32,'OSM detail must be batched for a usable scene');
 assert.ok(initial.transport.vehicleRoutes.length>=4&&initial.transport.vehicleRoutes.every(r=>r.source==='OpenStreetMap'&&r.osmWayCount>5));
 assert.equal(initial.transport.trainSource,'OpenStreetMap');assert.ok(initial.transport.trainWayCount>5);
 assert.ok(initial.transport.facilityPorts.some(p=>p.id==='pad-110'&&p.roadGap<1e-5));
 assert.ok(initial.transport.facilityPorts.some(p=>p.id==='pad-31'&&p.roadGap<1e-5));
 assert.ok(initial.transport.facilityPorts.some(p=>p.id==='pad-42'&&p.roadGap<1e-5));
 assert.ok(initial.transport.gagarinRail.joinGap<1e-5);
 assert.ok(initial.transport.saturnAccess?.gateError<1e-5);
 assert.equal(await page.locator('#flanksView,#eveningToggle,#lightingToggle,#trainFollow,#carsFocus,#ui a[href*="archive.html"]').count(),0);
 for(const id of ['all','top','fly','arrivalPanel','showLabels'])assert.equal(await page.locator('#'+id).count(),1);
 assert.ok(await page.locator('a[href="https://www.openstreetmap.org/copyright"]').count()>0,'Visible OSM attribution is part of the live map');
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 const overview=await shot('overview-day');
 const pixels=await page.evaluate(async encoded=>{
  const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const d=ctx.getImageData(450,250,900,550).data,levels=[];for(let i=0;i<d.length;i+=4*23)levels.push((d[i]+d[i+1]+d[i+2])/3);
  const mean=levels.reduce((a,b)=>a+b,0)/levels.length;return {mean,variance:levels.reduce((a,b)=>a+(b-mean)**2,0)/levels.length};
 },overview.toString('base64'));
 assert.ok(pixels.variance>20&&pixels.mean>5,'The main WebGL view contains rendered terrain and objects');evidence.overviewPixels=pixels;
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('overview-evening');

 const sites=[];
 for(const [id,logo] of [['pad-110','energia'],['pad-250','tsenki'],['pad-42','baiterek'],['pad-43','baiterek'],['pad-75','tsenki'],['pad-1',null],['pad-31',null]]){
  await page.evaluate(id=>window.__BAIKONUR_QA.focusSite(id),id);await step();
  const actual=await page.evaluate(id=>window.__BAIKONUR_QA.siteState(id),id),expected=expectedSites.get(id);
  assert.ok(near(actual.map,[expected.x,expected.y]),id+' is placed from OSM');
  assert.ok(Math.abs(actual.position[0]-(actual.map[0]-650)*3.4)<1e-5&&Math.abs(actual.position[2]-(actual.map[1]-522.5)*3.4)<1e-5);
  if(logo)assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),logo);
  assert.ok((await page.locator('#title').textContent()).includes(id.slice(4)));sites.push(actual);
 }
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.siteState('sector-east')),null);
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('airfield'));await step();
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'tsenki');
 assert.ok((await page.locator('#title').textContent()).includes('Крайний'));
 assert.ok(!(await page.locator('#description').textContent()).includes('Временный сектор'));
 evidence.sites=sites;

 assert.deepEqual(initial.airports.map(a=>[a.key,a.length]).sort(),[['krayniy',1550],['yubileiny',2250]]);
 assert.equal(initial.arrival.version,'osm-two-airport-circuit-v5');assert.equal(initial.arrival.arrivalDuration,120);assert.equal(initial.arrival.cycleDuration,812);
 assert.deepEqual(initial.arrival.airports.map(a=>a.key),['yubileiny','krayniy']);
 for(const a of initial.arrival.airports){
  const f=airportFeatures.find(f=>f.properties.osmId===(a.key==='yubileiny'?24949215:37591623));
  const first=f.geometry.coordinates[0],last=f.geometry.coordinates.at(-1),mid=geography.project((first[0]+last[0])/2,(first[1]+last[1])/2);
  assert.ok(Math.abs(a.center[0]-(mid[0]-650)*3.4)<1e-4&&Math.abs(a.center[2]-(mid[1]-522.5)*3.4)<1e-4,a.key+' uses the OSM runway centre');
 }
 const flight=[];
 for(const t of [0,82,120,127,148,158,167.999,168,180,230,242,266,322,346,405.999,406,444,526,533,554,564,573.999,574,586,636,648,672,728,752,811.999,812]){
  await page.evaluate(t=>window.__BAIKONUR_QA.arrival.seek(t),t);
  const a=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats());
  assert.ok([...a.position,...a.velocity].every(Number.isFinite));
  assert.equal(a.airport,a.leg===1?'yubileiny':'krayniy');
  if(a.segment==='hold'){assert.ok(Math.abs(a.runwayProgress-.8)<1e-8);assert.ok(a.velocity.every(v=>v===0));}
  if(a.onGround)assert.ok(Math.abs(a.mainWheelBottom-a.runwayY)<1e-5,'Rendered main wheels touch the active runway');
  if(a.segment==='away')assert.equal(a.visible,false);
  if(t===812){assert.equal(a.elapsed,0);assert.equal(a.leg,1);assert.equal(a.visible,true);}
  flight.push({t,airport:a.airport,leg:a.leg,segment:a.segment,progress:a.runwayProgress,visible:a.visible});
 }
 assert.equal(initial.arrival.timeline.filter(p=>p.phase==='hold'&&p.duration===20).length,2);
 assert.equal(initial.arrival.timeline.filter(p=>p.phase==='away'&&p.duration===60).length,2);
 for(const [t,name]of [[158,'aircraft-yubileiny-stop'],[564,'aircraft-krayniy-stop']]){
  await page.evaluate(t=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.arrival.seek(t);q.arrival.inspect('port');},t);await shot(name);
 }
 evidence.flight=flight;

 await page.locator('#showLabels').uncheck();
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.traffic.stopFollowing();q.evening.setEvening(false);q.inspectSite31('duct');});
 const pad31=initial.portalArchive.models.find(m=>m.id==='pad-31');
 assert.equal(pad31.features.site31.version,'site31-satellite-trench-v3');
 assert.ok(pad31.features.primitiveCount>2000&&pad31.features.site31.pitFloorY<0);
 assert.equal(pad31.features.site31.supportingArms,4);assert.equal(pad31.features.site31.serviceMasts,2);assert.equal(pad31.features.site31.serviceDecks,16);
 assert.ok(pad31.features.site31.launchPassage.openBelowDeck);assert.ok(pad31.features.site31.trench.sections.length>40);
 const site31Cutout=initial.terrainVoids.items.find(i=>i.name.startsWith('Пл. 31'));assert.ok(site31Cutout);
 assert.deepEqual(site31Cutout.shape.polygon,pad31.features.site31.pit.polygon);
 await shot('site31-duct-day');
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectSite31('top'));await shot('site31-plan');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.inspectSite31('connections');q.evening.setEvening(true);});await shot('site31-connections-evening');
 evidence.site31=pad31.features.site31;

 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.seek(0);q.evening.setEvening(false);q.focusInterchange();});
 const before=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());
 await page.evaluate(()=>window.__BAIKONUR_QA.traffic.seek(20));
 const moved=await page.evaluate(()=>window.__BAIKONUR_QA.traffic.stats());
 assert.equal(moved.cars,20);assert.equal(moved.train.coachCount,4);
 assert.ok(moved.carStates.every((car,i)=>Math.hypot(...car.position.map((v,j)=>v-before.carStates[i].position[j]))>1),'Cars actually travel on OSM paths');
 for(const contact of moved.train.wheelContacts)assert.ok(near(contact.position,contact.railPosition,1e-5));
 assert.ok(moved.train.joins.every(j=>j.gap<1e-5));
 await shot('osm-road-junction');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.seek(200);q.traffic.focusTrain();});await shot('osm-train');
 evidence.traffic=moved;

 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.traffic.stopFollowing();q.showFlanks();q.evening.setEvening(false);});await step();
 const flank=await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts);
 assert.equal(flank.coordinateSystem,'osm-map');assert.equal(flank.visibleZones,3);assert.equal(flank.visibleBoundaries,2);assert.equal(flank.visibleOuterBoundaries,1);
 assert.equal(flank.outerBoundarySegments,10);assert.equal(flank.reference.version,'owner-outline-20261028');
 assert.equal(flank.reliefCount,1);assert.equal(flank.visibleReliefSurfaces,1);assert.equal(flank.reliefClipped,true);assert.deepEqual(flank.reliefFlanks,['center']);
 const saturn=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-23'));
 assert.ok(inside(saturn.map,flank.polygons[1]),'Saturn remains inside the central authored flank after registration');
 for(const id of ['city','airfield']){const site=await page.evaluate(id=>window.__BAIKONUR_QA.siteState(id),id);assert.ok(!flank.polygons.some(p=>inside(site.map,p)),id+' remains beyond the southern flank boundary');}
 assert.deepEqual(await page.locator('.flank-engineer').allTextContents(),['ЧЕЛОМЕЙ','КОРОЛЁВ','ЯНГЕЛЬ']);
 await shot('flanks-cards-day');
 await page.evaluate(()=>window.__BAIKONUR_QA.inspectFlankBoundaries());
 const hideCards=await page.addStyleTag({content:'.flank-label,.flank-portrait-credits{visibility:hidden!important}'});
 await shot('flanks-boundary-day');await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('flanks-boundary-evening');
 await hideCards.evaluate(e=>e.remove());evidence.flanks=flank;

 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-43'));await step();
 assert.ok(await page.evaluate(()=>document.getElementById('info').contains(document.elementFromPoint(100,50))));
 await shot('mobile-site43');await page.locator('#close').click();await page.locator('#all').click();await shot('mobile-map');
 assert.equal(await page.locator('#trainFollow,#carsFocus,#flanksView,#eveningToggle,#lightingToggle,#ui a[href*="archive.html"]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.deepEqual(failedResources,[]);
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 evidence.geography=initial.geography;evidence.transport=initial.transport;
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,errors,shaderErrors,failedResources,checkedAt:new Date().toISOString()},null,2));
 console.log('OSM_RELEASE_BROWSER_PASS',JSON.stringify({prefix,revision,sites:initial.sites,roadFeatures:3185,railFeatures:543,cycle:812,airports:['yubileiny','krayniy']}));
}catch(error){
 await shot('failure').catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({message:error.message,stack:error.stack,errors,shaderErrors,failedResources},null,2));throw error;
}finally{await browser.close();}
