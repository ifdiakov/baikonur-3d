import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',err=>errors.push(String(err)));
page.on('console',m=>{if(m.type()==='error')console.error('BROWSER CONSOLE:',m.text())});
page.on('requestfailed',r=>console.error('FAILED REQUEST:',r.url(),r.failure()?.errorText));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>fn.name==='animate'?setTimeout(()=>native(fn),180):native(fn);});
const museumURL=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
await page.goto(museumURL,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>Boolean(window.__BAIKONUR_QA),null,{timeout:60000});
await page.waitForFunction(()=>document.getElementById('roadStatus')?.textContent.includes('цветных пикселей'),null,{timeout:30000});
// Enterprise artwork is local, transparent, and attached only to attributed sites.
await page.waitForFunction(()=>{
 const logos=[...document.querySelectorAll('.detail-card .org-logo')];
 return logos.length>=4&&logos.every(image=>image.complete&&image.naturalWidth>=320&&image.naturalHeight>0);
},null,{timeout:15000});
assert.equal(await page.locator('.detail-card [data-org-logo="tsenki"]').count(),17);
assert.equal(await page.locator('.detail-card [data-org-logo="energia"]').count(),2);
assert.equal(await page.locator('.detail-card [data-org-logo="khrunichev"]').count(),1);
assert.equal(await page.locator('.detail-card [data-org-logo="progress"]').count(),1);
assert.equal(await page.locator('.detail-card [data-org-logo="cpc"]').count(),0);
assert.equal(await page.locator('.detail-card img[src*="wikimedia"]').count(),0);
console.log('ENTERPRISE LOGOS: local silver assets loaded on all attributed site cards');
// Check the reviewed workbook reaches visible cards without undoing newer map edits.
const reviewedCatalog=await page.evaluate(async()=>await (await fetch('./data/catalog.json',{cache:'no-store'})).json());
assert.ok(reviewedCatalog.sites.some(site=>site.id==='pad-75'));
assert.ok(!reviewedCatalog.sites.some(site=>site.id==='pad-17'));
assert.ok(reviewedCatalog.unplacedReferenceSites.some(site=>site.number==='17'));
const kaz=reviewedCatalog.sites.find(site=>site.id==='pad-3');
assert.deepEqual([kaz.x,kaz.y],[708,651]);
for(const [id,logo] of [['pad-2a','tsenki'],['pad-112','progress'],['pad-254','energia'],['pad-45','baiterek'],['pad-75','tsenki'],['pad-89',null]]){
 const site=reviewedCatalog.sites.find(site=>site.id===id);
 await page.evaluate(id=>window.__BAIKONUR_QA.focusSite(id),id);
 assert.equal(await page.locator('#infoPurpose').textContent(),site.purposeLong);
 assert.ok((await page.locator('#description').textContent()).includes(site.note));
 assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),logo);
 if(id==='pad-75'){
  assert.equal(site.organisation.org,'ЦЭНКИ');
  assert.equal(await page.locator('#infoOrgRole').textContent(),'Владелец — ЦЭНКИ');
  assert.ok((await page.locator('#infoPurpose').textContent()).includes('принадлежит ЦЭНКИ'));
 }
 if(id==='pad-45')assert.equal(await page.locator('#infoOrgRole').textContent(),site.organisation.org);
 if(id==='pad-112'||id==='pad-254')assert.equal(await page.locator('#infoOrgRole').textContent(),site.organisation.org);
 await page.locator('#detailMore').click();
 for(const reference of site.publicReferences)assert.ok((await page.locator('#infoExtra a').evaluateAll(links=>links.map(link=>link.href))).includes(reference));
 await page.locator('#close').click();
}
await page.locator('#all').click();
console.log('REVIEWED CATALOG: descriptions, notes, sources and organisation roles are visible; pad 75 and relocated KAZ preserved');
// Sidebar cleanup must preserve navigation while removing temporary implementation notes.
const sidebarCleanup=await page.evaluate(()=>{
 const sidebar=document.querySelector('#ui');const text=sidebar?.innerText||'';
 return {noPrototypeNote:!text.includes('Трёхмерная модель планировки'),noPlanToggle:!sidebar.querySelector('[data-layer="plan"]'),noRoadDiagnostics:!text.includes('цветных пикселей'),noSatelliteDisclaimer:!text.includes('Спутниковая съёмка доступна'),roadsToggle:!!sidebar.querySelector('[data-layer="roads"]'),railsToggle:!!sidebar.querySelector('[data-layer="rails"]'),labelsToggle:!!sidebar.querySelector('#showLabels'),noYandexButton:!sidebar.querySelector('#satellite'),statusHidden:getComputedStyle(document.getElementById('roadStatus')).display==='none'};
});
console.log('SIDEBAR',JSON.stringify(sidebarCleanup));
assert.ok(Object.values(sidebarCleanup).every(Boolean),'Sidebar must hide implementation diagnostics without losing working navigation');
// The large site catalogue is collapsed until the visitor expands it.
const accordion=page.locator('#sitesAccordion');
const initialSidebarHeight=await page.locator('#ui').evaluate(el=>el.getBoundingClientRect().height);
assert.equal(await accordion.count(),1,'Site catalogue must exist as a collapsible section');
assert.equal(await accordion.evaluate(el=>el.open),false,'Site catalogue must start collapsed');
assert.equal(await page.locator('#search').isVisible(),false,'Search must be hidden when site catalogue is collapsed');
assert.ok(Number(await page.locator('#count').textContent())>=90,'The collapsed heading must display its object count');
await page.locator('#sitesAccordion > summary').click();
assert.equal(await accordion.evaluate(el=>el.open),true,'Clicking the heading must expand the catalogue');
const expandedSidebarHeight=await page.locator('#ui').evaluate(el=>el.getBoundingClientRect().height);
assert.ok(expandedSidebarHeight>=initialSidebarHeight-2,'Expanded catalogue must not make sidebar smaller');
assert.ok((await page.locator('#list').isVisible()),'Catalogue list must be visible after expansion');
assert.equal(await page.locator('#search').isVisible(),true,'Search must appear inside expanded catalogue');
assert.ok((await page.locator('#list .entry').count())>=90,'Expanded catalogue must display all museum objects');
await page.locator('#sitesAccordion > summary').click();
assert.equal(await accordion.evaluate(el=>el.open),false,'Clicking the heading again must collapse the catalogue');
console.log('ACCORDION: collapsed, expands with search and object list, then collapses');
async function verifyMenuAndGuideStack(page,where){
  const layout=await page.evaluate(()=>{
    const stack=document.getElementById('museumLeftStack').getBoundingClientRect(),
          ui=document.getElementById('ui').getBoundingClientRect(),
          guide=document.getElementById('navigationGuide').getBoundingClientRect(),
          dock=document.getElementById('timeDock').getBoundingClientRect();
    return {stack:{x:stack.x,y:stack.y,right:stack.right,bottom:stack.bottom,h:stack.height},
      ui:{x:ui.x,y:ui.y,bottom:ui.bottom,h:ui.height},
      guide:{x:guide.x,y:guide.y,bottom:guide.bottom,h:guide.height},
      dockTop:dock.top,open:document.getElementById('navigationGuide').open,
      siteOpen:document.getElementById('sitesAccordion').open};
  });
  console.log('LEFT STACK '+where,JSON.stringify(layout));
  assert.ok(Math.abs(layout.ui.x-layout.guide.x)<=2,'Navigation hint must align with sidebar');
  assert.ok(layout.guide.y>=layout.ui.bottom+5,'Navigation hint must sit BELOW the sidebar without overlap');
  assert.ok(layout.guide.bottom<=layout.dockTop-4,'The menu and navigation guide must stay above timeline');
  return layout;
}
assert.equal(await page.locator('#navigationGuide').count(),1,'Illustrated navigation guide must exist separately');
assert.equal(await page.locator('#navigationGuide').evaluate(e=>e.open),false,'Navigation guide must begin collapsed');
await verifyMenuAndGuideStack(page,'desktop-collapsed');
await page.locator('#sitesAccordion > summary').click();
await page.locator('#navigationGuide > summary').click();
assert.equal(await page.locator('#navigationGuide .guide-item').count(),4,'Guide must show illustrated mouse and keyboard controls');
await verifyMenuAndGuideStack(page,'desktop-expanded-both');
await page.locator('#navigationGuide > summary').click();
await page.locator('#sitesAccordion > summary').click();

