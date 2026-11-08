import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-road-editor';await mkdir(out,{recursive:true});
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
const browser=await chromium.launch(options),page=await browser.newPage({
 viewport:{width:1600,height:1000},acceptDownloads:true,ignoreHTTPSErrors:true});
page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window);let pending;
 window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);
 window.__ROAD_EDITOR_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};
});
const frame=()=>page.evaluate(()=>window.__ROAD_EDITOR_FRAME());
try{
 // Full-precision pavement audit explicitly exercises the legacy detailed
 // renderer; production overview now uses precompiled owner-filtered LOD.
 await page.goto(new URL('?legacyRoads=1',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.roadEditor,null,{timeout:300000});
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats());
 assert(initial.sourceRoadPaths>100);
 assert.equal(initial.added,19,'19 approved roads must include the repaired Site 105 approach without 250A road-7');assert.equal(initial.hidden,286,'286 valid cuts after 250A obsolete roads are cleaned');
 assert.equal(initial.styleVersion,'neighbour-road-parity-v1');
 assert.equal(initial.sourceMaterialColors.asphalt,'#555751','New asphalt must match OSM grey');
 assert.equal(initial.sourceMaterialColors.shoulder,'#c5c1b4','New shoulders must match old shoulders');
 assert.equal(initial.sourceMaterialColors.ground,'#b2a58d','Ground access must match OSM dirt');
 assert.equal(initial.sourceMaterialColors.highway,'#42494c','Highways must use the same asphalt material');
 assert.equal(initial.roadStyles.length,19);
 assert.equal(initial.baselineRevision,'rockettrip-roads-v5-20261108-site105-continuous-driveway');
 assert(!initial.roadStyles.some(r=>r.id==='road-7'),'Duplicate 250A asphalt is rendered');
 assert(initial.mesh.markedRoads>=1,'New marked access roads have no white/yellow lines');
 const northern=initial.roadStyles.find(r=>r.id==='road-31');
 assert(northern&&northern.sourceStart,'Elevated road must inherit actual original entry from OSM');
 assert(['asphalt','highway'].includes(northern.kind));
 assert(initial.maskedMeshNames.includes('OSM · единые обочины'));
 assert(initial.maskedMeshNames.includes('OSM · единое дорожное полотно'));
 assert(initial.maskedMeshNames.includes('OSM · разметка'));
 assert.equal(initial.physicalCuts.version,'source-matched-pavement-v6');
 assert(initial.physicalCuts.restoredCrossings>0,'The owner deletion must preserve at least one adjoining live road');
 assert(initial.physicalCuts.meshes>=7,'Physical cutouts must cover the original asphalt, shoulder and paint batches');
 assert(initial.physicalCuts.clipped>0,'The old source road triangles were not physically deleted');
 assert(initial.physicalCuts.sourceCuts>=250,'Most owner cuts were not loaded as physical removal corridors');
 const erasedRoadAudit=await page.evaluate(()=>{
  const editor=window.__BAIKONUR_QA.roadEditor,cuts=editor.snapshot().hidden;
  let checked=0,covered=0,shoulderChecked=0,shoulderCovered=0;
  for(const h of cuts){
   const p=h.points;
   let length=0,index=1;
   for(let i=1;i<p.length;i++){
    const segment=Math.hypot(p[i][0]-p[i-1][0],p[i][2]-p[i-1][2]);
    if(segment>length){length=segment;index=i;}
   }
   if(length<1.0)continue; // Source trace is below one world unit.
   const a=p[index-1],b=p[index],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,z=(a[2]+b[2])/2;
   const mask=editor.maskAt(x,z,y);
   checked++;if(mask.cut)covered++;
   const nx=-(b[2]-a[2])/length,nz=(b[0]-a[0])/length;
   const xEdge=x+nx*(h.width/2+.22),zEdge=z+nz*(h.width/2+.22);
   shoulderChecked++;if(editor.maskAt(xEdge,zEdge,y).cut)shoulderCovered++;
  }
  return {checked,covered,shoulderChecked,shoulderCovered};
 });
 assert(erasedRoadAudit.checked>=245,'Road erasure audit did not cover enough user cuts');
 assert(erasedRoadAudit.covered>=erasedRoadAudit.checked*.97,
  'Removed OSM asphalt is still visible in the editor stencil: '+JSON.stringify(erasedRoadAudit));
 assert(erasedRoadAudit.shoulderCovered>=erasedRoadAudit.shoulderChecked*.95,
  'Deleted OSM roads still leave outlines along the shoulders: '+JSON.stringify(erasedRoadAudit));

 assert(initial.maskTiles.length===5&&initial.maskTiles.some(t=>t.enabled));
 assert(initial.maskTiles.every(t=>!t.enabled||t.worldUnitsPerPixel<.5),'Mask must not tear a 1.6-unit service road');
 assert(initial.mask.duplicateCuts>=10,'Exact duplicate owner cuts must be coalesced in rendering');
 // Existing owner-authored roads, joins and removals remain visible, but editing
 // controls must not exist in the published museum.
 assert.equal(initial.readOnly,true,'Published road overlay is view-only');
 assert.equal(initial.active,false,'Road editing is not active');
 assert.equal(await page.locator('#roadEditorToggle,#roadEditorPanel,#roadEditorImport').count(),0,
  'No road editor controls or panel remain in the document');
 const original=await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.snapshot());
 assert(!original.added.some(r=>r.id==='road-7'),'The rendered scheme still has 250A road-7');
 assert(!original.hidden.some(h=>['museum-yubileiny-250a-ukss','osm-access-pad-250a','osm-road-54568055','osm-road-54568055-1'].includes(h.sourceId)),
 'Stale road cutouts remain at 250A');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.setActive(true)),false,
  'Read-only road renderer must reject activation even through the QA reference');
 await page.mouse.click(850,680);await page.mouse.click(970,690);await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).active,false);
 assert.deepEqual(await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.snapshot()),original,
  'Map clicks cannot create, erase or alter roads');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.roadEditor,null,{timeout:300000});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,original.added.length);
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).hidden,original.hidden.length);
 assert.equal(await page.locator('#roadEditorToggle,#roadEditorPanel').count(),0);
 // The road audit covers the real museum camera, not just off-screen meshes.
 // Save three close-up images for source geometry / rendered-pavement review.
 for(const [id,range,label] of [
  ['road-3',75,'gagarin-junction'],
  ['road-26',75,'ground-hairpin'],
  ['road-31',155,'northern-elevated-road']
 ]){
  const view=await page.evaluate(({id,range})=>{
   const qa=window.__BAIKONUR_QA,road=qa.inspectEditedRoad(id,{range});
   if(!road)return null;
   return {...road,projected:qa.projectWorld(...road.position)};
  },{id,range});
  assert(view&&view.points>20,'Road '+id+' missing or insufficiently sampled in the live scene');
  assert(view.projected.x>0&&view.projected.x<1600,'Road '+id+' outside QA view horizontally');
  assert(view.projected.y>0&&view.projected.y<1000,'Road '+id+' outside QA view vertically');
  await frame();
  await page.screenshot({path:out+'/'+prefix+'-'+label+'.png'});
 }
 assert.deepEqual(errors,[]);
 console.log('ROADS_READ_ONLY_BROWSER_PASS',JSON.stringify({sourcePaths:initial.sourceRoadPaths,erasedRoadAudit,matchedStyles:initial.roadStyles.length,paintedRoads:initial.mesh.markedRoads,added:original.added.length,hidden:original.hidden.length}));
}finally{
 if(errors.length)console.log('ROAD_EDITOR_PAGE_ERRORS',JSON.stringify(errors));
 await browser.close();
}
