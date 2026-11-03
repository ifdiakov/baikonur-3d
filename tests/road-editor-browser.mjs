import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';

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
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.roadEditor,null,{timeout:300000});
 const initial=await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats());
 assert(initial.sourceRoadPaths>100);
 assert.equal(initial.added,19,'19 owner roads including road-31 must be published');assert.equal(initial.hidden,302,'302 owner cuts must be published');
 assert.equal(initial.styleVersion,'neighbour-road-parity-v1');
 assert.equal(initial.sourceMaterialColors.asphalt,'#adb2b3','New asphalt must match OSM grey');
 assert.equal(initial.sourceMaterialColors.shoulder,'#c5c1b4','New shoulders must match old shoulders');
 assert.equal(initial.sourceMaterialColors.ground,'#b2a58d','Ground access must match OSM dirt');
 assert.equal(initial.sourceMaterialColors.highway,'#42494c','Highways must use the same asphalt material');
 assert.equal(initial.roadStyles.length,19);
 assert(initial.mesh.markedRoads>=1,'New marked access roads have no white/yellow lines');
 const northern=initial.roadStyles.find(r=>r.id==='road-31');
 assert(northern&&northern.sourceStart,'Elevated road must inherit actual original entry from OSM');
 assert(['asphalt','highway'].includes(northern.kind));
 assert(initial.maskedMeshNames.includes('OSM · единые обочины'));
 assert(initial.maskedMeshNames.includes('OSM · единое дорожное полотно'));
 assert(initial.maskedMeshNames.includes('OSM · разметка'));
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
 await page.locator('#roadEditorToggle').click();
 await page.locator('#roadEditorPanel').waitFor({state:'visible'});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).active,true);
 await page.mouse.click(850,680);await page.mouse.click(970,690);await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).draftPoints,2);
 await page.locator('#roadEditorPanel [data-action="finish"]').click();await frame();
 let snapshot=await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.snapshot());
 assert.equal(snapshot.added.length,20);assert.equal(snapshot.hidden.length,302);
 assert.equal(snapshot.added.at(-1).points.length,2);
 const road=snapshot.added.at(-1);
 assert(road.points.every(p=>p.every(Number.isFinite)));
 await page.locator('#roadEditorPanel [data-action="undo"]').click();await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,19);
 await page.locator('#roadEditorPanel [data-action="redo"]').click();await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,20);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#roadEditorPanel [data-action="export"]').click();
 const downloaded=await downloadPromise;
 const exported=JSON.parse(await readFile(await downloaded.path(),'utf8'));
 assert.equal(exported.added.length,20);assert.equal(exported.hidden.length,302);assert.equal(exported.version,1);
 await page.locator('#roadEditorImport').setInputFiles({name:'broken.json',mimeType:'application/json',
  buffer:Buffer.from('{"version":1,"added":[{"id":"bad","points":[["invalid"]]}],"hidden":[]}')});
 await page.waitForFunction(()=>document.getElementById('roadEditorStatus').textContent.includes('Ошибка импорта'));
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,20);
 // Remove a freshly built road and recover it with Undo.
 await page.locator('#roadEditorPanel [data-mode="erase"]').click();
 const center=road.points[0].map((v,i)=>(v+road.points[1][i])/2);
 const click=await page.evaluate(p=>window.__BAIKONUR_QA.projectWorld(...p),center);
 assert(click.x>320&&click.x<1220&&click.y>200&&click.y<940,
  'The editable road is under the canvas, not hidden behind a panel');
 await page.mouse.click(click.x,click.y);await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,19);
 await page.locator('#roadEditorPanel [data-action="undo"]').click();await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,20);
 await page.screenshot({path:out+'/'+prefix+'-editor.png'});
 // JSON is persistent in this browser but source OSM must not be changed.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.roadEditor,null,{timeout:300000});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.roadEditor.stats())).added,20);
 assert.equal(await page.locator('#roadEditorPanel').isVisible(),false);
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
 console.log('ROAD_EDITOR_BROWSER_PASS',JSON.stringify({sourcePaths:initial.sourceRoadPaths,erasedRoadAudit,matchedStyles:initial.roadStyles.length,paintedRoads:initial.mesh.markedRoads,importVersion:exported.version,download:downloaded.suggestedFilename()}));
}finally{
 if(errors.length)console.log('ROAD_EDITOR_PAGE_ERRORS',JSON.stringify(errors));
 await browser.close();
}