assert.equal(await page.locator('.hud').count(),0,'Bottom-right debug badge must be removed');
assert.equal(await page.locator('#ui').getByText('Источники портретов').count(),0,'Portrait-source accordion must be removed');
assert.equal(await page.locator('#researchAccordion').count(),0,'Field research must not have a separate menu');
await page.locator('#sitesAccordion > summary').click();
assert.ok(Number(await page.locator('#count').textContent())>=104,'The same catalogue count must include 97 pads and 7 finds');
assert.equal(await page.locator('#list .entry-field-research').count(),7,'All seven field objects must be in the common site list');
await page.locator('#search').fill('BAI-');
assert.equal(await page.locator('#list .entry').count(),7,'Common search must filter field finds');
await page.locator('#list [data-research-id="BAI-001"]').click();
assert.equal(await page.locator('#title').textContent(),'BAI-001 · Разрушенный комплекс сооружений');
assert.ok((await page.locator('#description').textContent()).includes('46.005175'),'Known GPS must be shown without fake 3D placement');
await page.locator('#detailMore').click();
assert.equal(await page.locator('#infoExtra a').count(),1,'Research detail must retain its original map link');
assert.ok((await page.locator('#infoExtra a').getAttribute('href')).startsWith('https://maps.app.goo.gl/'));
await page.locator('#close').click();
await page.locator('#search').fill('');
await page.locator('#sitesAccordion > summary').click();
await page.waitForFunction(()=>document.querySelectorAll('#timelineEvents .timeline-chip').length===18,null,{timeout:15000});
assert.equal(await page.locator('#timelineEvents .timeline-chip').count(),18,'History timeline must have 18 sourced events');
await page.locator('[data-event-id="r7-first"]').click();
assert.equal(await page.locator('#yearVal').textContent(),'1957');
assert.equal(await page.locator('#timelineEventPanel').isVisible(),true,'Historical popover must open on click');
assert.ok((await page.locator('#timelineEventDescription').textContent()).includes('Р-7'));
assert.equal(await page.locator('#timelineGoToSite').isVisible(),true,'Known launch must offer a jump to the pad');
await page.locator('#timelineEventClose').click();
await page.locator('[data-event-id="almaz-1"]').click();
assert.equal(await page.locator('#yearVal').textContent(),'1973','Timeline must include the Almaz program');
await page.locator('#timelineEventClose').click();
await page.locator('[data-event-id="zarya"]').click();
assert.equal(await page.locator('#yearVal').textContent(),'1998','Timeline must include ISS modules');
assert.ok((await page.locator('#timelineEventSource').getAttribute('href')).startsWith('https://www.nasa.gov/'));
await page.locator('#timelineEventClose').click();
await page.evaluate(()=>{const slider=document.getElementById('year');slider.value='2026';slider.dispatchEvent(new Event('input',{bubbles:true}))});
// Verify the exact supplied brand graphic and the separate bottom history dock.
await page.waitForFunction(()=>{const image=document.querySelector('.rockettrip-logo');return !!(image&&image.complete&&image.naturalWidth>=300)},null,{timeout:15000});
const layout=await page.evaluate(()=>{
 const dock=document.querySelector('#timeDock'),logo=document.querySelector('.rockettrip-logo'),slider=document.querySelector('#year'),sidebar=document.querySelector('#ui');
 const d=dock.getBoundingClientRect(),l=logo.getBoundingClientRect(),s=slider.getBoundingClientRect(),m=sidebar.getBoundingClientRect();
 return {dockBottom:Math.round(innerHeight-d.bottom),dockWidth:d.width,logoNatural:logo.naturalWidth,logoVisible:l.width>100&&l.height>40,sliderOutsideSidebar:!sidebar.contains(slider),sliderBottom:s.bottom<=d.bottom&&s.top>=d.top,sidebarAboveDock:m.bottom<=d.top+1};
});
console.log('LAYOUT',JSON.stringify(layout));
assert.ok(layout.dockWidth>1500&&Math.abs(layout.dockBottom-15)<=1,'History must be an inset floating card like sidebar');
assert.ok(layout.logoVisible&&layout.logoNatural>=300,'User-supplied RocketTrip logo must load and be visible');
assert.ok(layout.sliderOutsideSidebar&&layout.sliderBottom&&layout.sidebarAboveDock,'Time slider must live outside sidebar and remain inside bottom dock');
await page.evaluate(()=>{const slider=document.getElementById('year');slider.value='1961';slider.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(await page.locator('#yearVal').textContent(),'1961','Year readout must follow timeline control');
await page.evaluate(()=>{const slider=document.getElementById('year');slider.value='2026';slider.dispatchEvent(new Event('input',{bubbles:true}))});
await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats()?.serviceReference?.loaded===true,null,{timeout:20000});
const photoOverlay=await page.evaluate(()=>window.__BAIKONUR_QA.stats().serviceReference);
console.log('SERVICE SCHEME',JSON.stringify(photoOverlay));
assert.equal(photoOverlay.source,'visitor-supplied-photograph','The actual user-supplied service scheme must be the overlay source');
assert.ok(photoOverlay.inkPixels>250,'The new image must contribute nonempty historical infrastructure linework');
const yandexControl=await page.evaluate(()=>document.querySelector('#ui #satellite'));
assert.equal(yandexControl,null,'Yandex external link must be removed from the museum sidebar');
const terrainInfo=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
console.log('TERRAIN STYLE',JSON.stringify(terrainInfo.terrain));
assert.equal(terrainInfo.terrain?.name,'Baikonur Steppe v4','Museum must load the unified v4 earth textures');
assert.equal(terrainInfo.outerTerrain.edition,4,'Shared-coordinate terrain generator must be active');
assert.equal(terrainInfo.outerTerrain.continuousWorldCoordinates,true,'Near/far terrain must sample shared coordinates');
assert.deepEqual(terrainInfo.outerTerrain.textureResolutions,[512,768],'Two world-scale texture bands must be present');
assert.ok(terrainInfo.outerTerrain.mediumExtent>17000,'Intermediate terrain must cover territory beyond site map');
assert.ok(terrainInfo.outerTerrain.riparianShrubs>100,'Sparse alluvial shrub vegetation must be placed along the river');
assert.equal(terrainInfo.terrain?.photographicClaim,undefined,'Generated ground must not be misrepresented as satellite imagery');
assert.ok(terrainInfo.outerTerrain.extent>=110000,'Expanded ground must reach beyond the visible horizon');
assert.ok(terrainInfo.cameraMinElevationDeg===30,'Viewer must remain at least 30 degrees above the horizontal plane');
assert.equal(terrainInfo.terrain?.tileResolution,1024,'Background terrain must use 1024px seamless base');
assert.deepEqual(terrainInfo.terrain?.detailResolution,[1024,824],'Local satellite-style mosaic must use high-resolution synthetic detail');
assert.ok(terrainInfo.terrainExtent>=100000,'The desert may not terminate at the historical map edge');
const gagarin=await page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarin);
console.log('GAGARIN START',JSON.stringify(gagarin));
assert.equal(gagarin.version,'3.3-below-grade','Pad 1 must keep circular rocket openings and the below-grade flame duct');
assert.equal(gagarin.archiveFolder,'1JAaawXTM0I9P-0C6br3d_xSiaUsLMOpC');
assert.ok(gagarin.meshCount>700,'Detailed model must contain a large set of photo-informed structural primitives');
assert.ok(gagarin.renderMeshCount<100,'Optimized geometry should not produce a huge number of WebGL draw calls');
for(const [component,min] of [
 ['bridge-concrete-pier',2],['underbridge-gallery',4],['flame-channel',1],
 ['flame-duct-bank',10],['gantry-inclined-main',4],['tower-main-leg',4],
 ['tower-service-deck',6],['rail-approach',2],['tulip-arm',4],
 ['lighting-tower',4],['yellow-counterweight',4],['concrete-bridge-stairs',4]
]) assert.ok((gagarin.featureCounts[component]||0)>=min,'Missing photo-referenced Site 1 component '+component);

