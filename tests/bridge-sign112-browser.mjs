import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const localFiles=process.env.QA_LOCAL_FILES==='1',base=process.env.BAIKONUR_URL||(localFiles?'https://ifdiakov.github.io/baikonur-3d/':'http://127.0.0.1:8765/');
const prefix=process.env.QA_PREFIX||'local',out=process.env.QA_OUT||'qa-bridge-sign112';await mkdir(out,{recursive:true});
const report={passed:false,base:localFiles?'local files, not published site':base,environment:'Chromium; software graphics; mobile screen emulation. Manual animation frames in tests, not an FPS benchmark.',checks:[]};let page,browser;
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  assert(!localFiles);report.publicHashes={};
  for(const f of ['index.html','museum.html','workshop.html','src/bridge-ground-surface.js','src/mik112-cards.js','src/road-signs.js','data/road-signs.json']){
   const expected=hash(await readFile(f));let actual;
   for(let i=0;i<18;i++){const res=await fetch(new URL(f+'?verify=bridge112-'+Date.now(),base),{signal:AbortSignal.timeout(12000)});if(res.ok)actual=hash(Buffer.from(await res.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,4000));}
   assert.equal(actual,expected,'Published file mismatch '+f);report.publicHashes[f]=actual;
  }
 }
 for(const mode of (process.env.QA_MODES||'desktop,mobile,workshop').split(',')){
  const mobile=mode==='mobile';
  browser=await chromium.launch({headless:process.env.HEADLESS!=='0',executablePath:process.env.CHROMIUM_PATH||undefined,args:process.env.BROWSER_ANGLE==='gl'?['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl','--ozone-platform=x11']:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});page=await ctx.newPage();page.setDefaultTimeout(90000);
  const errors=[],shaderErrors=[],failed=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});page.on('requestfailed',r=>failed.push({url:r.url(),reason:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION|Error creating WebGL/.test(m.text()))shaderErrors.push(m.text());});
  await page.addInitScript(()=>{let fn;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>cb.name==='animate'?(fn=cb,0):raf(cb);window.__TASK_FRAME=()=>fn?.();});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());let res,body,type;
   if(localFiles){if(!url.href.startsWith(base))return route.abort();const path=decodeURIComponent(url.pathname.slice(new URL(base).pathname.length))||'index.html';if(path.includes('..'))throw Error('Invalid local path');
    try{body=await readFile(path);}catch{return route.fulfill({status:404,body:'Missing local asset '+path});}
    type=({html:'text/html',js:'application/javascript',mjs:'application/javascript',wasm:'application/wasm',json:'application/json',geojson:'application/json',css:'text/css',jpg:'image/jpeg',png:'image/png',svg:'image/svg+xml',webp:'image/webp'})[path.split('.').pop()]||'application/octet-stream';
   }else{if(route.request().resourceType()!=='document')return route.continue();res=await route.fetch();body=Buffer.from(await res.body());}
   if(route.request().resourceType()==='document')body=Buffer.from(body.toString().replace('window.__BAIKONUR_QA={','window.__TASK={scene,camera,ctl,renderer,transport,highwaySigns,steppeSurface,cardObjects,clickable,mik112Exhibit,tuaExhibit,focusInterchange,focusMik112,requestTransportDetail,satelliteGround,tua112Index,mik112Index};window.__BAIKONUR_QA={'));
   await route.fulfill(res?{response:res,body}:{body,contentType:type});
  });
  const entry=mode==='workshop'?'workshop.html':'museum.html';await page.goto(new URL(entry+'?view=south-interchange&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')||document.getElementById('error')?.textContent,null,{timeout:150000});
  assert.equal(await page.locator('#error').textContent(),'');assert(await page.evaluate(()=>!!window.__TASK));console.log('READY',mode);
  await page.evaluate(()=>{__TASK.requestTransportDetail();__BAIKONUR_QA.setLabelsVisible(false);__TASK_FRAME();});
  await page.waitForFunction(()=>__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:150000});
  const state=await page.evaluate(()=>{
   const d=__TASK,hills=[];d.scene.traverse(o=>{if(o.userData.bridgeApproachTerrain)hills.push({name:o.name,surface:o.userData.bridgeGroundSurface,textureMatches:o.material.map===d.satelliteGround.material.map,color:o.material.color.getHexString(),referenceColor:d.satelliteGround.material.color.getHexString(),projection:o.material.userData.steppeSurface?.projection,uv:!!o.geometry.attributes.uv,vertices:o.geometry.attributes.position.count});});
   return {hills,signs:d.highwaySigns.stats(),evening:__BAIKONUR_QA.evening.evening,worker:__BAIKONUR_QA.stats().transportBake,cards:d.cardObjects.filter(o=>['pad-112','tua-112'].includes(o.record.id)).map(o=>({id:o.record.id,title:o.mapTitle,position:o.g.getWorldPosition(d.camera.position.clone()).toArray()}))};
  });
  assert.equal(state.hills.length,1);for(const h of state.hills){assert.equal(h.surface,'20261110-bridge-world-soil-v1');assert(h.textureMatches&&h.uv);assert.equal(h.color,h.referenceColor);assert.equal(h.projection,'world-xz');}
  assert(state.evening);assert.equal(state.worker.job.error,null);assert.equal(state.cards.length,2);
  const east=state.signs.locations.find(s=>s.direction==='east');assert(east.snappedToHighway);assert(east.roadCenterDistance<100);assert(Math.abs(Math.hypot(east.x-east.highwayPosition[0],east.z-east.highwayPosition[2])-(east.roadWidth/2+8))<1e-5);
  for(const v of (mode==='desktop'?['all','side']:['all'])){await page.evaluate(v=>{__TASK.focusInterchange(v);document.getElementById('info').style.display='none';__TASK_FRAME();},v);await page.screenshot({path:`${out}/${prefix}-${mode}-bridge-${v}.png`});}
  if(mode==='desktop'){
   await page.evaluate(()=>{const d=__TASK,s=d.highwaySigns.signs.find(s=>s.userData.direction==='east');d.ctl.enableDamping=false;d.ctl.target.copy(s.position).add({x:0,y:25,z:0});d.camera.position.copy(d.ctl.target).add({x:45,y:90,z:120});d.ctl.update();d.camera.updateMatrixWorld(true);__TASK_FRAME();});
   await page.screenshot({path:`${out}/${prefix}-${mode}-dirmentobe-sign.png`});
  }
  await page.evaluate(()=>{__BAIKONUR_QA.openObject('pad-112');__BAIKONUR_QA.setLabelsVisible(true);__TASK_FRAME();});
  await page.waitForFunction(()=>__BAIKONUR_QA.stats().mik112.tua.status==='ready',null,{timeout:90000});
  await page.locator('#close').click();await page.evaluate(()=>__TASK_FRAME());
  const cards=await page.evaluate(()=>['pad-112','tua-112'].map(id=>({id,visible:[...document.querySelectorAll('[data-site-id="'+id+'"]')].some(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}),title:document.querySelector('.detail-card[data-site-id="'+id+'"] .detail-title')?.textContent})));
  assert(cards.every(c=>c.visible),'Both MIK and TUA must have visible independent callouts');state.mapCards=cards;
  await page.screenshot({path:`${out}/${prefix}-${mode}-two-cards.png`});
  const tuaSelector='.site-label[data-site-id="tua-112"] .site-label-main';
  if(await page.locator(tuaSelector).isVisible())await page.locator(tuaSelector).click();else await page.locator('.detail-card[data-site-id="tua-112"] .more').click();
  assert.match(await page.locator('#title').textContent(),/Кузнечики/);assert(await page.locator('#buranLossStart').isHidden());assert(await page.locator('#tua112Controls').isVisible());assert.equal(await page.locator('#modelCardButton').getAttribute('data-models'),'tua');
  const pick=await page.evaluate(()=>{const d=__TASK,ids=[];d.mik112Exhibit.transportersGroup.traverse(o=>{if(o.isMesh)ids.push(o.userData.idx);});return {meshes:ids.length,allTua:ids.every(i=>i===d.tua112Index)};});assert(pick.meshes>0&&pick.allTua);state.picking=pick;
  await page.evaluate(()=>__TASK_FRAME());await page.screenshot({path:`${out}/${prefix}-${mode}-tua-card.png`});
  await page.locator('#tua112Controls button').filter({hasText:'МИК-112'}).click();assert.equal(await page.locator('#title').textContent(),'МИК-112');assert(await page.locator('#buranLossStart').isVisible());assert(await page.locator('#tua112Controls').isHidden());
  if(mode==='desktop'){
   await page.locator('#buranLossStart').click();await page.waitForFunction(()=>__BAIKONUR_QA.buranLoss.stats().active,null,{timeout:120000});await page.evaluate(()=>{__BAIKONUR_QA.buranLoss.pause();__BAIKONUR_QA.buranLoss.seek(28);__TASK_FRAME();});assert(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().payload.fragmentsVisible));await page.locator('#buranLossClose').click();assert(!(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().active)));state.buranLossPreserved=true;
  }
  if(mode==='workshop'){
   assert(await page.locator('#cameraAltitude').isVisible());await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-112'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);state.editingPreserved=true;
  }
  assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);
  report.checks.push({mode,...state,errors,shaderErrors,failedRequests:failed});await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(report,null,2));console.log('MODE_OK',mode);await browser.close();browser=null;
 }
 report.passed=true;
}catch(e){report.error=e.stack;report.startup=await page?.evaluate(()=>({message:document.getElementById('error')?.textContent,stats:window.__MUSEUM_STARTUP?.stats()})).catch(()=>null);await page?.screenshot({path:`${out}/${prefix}-failure.png`,timeout:15000}).catch(()=>{});throw e;}finally{await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(report,null,2));await browser?.close();}
console.log('BRIDGE_SIGN112_BROWSER_PASS',report.checks.map(c=>c.mode).join(','));
