import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const version='3.0-photo-ruins-20261110';
const localFiles=process.env.QA_LOCAL_FILES==='1';
const base=process.env.BAIKONUR_URL||(localFiles?'https://ifdiakov.github.io/baikonur-3d/':'http://127.0.0.1:8765/');
const prefix=process.env.QA_PREFIX||'local',out=process.env.QA_OUT||'qa-mik112';
await mkdir(out,{recursive:true});
const report={passed:false,base:localFiles?'Local candidate files; not a published-site check':base,version,
 environment:'Chromium; software WebGL; desktop and mobile viewport emulation. Animation is advanced by the test, not an FPS or physical-device measurement.',checks:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
let browser,page,activeMode;
const runStarted=performance.now();
const progress=phase=>console.log('MIK112_PROGRESS',activeMode,phase,Math.round((performance.now()-runStarted)/1000)+'s');

async function frame(){await page.evaluate(()=>window.__MIK112_FRAME());}
async function capture(name){
 progress('capture-start:'+name);await frame();
 await page.screenshot({path:`${out}/${prefix}-${activeMode}-${name}.png`,timeout:90000});
 progress('capture-complete:'+name);
}
async function timeline(year){
 await page.locator('#year').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},year);
}
async function modelView(view){
 await page.evaluate(view=>{
  const d=window.__MIK112_TEST,T=d.THREE,root=d.root;
  const target=new T.Vector3(-28,22,-22);
  const offsets={overview:[-280,245,-340],top:[0,520,.01],facade:[-340,145,300]};
  const offset=new T.Vector3(...offsets[view]);
  if(innerWidth<700)offset.multiplyScalar(1.6);
  const damping=d.ctl.enableDamping;d.ctl.enableDamping=false;d.ctl.update();
  d.ctl.target.copy(root.localToWorld(target.clone()));
  d.camera.position.copy(root.localToWorld(target.add(offset)));d.ctl.update();d.camera.updateMatrixWorld(true);d.ctl.enableDamping=damping;
  window.__BAIKONUR_QA.setLabelsVisible(false);document.getElementById('info').style.display='none';
 },view);
}