// Raycast actual geometry: an opening must remain empty, while its rim is solid.
const passageGeometry=await page.evaluate(async()=>{
 const THREE=await import('three');
 const {buildGagarinPad}=await import('./src/gagarin-pad.js');
 const model=new THREE.Group();
 const exhibit=buildGagarinPad(model);
 model.updateMatrixWorld(true);
 const decks=[];
 model.traverse(object=>{if(object.userData.rocketAperture)decks.push(object)});
 const ray=new THREE.Raycaster();
 let blockedHoleSamples=0,missingRimSamples=0,blockedShaftSamples=0;
 for(const deck of decks){
  const {radius,deckY}=deck.userData.rocketAperture;
  for(let j=0;j<32;j++){
   const a=j*Math.PI/16;
   ray.set(new THREE.Vector3(Math.cos(a)*radius*.97,deckY+2,Math.sin(a)*radius*.97),new THREE.Vector3(0,-1,0));
   if(ray.intersectObject(deck,false).length)blockedHoleSamples++;
   ray.set(new THREE.Vector3(Math.cos(a)*(radius+.25),deckY+2,Math.sin(a)*(radius+.25)),new THREE.Vector3(0,-1,0));
   if(!ray.intersectObject(deck,false).length)missingRimSamples++;
  }
 }
 const structure=model.children.filter(object=>object!==exhibit.rocket);
 for(const radius of [0,3.3,4.6])for(let j=0;j<16;j++){
  const a=j*Math.PI/8;
  ray.set(new THREE.Vector3(Math.cos(a)*radius,110,Math.sin(a)*radius),new THREE.Vector3(0,-1,0));
  if(ray.intersectObjects(structure,true).some(hit=>hit.point.y>=27))blockedShaftSamples++;
 }
 const plan=model.userData.gagarinModel.ductPlan;
 const floor=model.children.filter(object=>object.userData.museumComponent==='flame-channel');
 let floorGaps=0;
 for(const p of plan.stations.slice(1,-1)){
  const x=((p[3]+p[4])/2-plan.origin[1])*plan.scale,z=-(p[0]-plan.origin[0])*plan.scale;
  ray.set(new THREE.Vector3(x,25,z),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObjects(floor,true)[0];
  if(!hit||Math.abs(hit.point.y-p[5])>.02)floorGaps++;
 }
 const result={deckCount:decks.length,blockedHoleSamples,missingRimSamples,blockedShaftSamples,floorGaps};
 const geometries=new Set(),materials=new Set();
 model.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material)});
 for(const geometry of geometries)geometry.dispose();
 for(const material of materials)material.dispose();
 return result;
});
console.log('ROCKET PASSAGE GEOMETRY',JSON.stringify(passageGeometry));
assert.deepEqual(passageGeometry,{deckCount:7,blockedHoleSamples:0,missingRimSamples:0,blockedShaftSamples:0,floorGaps:0},'Seven circular deck openings must align on a clear rocket axis, with solid rims');

