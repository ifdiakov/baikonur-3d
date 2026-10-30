import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createNorthBankMask} from '../src/river-bank.js';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-osm-release';
const revision='20261030-mzk-sdi-v1';
await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const matches=JSON.parse(await readFile('data/osm/catalog-matches.json','utf8'));
const geography=createMuseumGeography({catalog,matches});
const airportFeatures=JSON.parse(await readFile('data/osm/airports.geojson','utf8')).features;
const river=JSON.parse(await readFile('data/osm/river.geojson','utf8')).features.find(f=>f.geometry.type==='LineString');
const northBank=createNorthBankMask(river.geometry.coordinates.map(c=>{const [x,y]=geography.project(c);return [(x-650)*3.4,(y-522.5)*3.4];}));
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
async function hierarchy(level,{details=false}={}){
 const state=await page.evaluate(()=>window.__BAIKONUR_QA.stats()),f=state.flankDistricts;
 const flankCards=await page.locator('.flank-label:visible').count();
 const siteLabels=await page.locator('.site-label:visible').count();
 const detailCards=await page.locator('.detail-card:visible').count();
 assert.equal(state.mapHierarchy.level,level);
 assert.equal(f.version,'contours-three-level-v5');
 if(level==='overview'){
  assert.ok(state.mapHierarchy.overviewAlpha>.99&&f.overviewAlpha>.99);
  assert.equal(f.visibleOverviewBoundary,1);assert.equal(f.visibleOverviewFill,1);
  assert.ok(f.overviewFillOpacity>0&&f.overviewFillOpacity<=.035,'The initial contour fill remains almost transparent');
  assert.ok(f.overviewBoundaryOpacity>=.2&&f.overviewBoundaryOpacity<=.3);
  assert.equal(f.visibleZones,0);assert.equal(f.visibleBoundaries,0);assert.equal(f.visibleReliefSurfaces,0);
  assert.equal(flankCards,0);assert.equal(siteLabels,0);assert.equal(detailCards,0);
 }else if(level==='flanks'){
  assert.ok(state.mapHierarchy.flankAlpha>.9);assert.equal(f.visibleOverviewBoundary,0);assert.equal(f.visibleOverviewFill,0);
  assert.equal(f.visibleZones,3);assert.equal(flankCards,3);assert.equal(siteLabels,0);assert.equal(detailCards,0);
 }else{
  assert.equal(f.visibleOverviewBoundary,0);assert.equal(f.visibleOverviewFill,0);assert.equal(f.visibleZones,0);assert.equal(flankCards,0);
  assert.ok(details?detailCards>0:siteLabels>0,details?'Nearby objects expose detailed cards':'Sites and stations appear at the object level');
 }
 return {level,altitude:state.mapHierarchy.altitude,overviewAlpha:f.overviewAlpha,flankAlpha:f.alpha,flankCards,siteLabels,detailCards};
}