// Inspect rendered geometry, including instance transforms and actual rail
// heads. The model's feature declarations alone cannot make these checks pass.
async function measure(){
 return page.evaluate(()=>{
  const d=window.__MIK112_TEST,T=d.THREE,root=d.root,model=d.mik112Exhibit;
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),matrix=new T.Matrix4(),instance=new T.Matrix4(),p=new T.Vector3();
  const near=(a,b)=>Math.abs(a-b)<1e-3,doorLeaves=[],meshRows=[],features={};
  let triangles=0,drawCalls=0,vertices=0,finite=true;
  const fingerprint=array=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return (h>>>0).toString(16);};
  const childOf=(object,parent)=>{for(let n=object;n;n=n.parent)if(n===parent)return true;return false;};
  const historical=root.children.find(o=>o.name==='МИК · историческая кровля');
  const ruins=root.children.find(o=>o.name==='МИК · раскрытые разрушенные пролёты');
  const facade=root.getObjectByName('МИК112 · фасад и пожарные лестницы');
  const actualBounds=object=>{
   const bounds=new T.Box3();
   object.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position;if(!pos)return;
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
     matrix.multiplyMatrices(inverse,mesh.matrixWorld);if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);matrix.multiply(instance);}
     for(let j=0;j<pos.count;j++)bounds.expandByPoint(p.fromBufferAttribute(pos,j).applyMatrix4(matrix));
    }
   });return {min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new T.Vector3()).toArray()};
  };
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;const g=mesh.geometry,n=mesh.isInstancedMesh?mesh.count:1;
   for(const attribute of Object.values(g.attributes))for(const value of attribute.array)if(!Number.isFinite(value))finite=false;
   if(!mesh.matrixWorld.elements.every(Number.isFinite))finite=false;
   if(childOf(mesh,model.transportersGroup))return;
   triangles+=(g.index?.count??g.attributes.position.count)/3*n;vertices+=g.attributes.position.count*n;drawCalls+=Array.isArray(mesh.material)?g.groups.length||1:1;
   const declared=mesh.userData.featureInstances;
   if(Array.isArray(declared)){
    if(declared.reduce((sum,v)=>sum+v.count,0)!==n)finite=false;
    for(const {tag,count}of declared)features[tag]=(features[tag]||0)+count;
   }else if(mesh.userData.museumComponent)features[mesh.userData.museumComponent]=(features[mesh.userData.museumComponent]||0)+n;
   if(childOf(mesh,historical)||childOf(mesh,ruins)||childOf(mesh,facade))meshRows.push({name:mesh.name,parent:mesh.parent.name,visible:mesh.visible,
    positionHash:fingerprint(g.attributes.position.array),indexHash:g.index?fingerprint(g.index.array):null,
    instanceHash:mesh.isInstancedMesh?fingerprint(mesh.instanceMatrix.array):null,matrix:mesh.matrix.toArray(),instances:n});
   if(!mesh.isInstancedMesh||mesh.parent!==root)return;
   for(let i=0;i<n;i++){
    mesh.getMatrixAt(i,instance);matrix.multiplyMatrices(inverse,mesh.matrixWorld).multiply(instance);
    if(!matrix.elements.every(Number.isFinite))finite=false;
    const bounds=new T.Box3();for(let j=0;j<g.attributes.position.count;j++)bounds.expandByPoint(p.fromBufferAttribute(g.attributes.position,j).applyMatrix4(matrix));
    const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    if(near(size.y,50)&&near(size.z,1)&&near(center.z,-119.3))doorLeaves.push({center:center.toArray(),size:size.toArray()});
   }
  });
  const visibleMeshes=[];root.traverseVisible(o=>{if(o.isMesh)visibleMeshes.push(o);});
  const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),roofProbes=[];
  for(const x of [-75,-35,5])for(const z of [-80,0,80]){
   ray.set(root.localToWorld(new T.Vector3(x,85,z)),down);
   const hit=ray.intersectObjects(visibleMeshes,false)[0];
   roofProbes.push({x,z,localY:hit?root.worldToLocal(hit.point.clone()).y:null,mesh:hit?.object.name||null});
  }
  const railMeshes=[];model.transporterRails.traverse(o=>{if(o.isMesh&&o.userData.museumComponent==='transporter-running-rail')railMeshes.push(o);});
  const railProbes=[];
  for(const [trackIndex,entry]of model.railHeadEntries.entries())for(const side of [-1,1]){
   ray.set(root.localToWorld(new T.Vector3(entry[0]+side*.76,12,-250)),down);
   const hit=ray.intersectObjects(railMeshes,false)[0];
   railProbes.push({trackIndex,side,localY:hit?root.worldToLocal(hit.point.clone()).y:null});
  }
  const stairs=[];root.traverse(o=>{if(o.userData.museumComponent==='mik112-fire-stair')stairs.push({name:o.name,...actualBounds(o)});});
  return {stats:JSON.parse(JSON.stringify(model.stats())),root:{scale:root.scale.toArray(),yaw:root.rotation.y,position:root.position.toArray()},
   finite,triangles,drawCalls,vertices,features,doorLeaves:doorLeaves.sort((a,b)=>a.center[0]-b.center[0]),roofProbes,railMeshes:railMeshes.length,railProbes,stairs,
   groups:{historical:!!historical,ruins:!!ruins,facade:!!facade,historicalVisible:historical?.visible,ruinsVisible:ruins?.visible,facadeVisible:facade?.visible},
   geometrySnapshot:meshRows,transporters:model.transporterRoots.map(o=>({position:o.position.toArray(),rotationY:o.rotation.y,children:o.children.map(c=>c.name)}))};
 });
}

async function glazingState(){
 return page.evaluate(()=>{
  const root=__MIK112_TEST.root;
  const inspect=name=>{
   const group=root.getObjectByName(name);if(!group)return {exists:false};
   let visible=true;for(let o=group;o;o=o.parent)if(!o.visible)visible=false;
   let panes=0;group.traverse(o=>{if(o.isMesh&&o.material?.name==='museum / glass')panes+=o.isInstancedMesh?o.count:1;});
   return {exists:true,visible,panes};
  };
  return {temporary:inspect('МИК112 · временное историческое остекление'),original:inspect('МИК112 · целое верхнее остекление')};
 });
}