const duct=gagarin.ductPlan;
assert.ok(duct.stations[0][2]-duct.stations[0][1]>4*(duct.stations.at(-1)[2]-duct.stations.at(-1)[1]),'The broad chamber must be beside the launch pad, tapering east');
assert.ok(duct.outletWidth>30,'The exhaust apron must have finite width, not end at a point');
const padPlacement=await page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarinPlacement);
assert.deepEqual(padPlacement.mapPixel,[699,365],'Site 1 must remain on its original schematic site');
assert.ok(Math.abs(padPlacement.rotationY+Math.PI/2)<.0001,'Flame duct must face east');
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarinRocketVisible),false,'No permanently staged rocket at closed Pad 1');
const overviewScale=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
assert.equal(overviewScale.modelScale,.28,'Schematic pad models must be reduced to 28% of their model-space size');
assert.ok(overviewScale.sceneScale>2.3,'Cosmodrome extent must be more than doubled');
assert.equal(overviewScale.gagarinScale,.43*.28/1.5,'Pad 1 must retain its detailed model at reduced world scale');
const highway=overviewScale.highwaySigns;
console.log('HIGHWAY SIGNS',JSON.stringify(highway));
assert.equal(highway.signCount,2,'One western and one eastern road sign must be rendered');
assert.deepEqual(highway.cities.map(c=>c.name),['АКТОБЕ','САМАРА','КЫЗЫЛОРДА','АЛМАТЫ']);
assert.ok(highway.locations[0].x>-2000 && highway.locations[1].x<1900,'Signposts must move inward nearer to the crossroads');
const transport=overviewScale.transport;
console.log('TRANSPORT NETWORK',JSON.stringify(transport));
assert.equal(transport.roadRoutes,24,'Road system retains the original corridors and includes the Site 42 driveway');
assert.equal(transport.railRoutes,14,'Rail layout should include main corridors and branch sidings');
assert.equal(transport.stationCount,7,'Render seven historical or interpretative station yards');
assert.ok(transport.railSwitches>=18,'Rail turnouts and station throat switches must be modeled');
assert.ok(transport.railTies>=900,'Two-rail track system must have realistic sleepers');
assert.ok(transport.yardTracks>=14,'Stations need several diverging yard tracks');
assert.ok(transport.stationNames.includes('ст. Нагорная'),'Station names from the historical scheme must be included');
assert.ok(transport.facilityDriveways>=12,'Pads must connect to the main road network');
assert.ok(transport.renderedRailLength>14000,'Render long continuously curved rail networks');
const saturn=overviewScale.saturn;
console.log('SATURN SITE 23',JSON.stringify(saturn));
assert.equal(saturn.version,'1.7-readable-relief-lighting','The Saturn IP-5 photo model must be integrated');
assert.equal(saturn.sourceFolder,'1nweD3hi2MRaeVuNOY2GflKtEMQ1RoDXk','Saturn must reference dedicated user Drive folder');
assert.equal(saturn.dishDiameterMetres,25);
assert.equal(saturn.largeAntennaCount,2,'Saturn must have two 25m P-200 parabolic antennas');
for(const [key,min] of [
 ['25m-parabolic-reflector',2],['dish-radial-rib',400],['dish-support-web',40],
 ['tower-horizontal-cornice',8],['control-building',4],['white-radome',1],
 ['northwest-gate-pavement',1],['murguduk-hill',1],['feed-support-truss',8]
]) assert.ok((saturn.featureCounts[key]||0)>=min,'Saturn model lacks photoreferenced architectural element '+key);
assert.ok(saturn.primitiveCount>=800,'Saturn dishes need structural detail, not a few generic cones');
assert.equal(overviewScale.saturnScale,.525,'Keep the approved Saturn model scale');
assert.deepEqual(overviewScale.saturnPlacement,[741,716],'Satellite site is located at provisional 3-anchor coordinates');
const count=overviewScale.sites;
assert.equal(count,97,'Museum resolves the eastern-complex alias into one canonical Site 43');