try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected,revision,{timeout:180000});
 await step();
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.equal(initial.sites,98);assert.equal(initial.catalogEntries,99);
 evidence.hierarchy=[await hierarchy('overview')];
 assert.equal(initial.geography.version,'osm-geography-v1');assert.equal(initial.geography.anchored,72);assert.equal(initial.geography.inferred,26);
 assert.equal(initial.transport.version,'osm-transport-v1');assert.equal(initial.transport.source,'OpenStreetMap');
 assert.equal(initial.transport.roadFeatureCount,3185);assert.equal(initial.transport.railFeatureCount,543);
 assert.ok(initial.transport.roadRoutes>2500&&initial.transport.railRoutes>400);
 assert.ok(initial.transport.renderedRoadWays>0&&initial.transport.renderedRoadWays<initial.transport.roadRoutes,'Settlement filtering changes the display while retaining the full source graph');
 assert.equal(initial.transport.branchSimplification.version,'terminal-branches-v2');
 assert.ok(initial.transport.branchSimplification.road.branchCount>270);
 assert.ok(initial.transport.branchSimplification.rail.branchCount>75);
 assert.equal(initial.transport.facilityPorts.length,40);
 assert.equal(initial.transport.facilityRailPorts.length,6);
 assert.equal(initial.transport.cityRoadSimplification.sourceBoundary,'way/39209179');
 assert.ok(initial.transport.cityRoadSimplification.hiddenWays>500);
 const settlementFilters=new Map(initial.transport.settlementRoadSimplification.map(s=>[s.id,s]));
 assert.equal(settlementFilters.size,3);
 for(const [id,boundary,profile]of [['baikonur','way/39209179','main-streets-only'],['akai','relation/16783113','minimum-through-routes'],['tyuratam','relation/15005695','minimum-through-routes']]){
  const filter=settlementFilters.get(id);assert.ok(filter,id+' has an active geographic road filter');
  assert.equal(filter.sourceBoundary,boundary);assert.equal(filter.minimalProfile,profile);
  assert.equal(filter.sourceWayCount,filter.renderedWayCount+filter.hiddenWays);
  assert.equal(new Set(filter.keptWayIds).size,filter.renderedWayCount);
  assert.ok(filter.renderedWayCount>0&&filter.hiddenWays>filter.renderedWayCount,id+' keeps a sparse main-road network');
  for(const wayId of filter.preservedTrafficWayIds)assert.ok(filter.keptWayIds.includes(wayId),id+' retains every moving-traffic road');
 }
 const roadStyle=initial.transport.roadStyle,roadColor=roadStyle.asphaltColor.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)?.slice(1).map(s=>parseInt(s,16));
 assert.ok(roadColor?.every(c=>c>=160)&&Math.max(...roadColor)-Math.min(...roadColor)<=12,'Roads use a light, neutral gray');
 assert.ok(roadStyle.widths.primary<=3.6&&roadStyle.widths.residential<=2&&roadStyle.widths.service<=1.6,'Roads are visibly narrower at every scale');
 assert.ok(roadStyle.paintWidth>0&&roadStyle.paintWidth<=.12);
 assert.ok(initial.transport.junctionCount>100&&initial.transport.markingSegments>100);
 assert.ok(initial.transport.mergedMeshCount<=32,'OSM detail must be batched for a usable scene');
 assert.ok(initial.transport.vehicleRoutes.length>=4&&initial.transport.vehicleRoutes.every(r=>r.source==='OpenStreetMap'&&r.osmWayCount>5));
 assert.equal(initial.transport.trainSource,'OpenStreetMap');assert.ok(initial.transport.trainWayCount>5);
 assert.ok(initial.transport.facilityPorts.some(p=>p.id==='pad-110'&&p.roadGap<1e-5));
 assert.ok(initial.transport.facilityPorts.some(p=>p.id==='pad-31'&&p.roadGap<1e-5));
 assert.ok(initial.transport.facilityPorts.some(p=>p.id==='pad-42'&&p.roadGap<1e-5));
 assert.ok(initial.transport.gagarinRail.joinGap<1e-5);
 assert.ok(initial.transport.saturnAccess?.gateError<1e-5);
 assert.equal(initial.evening.version,'evening-east-cutoff-v3');assert.equal(initial.evening.bankFilter.rule,'north-of-syr-darya-v1');
 assert.equal(initial.evening.bankFilter.outsideBankCount,0);assert.ok(initial.evening.bankFilter.remaining>0);assert.ok(initial.evening.bankFilter.excludedByBank.road>0);
 const lightPositions=await page.evaluate(()=>({scene:window.__BAIKONUR_QA.evening.lightPositions(),editor:window.__BAIKONUR_QA.lighting.visibleLightPositions()}));
 assert.equal(lightPositions.scene.length,initial.evening.bankFilter.remaining);
 assert.equal(lightPositions.editor.length,initial.lighting.visibleCount);
 assert.equal(initial.lighting.visibleCount+initial.lighting.hiddenByBank,initial.lighting.count,'Filtering retained saved lamp positions');
 for(const p of [...lightPositions.scene,...lightPositions.editor])assert.ok(p.every(Number.isFinite)&&northBank.contains(p[0],p[2]),'Every rendered stationary light stays on the cosmodrome side of the river');
 evidence.lighting={bankFilter:initial.evening.bankFilter,editor:initial.lighting,checkedPositions:lightPositions.scene.length+lightPositions.editor.length};
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
 await page.evaluate(()=>window.__BAIKONUR_QA.showFlanks());await step();evidence.hierarchy.push(await hierarchy('flanks'));
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(460,'pad-31'));await step();evidence.hierarchy.push(await hierarchy('sites'));await shot('site-station-level');
 await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(180,'pad-31'));await step();evidence.hierarchy.push(await hierarchy('sites',{details:true}));

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
 const cityModel=initial.portalArchive.models.find(m=>m.id==='city');
 assert.ok(cityModel&&cityModel.features.primitiveCount<250,'The city uses a compact set of representative buildings');
 assert.equal(cityModel.features.features['photo-city-residential'],25);assert.equal(cityModel.features.features['photo-city-civic'],5);
 assert.equal(cityModel.features.features['photo-city-street']??0,0,'The simplified city does not add a second dense street grid');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('city');q.evening.setEvening(false);});await shot('city-simplified-day');
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('airfield'));await step();
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'tsenki');
 assert.ok((await page.locator('#title').textContent()).includes('Крайний'));
 assert.ok(!(await page.locator('#description').textContent()).includes('Временный сектор'));
 evidence.sites=sites;

 // The whole Saturn exhibit, its graded access and lamp bases must follow the
 // requested display adjustment while the geographic source remains intact.
 const shiftedSaturn=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-23'));
 const saturnSource=geography.project(matches.matches.find(m=>m.siteId==='pad-23').representativeLonLat);
 assert.ok(near(shiftedSaturn.map,[saturnSource[0]+20,saturnSource[1]]));
 assert.ok(near(shiftedSaturn.position,[(shiftedSaturn.map[0]-650)*3.4,17.45,(shiftedSaturn.map[1]-522.5)*3.4]));
 assert.deepEqual(shiftedSaturn.geoSource.displayOffset,[20,0]);
 assert.deepEqual(shiftedSaturn.scale,[.525,.525,.525]);
 assert.equal(initial.evening.saturnLights.length,4);
 assert.ok(initial.evening.saturnRoadLights.length>0);
 for(const lamp of [...initial.evening.saturnLights,...initial.evening.saturnRoadLights])
  assert.ok(lamp.y-lamp.terrainY>0&&lamp.y-lamp.terrainY<.06,'Saturn lamp base follows the compact hillside');
 assert.equal(initial.saturn.access.preservedVerticalRaise,20);
 assert.ok(near(initial.transport.saturnAccess.gateWorld,[shiftedSaturn.position[0]-96*.525,17.45+7.59*.525,shiftedSaturn.position[2]-79*.525]));
 await page.locator('#close').click();
 await page.locator('#showLabels').uncheck();
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.inspectSaturnHill();q.evening.setEvening(false);});
 await shot('saturn-hill-day');
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('saturn-hill-evening');
 await page.locator('#showLabels').check();
 evidence.saturn={placement:shiftedSaturn,access:initial.transport.saturnAccess,lights:initial.evening.saturnLights};

 // Exercise the public MZK/SDI card and its real view buttons. Geometry tests
 // inspect the source contours; this checks that the live exhibit exposes
 // the same model, source anchors and three distinct camera views.
 const mzkModel=initial.portalArchive.models.find(m=>m.id==='pad-112a');
 assert.ok(mzkModel?.features.mzkSdi,'The rebuilt MZK/SDI exhibit is present in the live archive');
 const mzkSdi=mzkModel.features.mzkSdi;
 assert.equal(mzkSdi.version,'mzk-sdi-photo-v3');
 assert.equal(mzkSdi.layoutBasis,'OSM-component-centres-and-axes');
 assert.deepEqual(mzkSdi.sources,['way/172704643','way/172704656']);
 assert.equal(mzkSdi.mzk.sourceWay,'way/172704643');
 assert.equal(mzkModel.features.features['mzk-main-volume'],1);
 assert.equal(mzkModel.features.features['sdi-closed-side-wall'],2);
 assert.equal(mzkModel.features.features['sdi-closed-rear-wall'],1);
 assert.equal(mzkSdi.sdi.closedWallCount,3);
 assert.equal(mzkSdi.mzk.roof,'flat');assert.equal(mzkSdi.sdi.state,'closed-sliding-gate');
 assert.deepEqual(await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.stats()),mzkSdi);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-112a');q.evening.setEvening(false);});
 await step();
 const mzkPlacement=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-112a')),expectedMzk=expectedSites.get('pad-112a');
 assert.ok(near(mzkPlacement.map,[expectedMzk.x,expectedMzk.y]));
 assert.deepEqual(mzkPlacement.geoSource.sourceLonLat,expectedMzk.geoSource.sourceLonLat);
 assert.deepEqual(mzkPlacement.geoSource.refs.map(r=>r.id).sort((a,b)=>a-b),[172704643,172704656]);
 assert.match(await page.locator('#title').textContent(),/112А.*МЗК.*СДИ/);
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'infracos');
 assert.equal(await page.locator('#mzkViews').isVisible(),true);
 assert.deepEqual(await page.locator('#mzkViews button').allTextContents(),['Весь комплекс','МЗК','СДИ']);
 await page.locator('#showLabels').uncheck();
 const mzkCameras={};
 for(const [label,view,name]of [['Весь комплекс','all','mzk-sdi-all'],['МЗК','mzk','mzk-facade'],['СДИ','sdi','sdi-front']]){
  await page.locator('#mzkViews').getByRole('button',{name:label,exact:true}).click();
  await shot(name);
  const camera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
  assert.ok([...camera.position,...camera.target].every(Number.isFinite),'MZK/SDI camera coordinates remain finite');
  for(const previous of Object.values(mzkCameras))
   assert.ok(Math.hypot(...camera.position.map((v,i)=>v-previous.position[i]))>1&&Math.hypot(...camera.target.map((v,i)=>v-previous.target[i]))>1,'Each MZK/SDI button selects a distinct building view');
  mzkCameras[view]=camera;
 }
 evidence.mzkSdi={model:mzkSdi,placement:mzkPlacement,cameras:mzkCameras};
 await page.locator('#close').click();await page.locator('#showLabels').check();
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));

 assert.deepEqual(initial.airports.map(a=>[a.key,a.length]).sort(),[['krayniy',1550],['yubileiny',2250]]);
 assert.equal(initial.arrival.version,'krayniy-osm-circuit-v6');assert.equal(initial.arrival.arrivalDuration,120);assert.equal(initial.arrival.cycleDuration,812);
 assert.deepEqual(initial.arrival.airports.map(a=>a.key),['krayniy','krayniy']);
 assert.ok((await page.locator('#arrivalPanel .arrival-title').textContent()).includes('КРАЙНИЙ'));
 assert.ok(!(await page.locator('#arrivalPanel .arrival-title').textContent()).includes('ЮБИЛЕЙНЫЙ'));
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
  assert.equal(a.airport,'krayniy');
  if(a.segment==='hold'){assert.ok(Math.abs(a.runwayProgress-.8)<1e-8);assert.ok(a.velocity.every(v=>v===0));}
  if(a.onGround)assert.ok(Math.abs(a.mainWheelBottom-a.runwayY)<1e-5,'Rendered main wheels touch the active runway');
  if(a.segment==='away')assert.equal(a.visible,false);
  if(t===812){assert.equal(a.elapsed,0);assert.equal(a.leg,1);assert.equal(a.visible,true);}
  flight.push({t,airport:a.airport,leg:a.leg,segment:a.segment,progress:a.runwayProgress,visible:a.visible});
 }
 assert.equal(initial.arrival.timeline.filter(p=>p.phase==='hold'&&p.duration===20).length,2);
 assert.equal(initial.arrival.timeline.filter(p=>p.phase==='away'&&p.duration===60).length,2);
 for(const [t,name]of [[158,'aircraft-krayniy-first-stop'],[564,'aircraft-krayniy-second-stop']]){
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
 assert.equal(flank.reference.version,'owner-osm-outline-20261028-v2');assert.equal(flank.visibleOverviewBoundary,0);
 assert.equal(flank.outerBoundarySegments,16);assert.deepEqual(flank.polygons.map(p=>p.length),[4,6,10]);
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
 await page.locator('#all').click();await step();evidence.hierarchy.push({mobile:true,...await hierarchy('overview')});
 const mobileMenu=page.locator('#mobileMenuToggle');
 assert.equal(await mobileMenu.isVisible(),true);assert.equal(await mobileMenu.getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#showLabels').isVisible(),false);
 await mobileMenu.click();assert.equal(await mobileMenu.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#showLabels').isVisible(),true);
 await page.locator('#showLabels').uncheck();await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewBoundary),0);
 await page.locator('#showLabels').check();await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewBoundary),1);
 await mobileMenu.click();await step();assert.equal(await mobileMenu.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#showLabels').isVisible(),false);
 assert.equal(await page.locator('#hero').isVisible(),false);
 const mobileMap=await page.evaluate(()=>{
  const q=window.__BAIKONUR_QA,ui=document.getElementById('ui').getBoundingClientRect(),dock=document.getElementById('timeDock').getBoundingClientRect(),top=ui.bottom+12,bottom=dock.top-12;
  const at=document.elementFromPoint(innerWidth/2,(top+bottom)/2),outline=q.stats().flankDistricts.outline,visibleEdges=new Set();let visibleSamples=0;
  outline.forEach((a,i)=>{const b=outline[(i+1)%outline.length];for(let k=0;k<=20;k++){
   const t=k/20,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,p=q.projectWorld((x-650)*3.4,-2.4,(y-522.5)*3.4);
   if(p&&p.x>=9&&p.x<=innerWidth-9&&p.y>=top&&p.y<=bottom){visibleSamples++;visibleEdges.add(i);}
  }});
  return {uiBottom:ui.bottom,freeMapHeight:bottom-top,canvasAccessible:at===document.querySelector('#view canvas'),visibleSamples,visibleEdges:visibleEdges.size};
 });
 assert.ok(mobileMap.uiBottom<220&&mobileMap.freeMapHeight>350,'The compact phone toolbar leaves a substantial map area');
 assert.ok(mobileMap.canvasAccessible,'The phone overview is available for map gestures');
 assert.equal(mobileMap.visibleEdges,14,'Every contour edge fits in the unobstructed phone map');
 assert.equal(mobileMap.visibleSamples,294,'The full contour remains inside the phone map after rendering and camera constraints');
 evidence.mobileMap=mobileMap;await shot('mobile-overview');
 await page.evaluate(()=>window.__BAIKONUR_QA.showFlanks());await step();evidence.hierarchy.push({mobile:true,...await hierarchy('flanks')});await shot('mobile-flanks');
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-43'));await step();
 assert.ok(await page.evaluate(()=>document.getElementById('info').contains(document.elementFromPoint(100,50))));
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.stats().mapHierarchy)).level,'sites');
 await shot('mobile-site43');await page.locator('#close').click();await page.locator('#all').click();await shot('mobile-map');
 assert.equal(await page.locator('#trainFollow,#carsFocus,#flanksView,#eveningToggle,#lightingToggle,#ui a[href*="archive.html"]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.deepEqual(failedResources,[]);
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 evidence.geography=initial.geography;evidence.transport=initial.transport;
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,errors,shaderErrors,failedResources,checkedAt:new Date().toISOString()},null,2));
 console.log('OSM_RELEASE_BROWSER_PASS',JSON.stringify({prefix,revision,sites:initial.sites,roadFeatures:3185,railFeatures:543,cycle:812,airports:['krayniy','krayniy']}));
}catch(error){
 await shot('failure').catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({message:error.message,stack:error.stack,errors,shaderErrors,failedResources},null,2));throw error;
}finally{await browser.close();}