try{
 if(process.env.VERIFY_PUBLIC==='1'){
  assert(!localFiles,'Public proof cannot be generated from local request substitution');
  report.publicHashes={};
  const files=['index.html','museum.html','workshop.html','src/mik112.js','src/mik112-materials.js','src/mik112-cards.js',
   'src/buran-loss.js','src/buran-loss-scene.js','src/buran-loss.css'];
  try{await access('src/mik112-photo-detail.js');files.push('src/mik112-photo-detail.js');}catch{}
  for(const file of files){
   const expected=hash(await readFile(file));let actual;
   for(let i=0;i<18;i++){
    const response=await fetch(new URL(file+'?verify=mik112-'+Date.now(),base),{signal:AbortSignal.timeout(12000)});
    if(response.ok)actual=hash(Buffer.from(await response.arrayBuffer()));
    if(actual===expected)break;await new Promise(resolve=>setTimeout(resolve,4000));
   }
   assert.equal(actual,expected,'Published file mismatch: '+file);report.publicHashes[file]=actual;
  }
 }
 for(const mode of (process.env.QA_MODES||'desktop,mobile,workshop').split(',')){
  activeMode=mode;const mobile=mode==='mobile';
  browser=await chromium.launch({headless:process.env.HEADLESS!=='0',executablePath:process.env.CHROMIUM_PATH||undefined,
   args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle='+(process.env.BROWSER_ANGLE||'swiftshader'),
    '--ignore-gpu-blocklist','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  page=await context.newPage();page.setDefaultTimeout(90000);
  const errors=[],shaderErrors=[],failedRequests=[],requests=[];
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
  page.on('request',r=>requests.push(r.url()));
  page.on('requestfailed',r=>failedRequests.push({url:r.url(),reason:r.failure()?.errorText}));
  page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|compile shader|Error creating WebGL/i.test(m.text()))shaderErrors.push(m.text());});
  await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__MIK112_FRAME=()=>pending?.();});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());let response,body,contentType;
   if(localFiles){
    if(!url.href.startsWith(base))return route.abort();
    const path=decodeURIComponent(url.pathname.slice(new URL(base).pathname.length))||'index.html';if(path.includes('..'))throw Error('Invalid candidate path');
    try{body=await readFile(path);}catch{return route.fulfill({status:404,body:'Missing candidate asset '+path});}
    contentType=({html:'text/html',js:'application/javascript',mjs:'application/javascript',wasm:'application/wasm',json:'application/json',geojson:'application/json',css:'text/css',jpg:'image/jpeg',png:'image/png',webp:'image/webp',svg:'image/svg+xml'})[path.split('.').pop()]||'application/octet-stream';
   }else{if(request.resourceType()!=='document')return route.continue();response=await route.fetch();body=Buffer.from(await response.body());}
   if(request.resourceType()==='document'){
    const html=body.toString(),marker='window.__BAIKONUR_QA={';
    assert.equal(html.split(marker).length,2,'One existing QA entry is required');
    body=Buffer.from(html.replace(marker,'window.__MIK112_TEST={THREE,scene,camera,ctl,renderer,root:objects[mik112Index].g,mik112Exhibit,cardObjects,clickable,mik112Index,tua112Index,focusMik112};'+marker));
   }
   await route.fulfill(response?{response,body}:{body,contentType});
  });
  const entry=mode==='workshop'?'workshop.html':'museum.html';
  await page.goto(new URL(entry+'?site=pad-112&tour=0&v=mik112-photo-20261110',base).href,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')||document.getElementById('error')?.textContent,null,{timeout:150000});
  assert.equal(await page.locator('#error').textContent(),'');
  assert(await page.evaluate(()=>!!window.__MIK112_TEST),'The full museum, not a replacement model fixture, must be running');
  progress('startup-ready');
  await page.evaluate(()=>{__BAIKONUR_QA.openObject('pad-112');__MIK112_FRAME();});
  await page.waitForFunction(()=>__BAIKONUR_QA.stats().mik112.tua.status==='ready',null,{timeout:90000});
  await frame();
  const state={mode,initial:await measure()};
  const m=state.initial;
  assert.equal(m.stats.version,version);assert(m.finite);assert.equal(m.stats.transporterCount,2);
  assert.deepEqual(m.root.scale,[.14,.14,.14]);assert.equal(m.root.yaw,-Math.PI/4);
  assert(m.groups.historical&&m.groups.ruins&&m.groups.facade);assert(!m.groups.historicalVisible&&m.groups.ruinsVisible);
  assert.equal(m.stats.roofState,'photo-ruined');assert.equal(m.stats.tua.status,'ready');
  assert.equal(m.transporters.length,2);assert(m.transporters.every(t=>t.children.some(name=>name.startsWith('ТУА «Кузнечик» · исходная модель'))));
  assert.deepEqual(m.transporters.map(t=>t.position),[[-71,4.305,-183],[-19,4.305,-183]]);
  assert.equal(m.doorLeaves.length,2,'The two actual 50 m high door leaves must exist');
  for(let i=0;i<2;i++){assert(Math.abs(m.doorLeaves[i].center[0]-[-71,-19][i])<1e-4);assert(m.doorLeaves[i].size[0]>25);}
  assert.equal(m.stats.railLayout.trackCount,4);assert.equal(m.stats.railLayout.tracksPerGate,2);
  assert.equal(m.railMeshes,8,'Four tracks must have eight actual continuous running rails');
  assert.equal(m.railProbes.length,8);assert(m.railProbes.every(p=>Number.isFinite(p.localY)&&Math.abs(p.localY-4.305)<5e-4),'Actual rail heads must meet the existing four ports');
  assert(m.roofProbes.every(p=>Number.isFinite(p.localY)&&p.localY<35),'All three high bays must physically be open in the current state');
  assert.equal(m.stairs.length,2,'Both facade fire stairs must contain actual meshes');
  assert(m.stairs.every(s=>s.size[1]>25&&s.size.every(Number.isFinite)));
  assert((m.features['lower-glazing-pane']||0)>0&&((m.features['fire-stair-step']||0)>0),'New facade features must be present in drawn instance buffers');
  const application=await page.evaluate(()=>({rockets:__BAIKONUR_QA.stats().rockets,rail:__BAIKONUR_QA.stats().mik112Rail,admin:!!window.__MUSEUM_WORKSHOP,evening:__BAIKONUR_QA.evening.evening}));
  assert(!application.rockets.placements.some(p=>p.key==='mik112-hall'));assert(application.rockets.placements.some(p=>p.key==='tua-0')&&application.rockets.placements.some(p=>p.key==='tua-1'));
  assert(application.rail.connected);assert.equal(application.rail.tracks.length,4);assert.equal(application.admin,mode==='workshop');assert(application.evening);
  assert(!requests.some(u=>u.includes('/src/buran-loss.js?')),'The reconstruction must remain lazy');
  state.application=application;
  progress('model-and-rails-checked');

  // Real callout and card interactions, including ownership after GLB loading.
  await page.locator('#close').click();await page.evaluate(()=>{__BAIKONUR_QA.setLabelsVisible(true);__MIK112_FRAME();});
  state.callouts=await page.evaluate(()=>['pad-112','tua-112'].map(id=>({id,visible:[...document.querySelectorAll('[data-site-id="'+id+'"]')].some(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})})));
  assert(state.callouts.every(c=>c.visible),'MIK and TUA have separate visible map callouts');
  const tuaLabel=page.locator('.site-label[data-site-id="tua-112"] .site-label-main');
  if(await tuaLabel.isVisible())await tuaLabel.click();else await page.locator('.detail-card[data-site-id="tua-112"] .more').click();
  assert.match(await page.locator('#title').textContent(),/Кузнечики/);assert(await page.locator('#buranLossStart').isHidden());assert(await page.locator('#tua112Controls').isVisible());
  assert.equal(await page.locator('#modelCardButton').getAttribute('data-models'),'tua');
  state.picking=await page.evaluate(()=>{const d=__MIK112_TEST,indices=[];d.mik112Exhibit.transportersGroup.traverse(o=>{if(o.isMesh)indices.push(o.userData.idx);});return {meshCount:indices.length,allTua:indices.every(i=>i===d.tua112Index)};});
  assert(state.picking.meshCount>0&&state.picking.allTua);
  await page.locator('#tua112Controls button').filter({hasText:'МИК-112'}).click();assert.equal(await page.locator('#title').textContent(),'МИК-112');assert(await page.locator('#buranLossStart').isVisible());
  if(mobile){const info=await page.locator('#info').boundingBox();assert(info&&info.x>=-1&&info.x+info.width<=391,'MIK card fits the mobile screen');}
  progress('independent-cards-checked');
  await capture('card');

  await modelView('overview');await capture('three-open-bays');
  if(mode==='desktop'){await modelView('top');await capture('roof-plan');await modelView('facade');await capture('glazing-and-fire-stairs');}
  await timeline(1988);state.historical=await measure();
  assert(state.historical.groups.historicalVisible&&!state.historical.groups.ruinsVisible);
  assert.equal(state.historical.stats.roofState,'historical-intact');
  assert(state.historical.roofProbes.every(p=>p.localY>55&&p.localY<60),'The historical roof actually covers every high bay');
  await modelView('overview');await capture('historical-1988');
  await timeline(2026);const currentAgain=await measure();
  assert.deepEqual(currentAgain.geometrySnapshot,m.geometrySnapshot,'Changing the year must not mutate the model buffers or transforms');
  assert.deepEqual(currentAgain.roofProbes,m.roofProbes);
  progress('history-and-current-state-checked');

  // Exercise the production reconstruction and prove exact restoration of
  // camera/control state, modern geometry, and all hidden/restored groups.
  await page.evaluate(()=>{__BAIKONUR_QA.openObject('pad-112');__MIK112_TEST.focusMik112('all');__MIK112_FRAME();});
  state.beforeLoss={camera:await page.evaluate(()=>__BAIKONUR_QA.cameraState()),model:await measure()};
  await page.locator('#buranLossStart').click();
  await page.waitForFunction(()=>__BAIKONUR_QA.buranLoss.stats().active,null,{timeout:120000});
  await page.locator('#buranLossPlay').click();assert(!(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().playing)));
  await page.locator('#buranLossSeek').fill('0');await page.locator('#buranLossSeek').dispatchEvent('input');await frame();
  state.lossInitialGlazing=await glazingState();
  assert.deepEqual(state.lossInitialGlazing.temporary,{exists:true,visible:true,panes:20},'Before collapse the temporary upper glazing is physically present');
  assert(!state.lossInitialGlazing.original.visible,'The original historical group stays hidden during reconstruction');
  await page.locator('#buranLossSeek').fill('28');await page.locator('#buranLossSeek').dispatchEvent('input');
  state.loss=await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats());
  assert.equal(state.loss.time,28);assert(state.loss.active);assert(!state.loss.payload.intactVisible&&state.loss.payload.fragmentsVisible);assert(!state.loss.structure.dustVisible);assert.equal(state.loss.structure.flames,0);
  const hidden=await measure();assert(!hidden.groups.historicalVisible&&!hidden.groups.ruinsVisible);
  state.lossFinalGlazing=await glazingState();assert(state.lossFinalGlazing.temporary.exists&&!state.lossFinalGlazing.temporary.visible);
  await capture('reconstruction-t28');
  await page.locator('#buranLossClose').click();
  state.afterLoss={camera:await page.evaluate(()=>__BAIKONUR_QA.cameraState()),model:await measure(),reconstruction:await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats())};
  assert.deepEqual(state.afterLoss.camera,state.beforeLoss.camera,'Closing the reconstruction must restore the exact camera and controls');
  assert.deepEqual(state.afterLoss.model.geometrySnapshot,state.beforeLoss.model.geometrySnapshot,'Modern facade, ruins and historical buffers must be unchanged by the reconstruction');
  assert.deepEqual(state.afterLoss.model.groups,state.beforeLoss.model.groups);
  assert.deepEqual(state.afterLoss.model.roofProbes,state.beforeLoss.model.roofProbes);
  assert(!state.afterLoss.reconstruction.active);assert.equal(state.afterLoss.reconstruction.structure,null);assert(await page.locator('#buranLossPanel').isHidden());
  assert(!(await glazingState()).temporary.exists,'The temporary glazing clone is removed after reconstruction');
  await timeline(1988);state.restoredHistoricalGlazing=await glazingState();
  assert.deepEqual(state.restoredHistoricalGlazing.original,{exists:true,visible:true,panes:20},'Shared original glazing survives reconstruction disposal');
  await timeline(2026);assert(!(await glazingState()).original.visible);
  progress('loss-and-exact-restoration-checked');
  await modelView('overview');await capture('restored-current-ruins');
  if(mode==='workshop'){
   await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-112'));
   const height=Number(await page.locator('#wsHeight').inputValue());
   const before=await page.evaluate(()=>__MIK112_TEST.root.position.y);
   await page.locator('#wsHeight').fill(String(height+1));await page.locator('#wsApply').click();
   assert(Math.abs(await page.evaluate(()=>__MIK112_TEST.root.position.y)-before)>0.1,'Workshop height edits the actual model transform');
   await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),height);
   assert.equal(await page.evaluate(()=>__MIK112_TEST.root.position.y),before);state.workshopHeightUndo=true;
   progress('workshop-height-undo-checked');
  }
  assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);
  assert.deepEqual(failedRequests,[],'All model and reconstruction requests must complete');
  state.errors=errors;state.shaderErrors=shaderErrors;state.failedRequests=failedRequests;
  report.checks.push(state);await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(report,null,2));
  console.log('MIK112_MODE_OK',mode,JSON.stringify({version,triangles:m.triangles,drawCalls:m.drawCalls,railHeadProbes:m.railProbes.length,roofProbes:m.roofProbes.length}));
  await browser.close();browser=null;
 }
 report.passed=true;report.checkedAt=new Date().toISOString();
}catch(error){
 report.error=error.stack;report.failedMode=activeMode;
 report.startup=await page?.evaluate(()=>({message:document.getElementById('error')?.textContent,stats:window.__MUSEUM_STARTUP?.stats()})).catch(()=>null);
 await page?.screenshot({path:`${out}/${prefix}-${activeMode||'launch'}-failure.png`,timeout:15000}).catch(()=>{});
 throw error;
}finally{await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(report,null,2));await browser?.close();}
console.log('MIK112_BROWSER_PASS',report.checks.map(c=>c.mode).join(','));