assert.ok(count>=90,'The museum must load the extended site catalogue');
assert.ok((await page.locator('.site-label').count())>=80,'Must have labels for the catalogue');
await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(1450));
await page.waitForFunction(()=>Number(document.getElementById('hero')?.style.opacity)>.90,null,{timeout:10000});
await page.screenshot({path:'qa-overview.png'});
const passport=await page.locator('#hero').evaluate(el=>({inline:el.style.opacity,computed:getComputedStyle(el).opacity,visible:el.getBoundingClientRect().width>0}));
console.log('PASSPORT',JSON.stringify(passport));
assert.ok(Number(passport.inline)>.9 && passport.visible,'Level 1: factual passport should be visible');
const districtsOverview=await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts);
assert.equal(districtsOverview.visibleZones,0,'Flank thematic boundaries must disappear at high satellite overview');
assert.equal(districtsOverview.visibleBoundaries,0,'Flank boundaries must not leak into passport level');
await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(760));
await page.waitForTimeout(300);
assert.ok((await page.locator('.flank-label').count())===3,'Level 2: three enterprise flanks must exist');
assert.ok((await page.locator('.flank-label:visible').count())>0,'Level 2: at least one flank card must be visible');
assert.equal(await page.locator('.flank-portrait').count(),3,'All three constructors must have archival portraits');
assert.equal(await page.locator('.flank-engineer').count(),3,'All three designers must have large surname headings');
assert.equal(await page.locator('.flank-fullname').count(),3,'All three cards must have the designers full names');
assert.deepEqual(await page.locator('.flank-engineer').allTextContents(),['ЧЕЛОМЕЙ','КОРОЛЁВ','ЯНГЕЛЬ']);
assert.deepEqual(await page.locator('.flank-fullname').allTextContents(),[
 'Владимир Николаевич Челомей','Сергей Павлович Королёв','Михаил Кузьмич Янгель'
]);
await page.waitForFunction(()=>[...document.querySelectorAll('.flank-portrait img')].every(im=>im.complete),null,{timeout:18000});
const portraits=await page.evaluate(()=>[...document.querySelectorAll('.flank-portrait img')].map(im=>({
 alt:im.alt,src:im.currentSrc,loaded:im.naturalWidth>0,
 width:im.naturalWidth,height:im.naturalHeight
})));
console.log('FLANK PORTRAITS',JSON.stringify(portraits));
assert.ok(portraits.every(p=>p.loaded),'Portrait images must load, not just fallback to initials');
const enterpriseTitles=await page.locator('.flank-name').allTextContents();
assert.ok(enterpriseTitles[0].includes('НПО машиностроения')&&enterpriseTitles[0].includes('Центр Хруничева'),'Left flank names its enterprises');
assert.ok(enterpriseTitles[1].includes('РКК «Энергия»')&&enterpriseTitles[1].includes('РКЦ «Прогресс»'),'Central flank names its enterprises');
assert.ok(enterpriseTitles[2].includes('КБ «Южное»')&&enterpriseTitles[2].includes('«Южмаш»'),'Right flank names its enterprises');
for(const field of ['rockets','purpose','features']){
 const values=await page.locator('.flank-'+field).allTextContents();
 assert.equal(values.length,3,'Every flank has a '+field+' section');
 assert.ok(values.every(value=>value.length>15),'Flank '+field+' sections contain useful summaries');
}
assert.equal(await page.locator('.flank-enterprises').count(),3,'Keep enterprise descriptions alongside returned designer portraits');
const districtState=await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts);
console.log('FLANK DISTRICTS',JSON.stringify(districtState));
assert.equal(districtState.zoneCount,3,'Museum should have exactly 3 thematic map districts');
assert.equal(districtState.visibleZones,3,'All three zones must be visible during the flank layer');
assert.equal(districtState.visibleBoundaries,2,'Only two internal district borders should be drawn');
assert.ok(districtState.alpha>.55,'Zone boundaries must be clearly visible at the flank zoom');
await page.screenshot({path:'qa-flanks.png'});
await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(460));
await page.waitForTimeout(300);
assert.ok((await page.locator('.site-label:visible').count())>0,'Level 3: numbered site labels should be visible');
const districtSites=await page.evaluate(()=>window.__BAIKONUR_QA.stats().flankDistricts);
assert.equal(districtSites.visibleZones,0,'Flank districts disappear when site numbers appear');
assert.equal(districtSites.visibleBoundaries,0,'Flank borders disappear in close-up site layer');
const firstVisibleSite=page.locator('.site-label:not(.is-provisional):visible').first();
const eyeIndex=await firstVisibleSite.getAttribute('data-site-index');
const siteLabel=page.locator('.site-label[data-site-index="'+eyeIndex+'"]');
const labelEye=siteLabel.locator('.site-eye-toggle');
assert.equal(await page.locator('.site-eye-toggle:visible').count(),0,'Eyes start hidden on all map cards');
await siteLabel.hover();
assert.equal(await labelEye.isVisible(),false,'Hover must not reveal the eye');
await siteLabel.click({position:{x:3,y:3}});
assert.equal(await labelEye.isVisible(),true,'Clicking the card reveals its eye');
await labelEye.click();
assert.equal(await siteLabel.getAttribute('data-collapsed'),'true','Eye collapses the selected label');
assert.equal(await labelEye.isVisible(),false,'A collapsed card contains no eye');
assert.equal(await siteLabel.locator('.site-mini-number').isVisible(),true);
assert.match(await siteLabel.locator('.site-mini-number').textContent(),/^Пл\. №[\dА-ЯA-Z]+$/u,'Collapsed labels retain the full site-number prefix');
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().collapsedSiteCount),1);
await siteLabel.locator('.site-mini-number').click();
assert.equal(await siteLabel.getAttribute('data-collapsed'),'false','Clicking the number restores the label');
assert.equal(await labelEye.isVisible(),true,'Restoring a card selects it');
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().collapsedSiteCount),0);
await page.locator('.rockettrip-logo').click();
assert.equal(await labelEye.isVisible(),false,'Clicking outside hides the eye');
await page.screenshot({path:'qa-sites.png'});
await page.screenshot({path:'qa-steppe-intermediate.png'});
// The museum's new Saturn-IP5 entry must open in its own 3D close-up with
// the genuine parabolic dish geometry rather than a generic building.
await page.evaluate(()=>window.__BAIKONUR_QA.focusSite(window.__BAIKONUR_QA.stats().saturnIndex));
await page.waitForTimeout(450);
assert.ok((await page.locator('#title').textContent()).includes('ИП-5 «Сатурн-МС»'));
assert.ok((await page.locator('#description').textContent()).includes('предварительная'));
await page.screenshot({path:'qa-saturn-ip5.png'});
await page.locator('#detailMore').click();
const saturnDriveRefs=await page.locator('#infoExtra a[href*="drive.google.com/file/"]').count();
assert.equal(saturnDriveRefs,4,'Saturn details should link all 4 user reference photographs');
await page.locator('#close').click();
// Existing Gagarin benchmark remains unchanged.
await page.evaluate(()=>window.__BAIKONUR_QA.focusSite(0));
const closeup=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
assert.equal(closeup.gagarinDetailView,true,'Clicking Site 1 must activate dedicated pad close-up');
assert.equal(closeup.gagarinScale,overviewScale.gagarinScale,'Focusing Pad 1 must move the camera without enlarging the model');
assert.equal(closeup.visibleSites,overviewScale.visibleSites,'Inspecting Pad 1 must keep neighbouring sites visible');
await page.screenshot({path:'qa-gagarin-closeup.png'});
await page.waitForFunction(()=>document.getElementById('rocketExhibitToggle')&&!document.getElementById('rocketExhibitToggle').hidden,null,{timeout:10000});
await page.locator('#rocketExhibitToggle').click();
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarinRocketVisible),true,'Rocket exhibit must be toggled on');
await page.locator('#rocketExhibitToggle').click();
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().gagarinRocketVisible),false,'Rocket exhibit must be removable');
await page.waitForFunction(()=>[...document.querySelectorAll('.detail-card')].some(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0),null,{timeout:10000});
console.log('DETAIL CARDS',await page.locator('.detail-card:visible').count());
assert.ok((await page.locator('.detail-card:visible').count())>0,'Level 4: on-site detail cards should be visible');
const siteDetail=page.locator('.detail-card[data-site-index="0"]');
assert.equal(await siteDetail.locator('.org-logo').isVisible(),true);
await page.waitForFunction(()=>document.querySelector('#infoOrg .org-logo')?.naturalWidth>=320);
assert.equal(await page.locator('#infoOrg').getAttribute('data-org-logo'),'infracos');
assert.equal(await siteDetail.locator('.org-logo').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
await page.screenshot({path:'qa-enterprise-logos.png'});
const detailEye=siteDetail.locator('.site-eye-toggle');
assert.equal(await detailEye.isVisible(),false,'Detailed card eye starts hidden too');
await siteDetail.hover();
assert.equal(await detailEye.isVisible(),false,'Hover leaves the detailed eye hidden');
await siteDetail.click({position:{x:8,y:8}});
assert.equal(await detailEye.isVisible(),true,'Clicking the detailed card reveals its eye');
await page.keyboard.press('Escape');
assert.equal(await detailEye.isVisible(),false,'Escape dismisses the card control');
await siteDetail.focus();await siteDetail.press('Space');
assert.equal(await detailEye.isVisible(),true,'Keyboard activation also selects the card');
await detailEye.press('Enter');
assert.equal(await siteDetail.getAttribute('data-collapsed'),'true');
assert.equal(await detailEye.isVisible(),false);
assert.equal(await siteDetail.locator('.detail-mini-number').isVisible(),true);
assert.equal(await siteDetail.locator('.detail-mini-number').textContent(),'Пл. №1');
assert.equal(await siteDetail.locator('.org-logo').isVisible(),false,'Collapsed cards contain only their site number');
assert.equal(await page.locator('.site-label[data-site-index="0"]').getAttribute('data-collapsed'),'true','Collapse state stays synchronized across zoom levels');
await page.screenshot({path:'qa-collapsed-site-number.png'});
await siteDetail.locator('.detail-mini-number').press('Enter');
assert.equal(await siteDetail.getAttribute('data-collapsed'),'false','The number restores the full detail card');
assert.equal(await siteDetail.locator('.org-logo').isVisible(),true,'Restoring a card restores its enterprise logo');
assert.equal(await detailEye.isVisible(),true);
assert.equal(await page.locator('.site-label[data-site-index="0"]').getAttribute('data-collapsed'),'false');
await page.locator('.rockettrip-logo').click();
assert.equal(await detailEye.isVisible(),false);
assert.equal(await page.locator('#title').textContent(),'пл. №1 · Гагаринский старт');
const siteTags=await page.locator('.site-label:not(.is-provisional):not(.station-card) .tag').allTextContents();
assert.ok(siteTags.length>=80 && siteTags.every(v=>/^пл\. №\d/.test(v)),'All numbered site labels must use the unified «пл. №» prefix');
await page.locator('#sitesAccordion > summary').click();
assert.equal(await accordion.evaluate(el=>el.open),true);
await page.locator('#search').fill('Протон');
assert.ok(Number(await page.locator('#count').textContent())>=2,'Search by verified purpose should find both Proton sites');
await page.locator('#search').fill('');
await page.locator('#sitesAccordion > summary').click();
assert.equal(await accordion.evaluate(el=>el.open),false,'Site catalogue stays independently collapsible after filtering');
await page.locator('#detailMore').click();assert.equal(await page.locator('#infoExtra').evaluate(e=>e.style.display),'block');
assert.ok((await page.locator('#infoExtra a').count())>=1,'At least one original historical source must be linked in a site detail');
assert.ok((await page.locator('#infoExtra a[href*="drive.google.com"]').count())>=18,'Every new reference in the dedicated Drive folder must be accessible from Site 1');
assert.ok((await page.locator('#infoExtra').textContent()).includes('атрибуция площадки уточняется'),'Unconfirmed Drive shots must carry an attribution warning');
const terrain=await page.evaluate(()=>({proceduralGround:document.querySelector('canvas')!==null,flag:document.getElementById('view')!==null,gridElements:document.querySelectorAll('canvas').length}));
console.log('TERRAIN',JSON.stringify(terrain));
await page.screenshot({path:'qa-details.png'});
await page.locator('#close').click();
const restored=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
assert.equal(restored.gagarinDetailView,false,'Closing Site 1 must leave detail view');
assert.equal(restored.gagarinScale,overviewScale.gagarinScale,'Closing Pad 1 must preserve its map scale');
assert.equal(restored.visibleSites,overviewScale.visibleSites,'Closing Pad 1 must keep the same surrounding sites');
// UKSS must use separate architecture and keep the reduced map scale on focus.
const ukssOverview=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
assert.equal(ukssOverview.ukss.version,'2.0-single-petal');assert.equal(ukssOverview.ukss.trench.branches,1);
assert.equal(ukssOverview.ukssScale,.5*.28*1.5,'UKSS architecture must scale with the reduced buildings');
assert.deepEqual(ukssOverview.ukssPlacement,[635,220],'Keep Site 250 on the original schematic');
assert.equal(ukssOverview.ukss.bridge.piers,6);
assert.equal(ukssOverview.ukss.serviceTower.decks.length,11);
assert.equal(ukssOverview.ukss.lightScreens,4);
assert.ok(ukssOverview.ukss.primitiveCount>2000&&ukssOverview.ukss.renderMeshCount<70,'Detailed UKSS must remain efficient to render');
assert.ok(ukssOverview.ukssTerrainCutout>=5,'Terrain and overlays must reveal the below-grade trench');
await page.evaluate(()=>{const qa=window.__BAIKONUR_QA;qa.focusSite(qa.stats().ukssIndex)});
await page.waitForTimeout(350);
const ukssCloseup=await page.evaluate(()=>window.__BAIKONUR_QA.stats());
assert.equal(ukssCloseup.ukssScale,ukssOverview.ukssScale,'Focusing UKSS must not enlarge its physical model');
assert.equal(ukssCloseup.visibleSites,ukssOverview.visibleSites,'UKSS must keep surrounding sites visible');
assert.equal(ukssCloseup.shadersValid,true,'Terrain-cutout shaders must compile in WebGL');
assert.equal(await page.locator('#title').textContent(),'пл. №250 · УКСС «Энергия»');
assert.equal(await page.locator('#rocketExhibitToggle').isVisible(),false,'The R-7 control belongs only to Site 1');
await page.screenshot({path:'qa-ukss-closeup.png'});
// Compile the shared surface shader on both instanced beams and UV-less trench
// faces, then capture metal/concrete at a distance where the grain is visible.
assert.equal(ukssCloseup.surfaceMaterials.gagarin.version,'1.0');
assert.equal(ukssCloseup.surfaceMaterials.ukss.version,'1.0');
assert.ok(ukssCloseup.surfaceMaterials.gagarin.texturedCount>=15);
assert.ok(ukssCloseup.surfaceMaterials.ukss.texturedCount>=10);
const reviewStyle=await page.addStyleTag({content:'#ui,#info,#timeDock,#hero,.site-label,.detail-card,.flank-label{visibility:hidden!important}'});
await page.setViewportSize({width:1100,height:700});
for(const part of ['metal','concrete']){
 await page.evaluate(part=>window.__BAIKONUR_QA.inspectSurface('ukss',part),part);
 await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid),true,'Textured '+part+' must render with valid WebGL programs');
 // Let SwiftShader finish one frame instead of competing with a continuously
 // animated WebGL canvas while Chromium copies a high-detail screenshot.
 await page.evaluate(()=>{
  const original=window.requestAnimationFrame;
  let pending;
  window.requestAnimationFrame=callback=>{pending=callback;return 0};
  window.__resumeSurfaceCapture=()=>{
   window.requestAnimationFrame=original;
   if(pending)window.requestAnimationFrame(pending);
   delete window.__resumeSurfaceCapture;
  };
 });
 try{
  await page.waitForTimeout(200);
  await page.screenshot({path:'qa-ukss-'+part+'-surface.png'});
 }finally{await page.evaluate(()=>window.__resumeSurfaceCapture())}
}
await page.setViewportSize({width:1600,height:900});
await reviewStyle.evaluate(el=>el.remove());
await page.evaluate(()=>{const qa=window.__BAIKONUR_QA;qa.focusSite(qa.stats().ukssIndex)});
const ukssGeometry=await page.evaluate(async()=>{
 const THREE=await import('three');const {buildUkssPad}=await import('./src/ukss-pad.js');
 const root=new THREE.Group();buildUkssPad(root);root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),decks=root.children.filter(o=>o.userData.aperture);
 let blocked=0;for(const deck of decks){const {axis,y,radius}=deck.userData.aperture;for(let i=0;i<24;i++){const a=i*Math.PI/12;ray.set(root.localToWorld(new THREE.Vector3(axis[0]+Math.cos(a)*radius*.95,y+2,axis[1]+Math.sin(a)*radius*.95)),new THREE.Vector3(0,-1,0));blocked+=!!ray.intersectObject(deck).length}}
 ray.set(new THREE.Vector3(0,10,0),new THREE.Vector3(0,-1,0));const first=ray.intersectObject(root,true)[0];
 const result={decks:decks.length,blocked,firstY:first?.point.y};
 const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
 return result;
});
assert.equal(ukssGeometry.blocked,0,'All 11 service decks must have real circular openings');
assert.ok(ukssGeometry.firstY<0,'Launch bay must open below grade to the flame deflector');
await page.locator('#detailMore').click();
assert.equal(await page.locator('#infoExtra a[href*="drive.google.com/file/"]').count(),16,'All UKSS reference images must be available in its details');
await page.locator('#close').click();
await page.locator('#all').click();
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().ukssScale),ukssOverview.ukssScale,'Return to overview must preserve UKSS scale');
await page.evaluate(()=>{const slider=document.getElementById('year');slider.value='1955';slider.dispatchEvent(new Event('input',{bubbles:true}))});
await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().ukssCutoutEnabled===0);
await page.evaluate(()=>{const slider=document.getElementById('year');slider.value='2026';slider.dispatchEvent(new Event('input',{bubbles:true}))});
await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().ukssCutoutEnabled===1);
await page.locator('[data-layer="sites"]').uncheck();
await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().ukssCutoutEnabled===0);
await page.locator('[data-layer="sites"]').check();
await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().ukssCutoutEnabled===1);
console.log('UKSS: 6 piers, 11 open service decks, 4 light screens, below-grade trench, stable scale');
// A subpixel camera movement must not make broad terrain patches flash.
await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(1450));
await page.waitForTimeout(250);
const terrainA=(await page.screenshot()).toString('base64');
await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(1450.4));
await page.waitForTimeout(250);
const terrainB=(await page.screenshot({path:'qa-terrain-stability.png'})).toString('base64');
const stability=await page.evaluate(async([a,b])=>{
 async function pixels(data){const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(350,100,650,580).data}
 const [pa,pb]=await Promise.all([pixels(a),pixels(b)]);let changed=0,total=0;
 for(let i=0;i<pa.length;i+=4){const d=(Math.abs(pa[i]-pb[i])+Math.abs(pa[i+1]-pb[i+1])+Math.abs(pa[i+2]-pb[i+2]))/3;total+=d;if(d>24)changed++}
 return {largeChanges:changed/(pa.length/4),meanChange:total/(pa.length/4)};
},[terrainA,terrainB]);
console.log('TERRAIN STABILITY',JSON.stringify(stability));
assert.ok(stability.largeChanges<.04&&stability.meanChange<3,'Small camera movement must not create widespread terrain flicker');
await page.mouse.move(810,480);await page.mouse.down({button:'right'});
await page.mouse.move(940,430,{steps:16});await page.mouse.up({button:'right'});
await page.waitForTimeout(350);await page.screenshot({path:'qa-terrain-orbit.png'});
assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid),true,'Map and excavation shaders must remain valid during orbit');
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>window.__BAIKONUR_QA.setAltitude(1450));
await page.waitForTimeout(300);
const mobile=await page.evaluate(()=>{
 const dock=document.querySelector('#timeDock').getBoundingClientRect();
 const sidebar=document.querySelector('#ui').getBoundingClientRect();
 const logo=document.querySelector('.rockettrip-logo').getBoundingClientRect();
 return {dockFits:Math.abs(innerHeight-dock.bottom-9)<1,dockWidth:dock.width,sidebarEndsAboveDock:sidebar.bottom<=dock.top+2,logoVisible:logo.width>100&&logo.height>35};
});
console.log('MOBILE',JSON.stringify(mobile));
await verifyMenuAndGuideStack(page,'mobile-collapsed');
await page.locator('#sitesAccordion > summary').click();
await page.locator('#navigationGuide > summary').click();
await verifyMenuAndGuideStack(page,'mobile-expanded-both');
await page.locator('#navigationGuide > summary').click();
await page.locator('#sitesAccordion > summary').click();
assert.ok(mobile.dockFits&&mobile.dockWidth>=371&&mobile.sidebarEndsAboveDock&&mobile.logoVisible,'Floating timeline and expanding menu must fit mobile');
await page.screenshot({path:'qa-mobile.png'});
assert.deepEqual(errors,[],'No uncaught runtime exceptions in browser');
await browser.close();console.log('BAIKONUR 3D smoke checks PASSED: unified steppe v4, salt flats, alluvial scrub and edge-free multi-resolution earth; archival portraits and designer names restored; expanded schematic territory, natural road curves, steel tracks, six station yards and switches; 3 enterprise districts with rockets, purposes, features and fade, eye-collapse site badges and cards, пл. №, Gagarin v3 and 104 catalogue entries.');




