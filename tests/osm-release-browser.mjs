import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createMuseumGeography} from '../src/osm-geography.js';
import {createNorthBankMask} from '../src/river-bank.js';
import {createRiverWaterModel} from '../src/river-surface.js';
import {AIRPORT_DIMENSIONS} from '../src/airport-models.js';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-osm-release';
const revision='20261031-rocket-exhibits-v1';
await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const ukssManifest=JSON.parse(await readFile('assets/models/ukss/manifest-v2.json','utf8'));
const tuaManifest=JSON.parse(await readFile('assets/models/tua/manifest-v2.json','utf8'));
const matches=JSON.parse(await readFile('data/osm/catalog-matches.json','utf8'));
const geography=createMuseumGeography({catalog,matches});
const airportFeatures=JSON.parse(await readFile('data/osm/airports.geojson','utf8')).features;
const river=JSON.parse(await readFile('data/osm/river.geojson','utf8')).features.find(f=>f.geometry.type==='LineString');
const riverWater=createRiverWaterModel({data:JSON.parse(await readFile('data/osm/river-water.geojson','utf8')),project:c=>{const [x,y]=geography.project(c);return [(x-650)*3.4,(y-522.5)*3.4];}});
const northBank=createNorthBankMask(river.geometry.coordinates.map(c=>{const [x,y]=geography.project(c);return [(x-650)*3.4,(y-522.5)*3.4];}),{water:riverWater});
const expectedSites=new Map(geography.sites.map(s=>[s.id,s]));
// The two OSM pad contours now share their reconstruction origin instead of
// the catalogue's broad facility centroid (ways 169401566 and 169401625).
const site110Map=geography.project(63.3077,45.9635);
expectedSites.set('pad-110',{...expectedSites.get('pad-110'),x:site110Map[0],y:site110Map[1]});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',route=>route.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(route.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
const errors=[],shaderErrors=[],failedResources=[],evidence={base,prefix,revision};
const tuaAssetRequests=[];
page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/assets/models/tua/model-v2.glb'))tuaAssetRequests.push(request.url());});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
page.on('response',r=>{if(r.status()>=400&&/\.(?:js|geojson|json|glb)(?:\?|$)/.test(r.url())&&new URL(r.url()).origin===new URL(base).origin)failedResources.push({url:r.url(),status:r.status()});});
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
 await page.evaluate(()=>window.__BAIKONUR_QA.rockets.whenReady());
 await step();
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
 assert.equal(await page.locator('#error').isVisible(),false);
 assert.equal(initial.sites,98);assert.equal(initial.catalogEntries,99);assert.equal(initial.stations,32);
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
 assert.equal(initial.transport.facilityRailPorts.length,8);
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
 const localRoads=initial.transport.exhibitRoadSimplification;
 assert.equal(localRoads.version,'exhibit-access-only-v1');
 assert.equal(localRoads.sourceGraphUnchanged,true);
 assert.equal(localRoads.lightingSource,'retained-rendered-road-runs');
 assert.deepEqual(localRoads.regions.map(r=>r.id).sort(),['krayniy','napornaya','pad-75','yubileiny']);
 for(const region of localRoads.regions){
  assert.ok(region.hiddenEdgeCount>0&&region.keptEdgeCount>0,region.id+' retains access while removing secondary road clutter');
  assert.ok(region.keptWayIds.length<region.sourceWayCount,region.id+' has a visibly simpler local road network');
  for(const wayId of region.preservedTrafficWayIds)assert.ok(region.keptWayIds.includes(wayId),region.id+' retains every moving-traffic road');
  for(const wayId of region.preservedPortWayIds)assert.ok(region.keptWayIds.includes(wayId),region.id+' retains its facility connection');
  if(region.access)assert.equal(region.access.connected,true,region.id+' has a connected destination');
 }
 const airportClearance=localRoads.displayClearance;
 assert.equal(airportClearance.source,'synthetic-museum-display-clearance');
 assert.equal(airportClearance.bypassCount,1,'Yubileiny uses one connected perimeter road');
 assert.ok(airportClearance.joinGaps.length>1&&airportClearance.joinGaps.every(join=>join.gap<1e-5),'The source approaches meet the perimeter road');
 assert.equal(airportClearance.gateAccess.profile,'landside-terminal-access');
 assert.equal(airportClearance.gateAccess.airsideHits,0);
 assert.ok(airportClearance.gateAccess.sourceGap<1e-5&&airportClearance.gateAccess.gateGap<1e-5,'The terminal approach joins at both ends');
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
 assert.equal(initial.commonMetre,.14);
 assert.equal(initial.gagarinScale,.14);
 assert.ok(near(initial.gagarin.railPort,[0,.7453333333333333,85.5]),'The Gagarin rail socket is expressed in physical metres');
 assert.equal(initial.gagarin.physicalRailGauge,1.52);
 assert.equal(initial.gagarin.terrainDatum.rimY,0);
 assert.ok(Math.abs(initial.gagarinGround.rimY+2.755)<1e-8,'The physical rim remains at the terrain datum');
 const gagarinExpected=expectedSites.get('pad-1');
 assert.ok(near(initial.transport.gagarinRail.entryWorld,[(gagarinExpected.x-650)*3.4-85.5*.14,-2.755,(gagarinExpected.y-522.5)*3.4]),'The displayed approach meets the physical socket without moving the OSM site');
 assert.equal(initial.transport.saturnAccess,null,'The removed black Saturn approach stays absent');
 const industrialRoad=initial.transport.roadSurface.continuousThroughRoads.find(r=>r.sourceWayId==='183464610');
 assert.ok(industrialRoad);assert.equal(industrialRoad.renderedRuns,1);
 assert.deepEqual([...industrialRoad.siteIds].sort(),['pad-110','pad-112','pad-112a']);
 assert.equal(initial.highwaySigns.version,'two-readable-faces-four-aimed-floodlights-v1');
 assert.equal(initial.highwaySigns.signCount,2);assert.equal(initial.highwaySigns.faceCount,4);
 assert.equal(initial.highwaySigns.floodlightCount,8);assert.equal(initial.highwaySigns.floodlightsPerFace,2);
 assert.equal(initial.evening.version,'evening-east-cutoff-v3');assert.equal(initial.evening.bankFilter.rule,'north-of-syr-darya-water-v2');
 assert.equal(initial.evening.bankFilter.outsideBankCount,0);assert.ok(initial.evening.bankFilter.remaining>0);assert.ok(initial.evening.bankFilter.excludedByBank.road>0);
 const lightPositions=await page.evaluate(()=>({scene:window.__BAIKONUR_QA.evening.lightPositions(),editor:window.__BAIKONUR_QA.lighting.visibleLightPositions()}));
 assert.equal(lightPositions.scene.length,initial.evening.bankFilter.remaining);
 assert.equal(lightPositions.editor.length,initial.lighting.visibleCount);
 assert.equal(initial.lighting.visibleCount+initial.lighting.hiddenByBank,initial.lighting.count,'Filtering retained saved lamp positions');
 for(const p of [...lightPositions.scene,...lightPositions.editor])assert.ok(p.every(Number.isFinite)&&northBank.contains(p[0],p[2]),'Every rendered stationary light stays on the cosmodrome side of the river');
 evidence.lighting={bankFilter:initial.evening.bankFilter,editor:initial.lighting,checkedPositions:lightPositions.scene.length+lightPositions.editor.length};
 assert.equal(await page.locator('#flanksView,#eveningToggle,#lightingToggle,#trainFollow,#carsFocus,#ui a[href*="archive.html"]').count(),0);
 assert.equal(await page.locator('#all,#top,#fly,#showLabels,[data-layer]').count(),0,'Removed sidebar controls must not remain hidden in the DOM');
 for(const id of ['arrivalPanel','sitesAccordion','equipmentAccordion','cyclogramsAccordion','mythsAccordion','graveyardAccordion'])assert.equal(await page.locator('#'+id).count(),1);
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

 // Saturn retains its natural hill and requested display adjustment after
 // removal of the separate, broad black approach and its roadside lights.
 const shiftedSaturn=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-23'));
 const saturnSource=geography.project(matches.matches.find(m=>m.siteId==='pad-23').representativeLonLat);
 assert.ok(near(shiftedSaturn.map,[saturnSource[0]+20,saturnSource[1]]));
 assert.ok(near(shiftedSaturn.position,[(shiftedSaturn.map[0]-650)*3.4,17.45,(shiftedSaturn.map[1]-522.5)*3.4]));
 assert.deepEqual(shiftedSaturn.geoSource.displayOffset,[20,0]);
 assert.deepEqual(shiftedSaturn.scale,[.525,.525,.525]);
 assert.equal(initial.evening.saturnLights.length,4);
 assert.equal(initial.evening.saturnRoadLights.length,0);
 for(const lamp of [...initial.evening.saturnLights,...initial.evening.saturnRoadLights])
  assert.ok(lamp.y-lamp.terrainY>0&&lamp.y-lamp.terrainY<.06,'Saturn lamp base follows the compact hillside');
 assert.equal(initial.saturn.access.preservedVerticalRaise,20);
 await page.locator('#close').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.inspectSaturnHill();q.evening.setEvening(false);});
 await shot('saturn-hill-day');
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('saturn-hill-evening');
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));
 for(const [id,range,name]of [['pad-75',110,'roads-pad75'],['osm-station-2620204214',160,'roads-napornaya'],['airfield',400,'roads-krayniy'],['pad-251',470,'roads-yubileiny']]){
  assert.equal(await page.evaluate(({id,range})=>window.__BAIKONUR_QA.inspectLocalRoads(id,range),{id,range}),true);
  await shot(name);
 }
 evidence.localRoads=localRoads;
 for(const [id,face,evening]of [['west','front',false],['west','back',true],['east','front',false],['east','back',true]]){
  assert.equal(await page.evaluate(({id,face,evening})=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(evening);return q.inspectRoadSign(id,face);},{id,face,evening}),true);
  assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().highwaySigns.evening),evening);
  await shot('sign-'+id+'-'+face+'-'+(evening?'evening':'day'));
 }
 evidence.highwaySigns=initial.highwaySigns;
 assert.equal(await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);return q.inspectIndustrialRoad();}),true);
 await shot('industrial-road-112-112a-110');
 const riverState=initial.riverCoverage;
 assert.equal(riverState.version,'syrdarya-water-polygons-v1');
 assert.equal(riverState.geometryBasis,'OSM-multipolygon-outer-and-inner-rings');
 assert.equal(riverState.transparentWaterLayers,0);assert.equal(riverState.drawCalls,2);
 assert.equal(riverState.islandCount,riverWater.islands.length);assert.ok(riverState.islandCount>0);
 const riverViews=[];
 for(const view of ['city','islands','west']){
  const state=await page.evaluate(view=>window.__BAIKONUR_QA.inspectRiver(view),view);
  assert.ok(state.target.every(Number.isFinite));if(view==='islands')assert.ok(state.sourceIsland);
  riverViews.push(state);await shot('river-'+view+'-day');
 }
 evidence.river={geometry:riverState,views:riverViews};
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));
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
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
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
 await page.locator('#close').click();await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));

 // The uploaded native model must be loaded, not silently replaced by the
 // procedural fallback. Exercise its real card controls and terrain mask.
 const ukss=initial.ukss;
 assert.equal(ukss.version,'ukss-drive-model-v2');assert.equal(ukss.status,'ready');assert.equal(ukss.error,null);
 assert.equal(ukss.sourceFile,'ukss_scaled.max');
 assert.equal(ukss.sourceSha256,'2e51706e5267564fba9fd6d90262a2fb67f3d84ccfd7c3a002b23895fc704ebb');
 assert.equal(ukss.sourceStats.originalNodeCount,7119);assert.equal(ukss.sourceStats.recoveredNodeCount,7119);
 assert.equal(ukss.sourceStats.sourceTriangles,265429);assert.equal(ukss.sourceStats.removedFlatGroundTriangles,37);
 assert.equal(ukss.assetStats.triangleCount,ukssManifest.assetStats.triangles);assert.ok(ukss.assetStats.drawCallsEstimate<=40);
 assert.deepEqual(ukss.optimization,ukssManifest.optimization);
 assert.equal(ukss.optimization.profile,'macro');
 assert.ok(ukss.assetStats.triangleCount<ukss.optimization.fullReference.triangles,'The loaded museum profile contains fewer actual triangles than the complete model');
 assert.equal(ukss.sourceStats.sourceTriangles-ukss.sourceStats.removedFlatGroundTriangles-ukss.optimization.removedFineTriangles-ukss.optimization.lightTrianglesRemoved-ukss.optimization.trianglesRemovedBySimplification,ukss.assetStats.triangleCount);
 assert.ok(ukss.assetStats.bytes>500000&&ukss.assetStats.bytes<6*1024*1024);
 assert.equal(ukss.assetStats.textureCount,0);assert.equal(ukss.terrainCutout.polygon.length,17);
 assert.equal(initial.ukssConnections?.version,'ukss-source-connections-v2');
 assert.equal(initial.ukssConnections.connected,true);assert.equal(initial.ukssConnections.railTracks.length,2);
 assert.equal(initial.ukssConnections.sourceGeometryStretched,false);
 assert.ok(initial.ukssConnections.railTracks.every(track=>track.sourceGap<1e-8&&track.socketGap<1e-8));
 assert.ok(near(ukss.bounds.min,ukss.manifestBounds.min,.03)&&near(ukss.bounds.max,ukss.manifestBounds.max,.03));
 assert.ok(near(ukss.bounds.min,ukssManifest.bounds.min,.03)&&near(ukss.bounds.max,ukssManifest.bounds.max,.03));
 assert.equal(ukssManifest.normalization.scale,1);assert.equal(ukssManifest.normalization.unit,'metre');
 assert.equal(ukssManifest.normalization.outerMuseumScale,.14);
 assert.ok(Math.abs(ukss.bounds.max[1]-215.151)<.03,'The native mast is measured in metres, with no separate height fitting');
 assert.equal(ukss.mockup.available,true);assert.equal(ukss.mockup.visible,false);assert.equal(ukss.mockup.triangleCount,30753);
 const ukssRocket=initial.rockets.placements.find(p=>p.key==='ukss');
 assert.ok(ukssRocket);assert.equal(ukssRocket.modelId,'energia-polyus');assert.equal(ukssRocket.status,'ready');assert.equal(ukssRocket.visible,true);
 assert.ok(near(ukssRocket.metresToWorld,[.14,.14,.14]));
 const ukssPlacement=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-250'));
 assert.ok(near(ukssPlacement.scale,[.14,.14,.14]));assert.equal(ukssPlacement.rotationY,-.56);
 assert.ok(Math.abs(ukssPlacement.position[1]+2.755)<1e-8);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-250');q.evening.setEvening(false);});
 await step();
 assert.match(await page.locator('#title').textContent(),/250.*УКСС/);
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'tsenki');
 assert.equal(await page.locator('#ukssViews').isVisible(),true);
 assert.deepEqual(await page.locator('#ukssViews button').allTextContents(),['Весь комплекс','Башня','Газоотвод','Сверху']);
 const mockupToggle=page.locator('#ukssMockupToggle');
 assert.equal(await mockupToggle.isVisible(),true);assert.equal(await mockupToggle.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#rocketExhibitToggle').isVisible(),false,'The Soyuz control belongs to Sites 1 and 31');
 const ukssCameras={};
 for(const [label,view]of [['Весь комплекс','overview'],['Башня','tower'],['Газоотвод','trench'],['Сверху','top']]){
  await page.locator('#ukssViews').getByRole('button',{name:label,exact:true}).click();await shot('ukss-'+view+'-day');
  const camera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
  assert.ok([...camera.position,...camera.target].every(Number.isFinite));
  for(const previous of Object.values(ukssCameras))assert.ok(Math.hypot(...camera.position.map((v,i)=>v-previous.position[i]))>1,'UKSS controls select distinct viewpoints');
  ukssCameras[view]=camera;
 }
 await page.locator('#ukssViews').getByRole('button',{name:'Башня',exact:true}).click();
 await mockupToggle.click();await step();
 assert.equal(await mockupToggle.getAttribute('aria-pressed'),'false');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().rockets.placements.find(p=>p.key==='ukss').visible),false);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().ukss.mockup.visible),false);
 assert.match(await mockupToggle.textContent(),/ПОКАЗАТЬ.*ЭНЕРГИЮ.*ПОЛЮС/);await shot('ukss-polyus-hidden');
 await mockupToggle.click();await step();
 assert.equal(await mockupToggle.getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().rockets.placements.find(p=>p.key==='ukss').visible),true);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().ukss.mockup.visible),false,'The old dimensional placeholder remains hidden while the source rocket is displayed');
 assert.match(await mockupToggle.textContent(),/УБРАТЬ.*ЭНЕРГИЮ.*ПОЛЮС/);await shot('ukss-polyus-visible');
 await page.evaluate(()=>window.__BAIKONUR_QA.setLayerVisible('sites',false));await step();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().ukssCutoutEnabled),0,'The ground hole closes when the exhibit layer is hidden');
 await page.evaluate(()=>window.__BAIKONUR_QA.setLayerVisible('sites',true));await step();
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().ukssCutoutEnabled),1);
 await page.locator('#ukssViews').getByRole('button',{name:'Весь комплекс',exact:true}).click();
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('ukss-overview-evening');
 evidence.ukss={model:ukss,placement:ukssPlacement,cameras:ukssCameras};
 await page.evaluate(()=>window.__BAIKONUR_QA.focusSite('pad-112a'));await step();
 assert.equal(await page.locator('#ukssViews').isVisible(),false);assert.equal(await mockupToggle.isVisible(),false);
 await page.locator('#close').click();

 // The parked pair uses one decoded source model with shared GPU resources.
 // Building placement, historical roofs and external rail ports retain their
 // established contracts while local running rails match the real wheels.
 const mik=initial.mik112,tua=mik.tua;
 assert.equal(mik.version,'2.0-metric-photo-surfaces');assert.equal(mik.transporterCount,2);
 assert.equal(mik.physicalUnits,'metres');
 assert.deepEqual(mik.dimensions,{length:240,width:190,high:{length:240,width:120,height:56,bays:3},low:{length:240,width:70,height:30,bays:2}});
 assert.equal(tua.version,'tua-drive-model-v2');assert.equal(tua.status,'ready');assert.equal(tua.error,null);
 assert.equal(tua.sourceFile,'Transporter_railroad_assambly.MAX');
 assert.equal(tua.sourceSha256,'304c2317d335a4787d3748fb4e52ae8f537e48e04cf63057e4374f975b6a650e');
 assert.equal(tua.assetStats.bytes,tuaManifest.assetStats.bytes);assert.equal(tua.assetStats.triangleCount,tuaManifest.assetStats.triangles);
 assert.equal(tua.assetStats.drawCallsEstimate,tuaManifest.assetStats.primitives);assert.equal(tua.assetStats.textureCount,0);
 assert.equal(tua.instanceCount,2);assert.equal(tua.totalTriangles,2*tua.assetStats.triangleCount);
 assert.equal(tua.totalDrawCalls,2*tua.assetStats.drawCallsEstimate);
 for(const [kind,count]of [['Geometry',tua.assetStats.geometryCount],['Material',tua.assetStats.materialCount]]){
  assert.ok(count>0);assert.equal(tua.sharing['unique'+kind+'Count'],count);assert.equal(tua.sharing['shared'+kind+'Count'],count,'Both TUA copies share the actual '+kind.toLowerCase()+' instances');
 }
 assert.equal(tuaAssetRequests.length,1,'The two parked machines require one GLB request');
 assert.deepEqual(tua.optimization,tuaManifest.optimization);assert.equal(tua.optimization.profile,'full');
 assert.deepEqual(tua.normalization,tuaManifest.normalization);
 assert.equal(tua.normalization.uniformScale,1);assert.equal(tua.normalization.physicalUnits,'metres');
 assert.equal(tua.normalization.outerMuseumScale,.14);
 assert.ok(near(tua.bounds.min,tuaManifest.bounds.min,.03)&&near(tua.bounds.max,tuaManifest.bounds.max,.03));
 assert.ok(Math.abs(tua.bounds.max[2]-tua.bounds.min[2]-61.215128)<.03,'The source articulated pose retains its physical length');
 assert.equal(tua.sourceStats.selectedTriangles-tua.optimization.removedFineTriangles,tua.assetStats.triangleCount);
 assert.equal(tua.assetStats.triangleCount,93800);
 assert.equal(tua.assetStats.triangleCount,tua.optimization.fullReference.triangles,'The detailed TUA profile retains the complete selected vehicle geometry');
 assert.equal(tua.optimization.retainedFineObjects,920);assert.equal(tua.optimization.decimatedTriangles,0);
 assert.equal(tua.runningGear.sourceWheelCount,128);assert.equal(tua.runningGear.retainedPartCount,320);
 assert.deepEqual(tua.runningGear,tuaManifest.runningGear);assert.deepEqual(tua.railAdaptation,tuaManifest.railAdaptation);
 assert.deepEqual(tua.placements,tuaManifest.placements);assert.deepEqual(mik.layout.transporterLocal,tua.placements.map(p=>p.position));
 assert.ok(mik.layout.transporterYaw.every((yaw,i)=>Math.abs(yaw-tua.placements[i].rotationY)<1e-10));
 assert.equal(mik.layout.transporterPlacementBasis,'tua-source-manifest');
 assert.equal(mik.features['energia-transporter'],2);assert.equal(mik.features['imported-transporter'],2);
 for(const feature of ['bogie-wheel','ochre-perforated-fork'])assert.equal(mik.features[feature]??0,0,'Old procedural TUA feature counts must be removed');
 assert.equal(mik.features['closed-sliding-door'],4);assert.equal(mik.features['hall-floor'],1);
 assert.equal(mik.features['retained-light-roof'],1);assert.equal(mik.features['retained-dark-roof'],1);
 const originalMikPorts=[[-82.4,4.17,-258.5],[-59.6,4.17,-258.5],[-30.4,4.17,-258.5],[-7.6,4.17,-258.5]];
 assert.ok(mik.railEntries.every((port,i)=>near(port,originalMikPorts[i])));
 assert.equal(mik.railAdaptation.status,'ready');assert.equal(mik.railAdaptation.railCount,8);
 assert.ok(mik.railAdaptation.preservedRailEntries.every((port,i)=>near(port,originalMikPorts[i])));
 assert.ok(Math.abs(mik.railAdaptation.runningGauge-tua.runningGear.localWheelCentreGauge)<1e-10);
 assert.equal(mik.features['transporter-running-rail'],8);assert.equal(mik.features['rail-sleeper'],mik.railAdaptation.sleeperCount);
 assert.equal(initial.mik112Rail.version,'osm-mik112-port-v1');assert.equal(initial.mik112Rail.connected,true);assert.equal(initial.mik112Rail.tracks.length,4);
 assert.match(initial.mik112Rail.sourceRoute,/^osm-rail-/);assert.ok(initial.mik112Rail.joinGap<1e-5);
 const tuaPlacement=await page.evaluate(()=>window.__BAIKONUR_QA.siteState('pad-112'));
 const mikExpected=expectedSites.get('pad-112');
 assert.ok(near(tuaPlacement.map,[mikExpected.x,mikExpected.y]));assert.ok(near(tuaPlacement.scale,[.14,.14,.14]));
 assert.ok(Math.abs(tuaPlacement.rotationY+Math.PI/4)<1e-10&&Math.abs(tuaPlacement.position[1])<1e-10);
 const mikWorld=([x,y,z])=>{const [sx,sy,sz]=tuaPlacement.scale,yaw=tuaPlacement.rotationY,c=Math.cos(yaw),s=Math.sin(yaw);return [tuaPlacement.position[0]+x*sx*c+z*sz*s,tuaPlacement.position[1]+y*sy,tuaPlacement.position[2]-x*sx*s+z*sz*c];};
 const tuaCameraTarget=mikWorld(tuaManifest.camera.target);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-112');q.evening.setEvening(false);});await step();
 assert.match(await page.locator('#title').textContent(),/112/);assert.equal(await page.locator('#mik112Controls').isVisible(),true);
 assert.deepEqual(await page.locator('#mik112Controls button').allTextContents(),['МИК целиком','Кузнечики','Сверху']);
 assert.equal(await page.locator('#ukssViews').isVisible(),false);
 const tuaCameras={};
 for(const [button,view]of [['mik112All','all'],['mik112Tua','tua'],['mik112Top','top']]){
  await page.locator('#'+button).click();await shot('mik112-'+view+'-day');
  assert.equal(await page.locator('#'+button).getAttribute('aria-pressed'),'true');
  const camera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());
  assert.ok([...camera.position,...camera.target].every(Number.isFinite));
  for(const previous of Object.values(tuaCameras))assert.ok(Math.hypot(...camera.position.map((v,i)=>v-previous.position[i]))>1,'The three MIK controls select different useful viewpoints');
  if(view==='tua')assert.ok(near(camera.target,tuaCameraTarget,.001),'The TUA view focuses the native pair');
  tuaCameras[view]=camera;
 }
 const tuaTimeline=[];
 for(const year of [1985,1986,2002,2026]){
  await page.locator('#year').evaluate((input,year)=>{input.value=String(year);input.dispatchEvent(new Event('input',{bubbles:true}));},year);await step();
  const state=await page.evaluate(()=>window.__BAIKONUR_QA.stats().mik112);
  assert.equal(state.year,year);assert.equal(state.tua.visible,year>=1986);assert.equal(state.roofState,year<2002?'historical-intact':'photo-ruined');
  assert.equal(state.tua.status,'ready');assert.deepEqual(state.tua.sharing,tua.sharing);assert.deepEqual(state.layout.transporterLocal,mik.layout.transporterLocal);
  tuaTimeline.push({year,visible:state.tua.visible,roofState:state.roofState});
 }
 assert.equal(tuaAssetRequests.length,1,'Camera and timeline controls reuse the already decoded model');
 await page.locator('#mik112Tua').click();await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(true));await shot('mik112-tua-evening');
 evidence.tua={model:tua,building:mik,placement:tuaPlacement,cameras:tuaCameras,timeline:tuaTimeline};
 await page.locator('#close').click();

 assert.deepEqual(initial.airports.map(a=>[a.key,a.length]).sort(),[['krayniy',AIRPORT_DIMENSIONS.krayniy.length],['yubileiny',2250]]);
 assert.equal(AIRPORT_DIMENSIONS.krayniy.length,1380);
 const krayniyLights=await page.evaluate(()=>window.__BAIKONUR_QA.evening.airportLightPositions('krayniy'));
 assert.equal(krayniyLights.length,149,'The shortened airport retains its complete light layout');
 let minimumShoreClearance=Infinity;
 for(const light of krayniyLights){
  const [x,,z]=light.position,clearance=riverWater.landClearance(x,z);
  minimumShoreClearance=Math.min(minimumShoreClearance,clearance);
  assert.ok(clearance>=5&&northBank.contains(x,z),'Every displayed Krayniy light stays on dry airport-side land');
 }
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.inspectLocalRoads('airfield',480);q.evening.setEvening(true);});
 await shot('krayniy-shore-lights');
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));
 evidence.krayniyShore={length:1380,lights:krayniyLights.length,minimumShoreClearance};
 assert.equal(initial.arrival.version,'krayniy-osm-circuit-v6');assert.equal(initial.arrival.arrivalDuration,120);assert.equal(initial.arrival.cycleDuration,812);
 assert.deepEqual(initial.arrival.airports.map(a=>a.key),['krayniy','krayniy']);
 const arrivalStatus=await page.evaluate(()=>window.__BAIKONUR_QA.arrival.stats().status);
 assert.ok(['inbound','parking','outbound'].includes(arrivalStatus.id));
 assert.equal(await page.locator('#arrivalRoute').textContent(),arrivalStatus.label);
 assert.equal(await page.locator('#arrivalClock').textContent(),arrivalStatus.seconds+' сек');
 assert.ok(!(await page.locator('#arrivalPanel .arrival-title').textContent()).includes('ПОЛЁТ ПО КРУГУ'));
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

 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.traffic.stopFollowing();q.evening.setEvening(false);q.inspectSite31('duct');});
 const pad31=initial.portalArchive.models.find(m=>m.id==='pad-31');
 assert.equal(pad31.features.site31.version,'site31-metric-soyuz-v4');
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
 await page.evaluate(()=>window.__BAIKONUR_QA.showOverview());await step();evidence.hierarchy.push({mobile:true,...await hierarchy('overview')});
 const mobileMenu=page.locator('#mobileMenuToggle');
 assert.equal(await mobileMenu.isVisible(),true);assert.equal(await mobileMenu.getAttribute('aria-expanded'),'false');
 const menuSections=['sitesAccordion','equipmentAccordion','cyclogramsAccordion','mythsAccordion','graveyardAccordion'];
 for(const id of menuSections)assert.equal(await page.locator('#'+id).isVisible(),false);
 await mobileMenu.click();assert.equal(await mobileMenu.getAttribute('aria-expanded'),'true');
 for(const id of menuSections)assert.equal(await page.locator('#'+id).isVisible(),true);
 assert.equal(await page.locator('#all,#top,#fly,#showLabels,[data-layer]').count(),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(false));await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewBoundary),0);
 await page.evaluate(()=>window.__BAIKONUR_QA.setLabelsVisible(true));await step();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts.visibleOverviewBoundary),1);
 await mobileMenu.click();await step();assert.equal(await mobileMenu.getAttribute('aria-expanded'),'false');
 for(const id of menuSections)assert.equal(await page.locator('#'+id).isVisible(),false);
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
 const mobileSiteCard=await page.evaluate(()=>{
  const info=document.getElementById('info'),card=info.getBoundingClientRect(),menu=document.getElementById('mobileMenuToggle'),toggle=menu.getBoundingClientRect();
  const cardHit=document.elementFromPoint(card.left+Math.min(40,card.width/2),card.top+Math.min(40,card.height/2));
  const menuHit=document.elementFromPoint(toggle.left+toggle.width/2,toggle.top+toggle.height/2);
  return {card:{top:card.top,bottom:card.bottom,width:card.width,height:card.height},cardAccessible:info.contains(cardHit),menuAccessible:menu.contains(menuHit)};
 });
 assert.ok(mobileSiteCard.card.width>0&&mobileSiteCard.card.height>0&&mobileSiteCard.cardAccessible,'The selected phone site card receives pointer input inside its actual bounds');
 assert.ok(mobileSiteCard.menuAccessible,'The selected site card leaves the phone menu reachable');
 await mobileMenu.click();assert.equal(await mobileMenu.getAttribute('aria-expanded'),'true');
 await mobileMenu.click();assert.equal(await mobileMenu.getAttribute('aria-expanded'),'false');
 evidence.mobileSiteCard=mobileSiteCard;
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.stats().mapHierarchy)).level,'sites');
 await shot('mobile-site43');await page.locator('#close').click();
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-250');q.evening.setEvening(false);});await step();
 assert.equal(await page.locator('#ukssViews').isVisible(),true);assert.equal(await page.locator('#ukssMockupToggle').isVisible(),true);
 await page.locator('#ukssViews').getByRole('button',{name:'Весь комплекс',exact:true}).click();await step();
 const ukssMobile=await page.evaluate(()=>({camera:window.__BAIKONUR_QA.cameraState(),controls:[...document.querySelectorAll('#ukssViews button,#ukssMockupToggle')].map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width};}),width:innerWidth}));
 assert.ok(ukssMobile.controls.every(b=>b.left>=0&&b.right<=ukssMobile.width&&b.width>0),'All UKSS controls fit the phone card');
 assert.ok([...ukssMobile.camera.position,...ukssMobile.camera.target].every(Number.isFinite));
 await page.locator('#close').click();await shot('mobile-ukss');evidence.ukss.mobile=ukssMobile;
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-112');q.evening.setEvening(false);});await step();
 await page.locator('#mik112Tua').click();await step();
 const tuaMobile=await page.evaluate(()=>{
  const element=document.getElementById('info'),info=element.getBoundingClientRect(),style=getComputedStyle(element),dock=document.getElementById('timeDock').getBoundingClientRect();
  const decoration=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0);
  const cssMaximum=/^\d+(?:\.\d+)?px$/.test(style.maxHeight)?parseFloat(style.maxHeight):Math.min(innerHeight*.38,330);
  const heightLimit=Math.min(cssMaximum,innerHeight*.38,330)+(style.boxSizing==='border-box'?0:decoration);
  return {camera:window.__BAIKONUR_QA.cameraState(),card:{left:info.left,right:info.right,top:info.top,bottom:info.bottom,height:info.height},timelineTop:dock.top,
   heightLimit,cssMaxHeight:style.maxHeight,boxSizing:style.boxSizing,mapAboveCard:info.top-document.getElementById('ui').getBoundingClientRect().bottom,
   controls:[...document.querySelectorAll('#mik112Controls button')].map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width};}),width:innerWidth};
 });
 assert.ok(tuaMobile.controls.every(b=>b.left>=0&&b.right<=tuaMobile.width&&b.width>0&&b.top>=tuaMobile.card.top&&b.bottom<=tuaMobile.card.bottom),'All three TUA view controls fit the phone card');
 assert.ok(tuaMobile.card.height<=tuaMobile.heightLimit+1&&tuaMobile.card.bottom<=tuaMobile.timelineTop-4,'The TUA selection card respects its 38vh/330px limit and leaves the timeline usable');
 assert.ok(tuaMobile.mapAboveCard>=120,'A separate area of the model remains visible between the phone menu and the TUA card');
 assert.ok(near(tuaMobile.camera.target,tuaCameraTarget,.001));
 for(const id of ['tuaRocketChoice','tuaPlaceRocket']){
  const control=page.locator('#'+id);await control.scrollIntoViewIfNeeded();
  const reachable=await control.evaluate(element=>{
   const b=element.getBoundingClientRect(),card=document.getElementById('info').getBoundingClientRect();
   return b.width>0&&b.height>0&&b.left>=card.left&&b.right<=card.right&&b.top>=card.top&&b.bottom<=card.bottom;
  });
  assert.ok(reachable,id+' remains reachable inside the scrolling phone card');
 }
 await page.locator('#mik112Tua').scrollIntoViewIfNeeded();
 await shot('mobile-tua');evidence.tua.mobile=tuaMobile;await page.locator('#close').click();
 await page.evaluate(()=>window.__BAIKONUR_QA.showOverview());await shot('mobile-map');
 assert.equal(await page.locator('#trainFollow,#carsFocus,#flanksView,#eveningToggle,#lightingToggle,#ui a[href*="archive.html"]').count(),0);

 // Exercise the actual public deep link on a fresh phone page, including the
 // asynchronous native-model load before selection and camera setup.
 const tuaLink=new URL(base);tuaLink.searchParams.set('site','112');tuaLink.searchParams.set('view','tua');
 await page.goto(tuaLink.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(expected=>window.__BAIKONUR_QA?.stats().museumRevision===expected,revision,{timeout:180000});
 await page.evaluate(()=>window.__BAIKONUR_QA.rockets.whenReady());await step();
 assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.locator('#title').textContent(),'«Кузнечики» · ТУА');
 assert.equal(await page.locator('#mik112Controls').isVisible(),true);assert.equal(await page.locator('#mik112Tua').getAttribute('aria-pressed'),'true');
 const tuaDeepLink=await page.evaluate(()=>({camera:window.__BAIKONUR_QA.cameraState(),model:window.__BAIKONUR_QA.stats().mik112.tua}));
 assert.equal(tuaDeepLink.model.status,'ready');assert.equal(tuaDeepLink.model.instanceCount,2);
 assert.ok(near(tuaDeepLink.camera.target,tuaCameraTarget,.001));assert.equal(tuaAssetRequests.length,2,'Each navigation loads one shared TUA asset');
 await shot('mobile-tua-deep-link');evidence.tua.deepLink={url:tuaLink.href,camera:tuaDeepLink.camera};
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.deepEqual(failedResources,[]);
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 evidence.geography=initial.geography;evidence.transport=initial.transport;
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,errors,shaderErrors,failedResources,checkedAt:new Date().toISOString()},null,2));
 console.log('OSM_RELEASE_BROWSER_PASS',JSON.stringify({prefix,revision,sites:initial.sites,roadFeatures:3185,railFeatures:543,cycle:812,airports:['krayniy','krayniy']}));
}catch(error){
 await shot('failure').catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({message:error.message,stack:error.stack,errors,shaderErrors,failedResources},null,2));throw error;
}finally{await browser.close();}
