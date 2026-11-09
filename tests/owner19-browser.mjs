// OWNER19_FINAL_DIAGNOSTICS
import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-owner19/local';await mkdir(out,{recursive:true});
const areas=[['t605',605.7,424.2,42],['t612',612.5,414.1,42],['05DPJT',614.2,407.4,42],['bend620',620,402.8,48],['rail605',605,423.5,48],['shoulder585',585,402.6,38],['shoulder580',580.2,404,38],['ad-rail559',559.5,406.6,56],['rail538',538.2,434.7,60],['ramp538',538.7,440.9,40],['ramp543',543.4,446.2,40],['fragment568',568.8,420,40],['fragment560',560.8,384.5,40],['rail-seam',583,385,70],['t589',589.8,377.1,42],['building589',589,342.7,45],['ukss-road',589,259.8,80]];
let browser,page;const report={passed:false,base,revision:'20261109-owner19-v2',environment:'Chromium software WebGL; frame stepping for repeatable geometry views. Mobile viewport emulation, not physical hardware or FPS benchmark.',checks:[]};
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  report.hashes={};const hash=b=>createHash('sha256').update(b).digest('hex');
  for(const f of ['index.html','museum.html','workshop.html','src/osm-transport.js','src/road-geometry-cut.js','src/road-mask-tiles.js','src/road-lod.js','src/owner-ad-refinements.js','src/owner-rail-curves.js','src/site113.js','src/site110.js','src/ukss-connections.js','src/road-editor.js','src/workshop-road-editor.js','src/owner19-surface-ownership.js','src/transport-detail-worker.bundle.js','data/road-edits-authoritative-20261103.json','data/osm/transport-geometry-bake-v1.json.gz','data/osm/road-lod-authoritative-v1.json.gz']){
   const expected=hash(await readFile(f));let actual;
   for(let i=0;i<12;i++){const r=await fetch(new URL(f+'?owner19='+Date.now(),base),{signal:AbortSignal.timeout(15000)});if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,3000));}
   assert.equal(actual,expected,'Live revision mismatch: '+f);report.hashes[f]=actual;
  }
 }
 for(const mode of (process.env.QA_MODES||'desktop,mobile,workshop').split(',')){
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1200,height:900},deviceScaleFactor:1,isMobile:mode==='mobile',hasTouch:mode==='mobile',reducedMotion:'reduce',serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];report.active={mode,events:[]};page.on('pageerror',e=>{errors.push(e.message);report.active.events.push({kind:'pageerror',message:e.stack});});page.on('console',m=>{if(m.type()==='error')report.active.events.push({kind:'console',message:m.text()});});page.on('requestfailed',r=>report.active.events.push({kind:'network',url:r.url(),message:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)report.active.events.push({kind:'http',url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let step;window.requestAnimationFrame=fn=>fn.name==='animate'?(step=fn,0):raf(fn);window.__STEP=()=>step?.();});
  await page.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.continue();const response=await r.fetch();const html=(await response.text()).replace('window.__BAIKONUR_QA={','window.__OWNER19={scene,camera,ctl,renderer,layers,siteRecords,objects,transport,roadLOD,requestTransportDetail};window.__BAIKONUR_QA={');await r.fulfill({response,body:html});});
  const started=Date.now();await page.goto(new URL((mode==='workshop'?'workshop.html':'museum.html')+'?tour=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>window.__OWNER19&&document.body.classList.contains('museum-ready')||document.querySelector('#museumRetry')?.hidden===false,null,{timeout:180000,polling:200});
  assert(await page.evaluate(()=>document.body.classList.contains('museum-ready')),await page.evaluate(()=>document.querySelector('#error')?.textContent||document.querySelector('#museumLoadingMessage')?.textContent));
  const readyMs=Date.now()-started;assert.equal(await page.evaluate(()=>__BAIKONUR_QA.evening.evening),true);assert.equal(await page.evaluate(()=>!!window.__MUSEUM_WORKSHOP),mode==='workshop');assert.equal(await page.evaluate(()=>__BAIKONUR_QA.stats().roadEditor.baselineRevision),'20261109-owner19-v2');
  await page.evaluate(()=>__OWNER19.requestTransportDetail());await page.waitForFunction(()=>__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:180000,polling:200});
  const checks=await page.evaluate(async()=>{
   const d=__OWNER19,q=__BAIKONUR_QA,T=await import('./src/vendor/three-r160/build/three.module.js');d.scene.updateMatrixWorld(true);
   d.roadLOD.update(100,d.layers.roads.children.filter(c=>c.name.startsWith('OpenStreetMap ·')).concat(d.layers.rails.children.filter(c=>c.name.startsWith('OpenStreetMap ·'))));
   const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
   const surfaces=[];d.scene.traverse(o=>{if(o.isMesh&&visible(o)&&['OSM · единое дорожное полотно','OSM · грунтовые проезды','Единое полотно редактора · asphalt','road-pavement-union'].includes(o.name))surfaces.push(o)});
   const ray=new T.Raycaster(),v=(x,z)=>new T.Vector3((x-650)*3.4,100,(z-522.5)*3.4),down=new T.Vector3(0,-1,0),collisions=[];
   for(const [x,z]of [[538.7,440.9],[543.4,446.2]])for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
    ray.set(v(x+i*.12+.003,z+j*.12+.007),down);const hits=ray.intersectObjects(surfaces,false);for(let k=1;k<hits.length;k++)if(Math.abs(hits[k].point.y-hits[k-1].point.y)<.002)collisions.push([x+i*.12,z+j*.12,hits[k].object.name]);
   }
   const junctionSamples=[];for(const [x,z]of [[589.4,377],[589.417,377.009],[589.38,376.97]]){ray.set(v(x,z),down);const hits=ray.intersectObjects(surfaces,false).filter(h=>h.point.y>.5);junctionSamples.push({map:[x,z],covered:hits.length>0,heights:hits.map(h=>h.point.y)});}
   const lodPalettes=[];d.roadLOD.root.traverse(o=>{if(o.isMesh&&o.userData.roadKind==='roads')lodPalettes.push({type:o.material.type,color:o.material.color.getHexString()});});
   const removed=d.objects.find(o=>o.record.id==='pad-110').g.userData.owner19BuildingClearance,roadIds=d.transport.editableRoadPaths().map(r=>r.id),stats=q.stats();
   return {junctionSamples,lodPalettes,revision:stats.roadEditor.baselineRevision,colors:stats.roadEditor.sourceMaterialColors,collisions,removed,roadIds,railRoutes:d.transport.routes.rail.map(r=>r.id),site113:q.site113.stats(),offsets:d.siteRecords.filter(r=>['pad-202','pad-204'].includes(r.id)),job:stats.transportBake,shaders:stats.shadersValid};
  });
  assert(checks.junctionSamples.every(p=>p.covered),'Visible T589 pavement gap: '+JSON.stringify(checks.junctionSamples));
  assert.equal(checks.lodPalettes.length,2);assert(checks.lodPalettes.every(m=>m.type==='MeshStandardMaterial'&&m.color==='555751'));
  assert.equal(checks.colors.asphalt,'#555751');assert(checks.shaders);assert.deepEqual(checks.removed.removedLocal,[-260,350]);assert.equal(checks.removed.retainedTechnicalBuildings,7);assert.equal(checks.collisions.length,0,'Ramp overlap: '+JSON.stringify(checks.collisions.slice(0,10)));
  for(const id of ['172571693','172571703','172571718','172571743','172571754','172571790','172571792','172571808','172571823','172571852','172571888'])assert(checks.roadIds.some(r=>r==='osm-road-'+id||r.startsWith('osm-road-'+id+'-')),'Missing 113 street '+id);
  assert(!checks.roadIds.some(id=>/^osm-road-(443174416|172704752|172704782)(?:-|$)/.test(id)));assert(!checks.railRoutes.some(id=>id.startsWith('owner-rail-continuity')));assert.equal(checks.job.attempts,1);
  await page.evaluate(()=>{__BAIKONUR_QA.site113.inspect('top');__STEP()});await page.screenshot({path:out+'/'+mode+'-site113.png',timeout:120000});
  if(mode==='desktop'){
   const style=await page.addStyleTag({content:'body>:not(#view){visibility:hidden!important}#view,#view canvas{visibility:visible!important}'});
   for(const [name,x,y,h]of areas){
    await page.evaluate(({x,y,h})=>{const d=__OWNER19,wx=(x-650)*3.4,wz=(y-522.5)*3.4;d.ctl.enableDamping=false;d.ctl.maxPolarAngle=Math.PI/2;d.ctl.target.set(wx,0,wz);d.camera.position.set(wx,h,wz+.01);d.ctl.update();d.camera.updateMatrixWorld(true);d.roadLOD.update(100,d.layers.roads.children.filter(c=>c.name.startsWith('OpenStreetMap ·')).concat(d.layers.rails.children.filter(c=>c.name.startsWith('OpenStreetMap ·'))));d.renderer.render(d.scene,d.camera);},{x,y,h});
    await page.screenshot({path:out+'/'+name+'.png',timeout:120000});
    if(name==='t605')for(const height of [500,1000]){
     await page.evaluate(height=>{const d=__OWNER19;d.roadLOD.update(height,d.layers.roads.children.filter(c=>c.name.startsWith('OpenStreetMap ·')).concat(d.layers.rails.children.filter(c=>c.name.startsWith('OpenStreetMap ·'))));d.renderer.render(d.scene,d.camera);},height);
     await page.screenshot({path:out+'/'+name+'-lod-'+height+'.png',timeout:120000});
    }
    if(name.startsWith('ramp')){await page.evaluate(()=>{const d=__OWNER19;d.camera.position.z+=14;d.camera.lookAt(d.ctl.target);d.camera.updateMatrixWorld(true);d.renderer.render(d.scene,d.camera)});await page.screenshot({path:out+'/'+name+'-oblique.png',timeout:120000});}
   }
   await style.evaluate(e=>e.remove());
  }
  if(mode==='workshop'){await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-204'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.2));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);}
  assert.deepEqual(errors,[]);report.checks.push({mode,readyMs,detailMs:Date.now()-started,...checks,errors});await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();browser=null;
 }
 report.passed=true;
}catch(e){report.error=e.stack;report.failureState=await page?.evaluate(()=>({error:document.querySelector('#error')?.textContent,loading:document.querySelector('#museumLoadingMessage')?.textContent,startup:window.__MUSEUM_STARTUP?.stats?.(),ready:document.body.classList.contains('museum-ready')})).catch(()=>null);await page?.screenshot({path:out+'/failure.png',timeout:30000}).catch(()=>{});throw e;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close()}
console.log('OWNER19_BROWSER_PASS',JSON.stringify(report.checks.map(({mode,readyMs,collisions})=>({mode,readyMs,rampOverlapCount:collisions.length}))));
