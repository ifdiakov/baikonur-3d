import assert from 'node:assert/strict';import {mkdir,writeFile,readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{chromium}from'playwright';
const mode=process.env.QA_MODE||'desktop',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-site92-82/'+(process.env.QA_PREFIX||'local')+'-'+mode;await mkdir(out,{recursive:true});
const report={passed:false,mode,base,checks:[],errors:[],shaderErrors:[],environment:'Chromium software WebGL; mobile viewport emulation; test-only frame stepping. No physical-phone/FPS claim.'};let browser,page;
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  const names=['museum.html','workshop.html','src/site82.js','src/site92-detail.js','src/archive-buildings.js','src/archive-models.js','src/archive-manifest.js','src/osm-geography.js','data/catalog.json','data/osm/transport-geometry-bake-v1.json.gz','data/osm/road-lod-authoritative-v1.json.gz'];
  const hash=b=>createHash('sha256').update(b).digest('hex'),expected=Object.fromEntries(await Promise.all(names.map(async f=>[f,hash(await readFile(f))]))),deadline=Date.now()+120000;report.hashes={};
  do{await Promise.all(names.filter(f=>!report.hashes[f]).map(async f=>{try{const r=await fetch(new URL(f+'?revision='+expected[f].slice(0,16),base),{signal:AbortSignal.timeout(12000)});if(r.ok&&hash(Buffer.from(await r.arrayBuffer()))===expected[f])report.hashes[f]=expected[f];}catch{}}));if(names.every(f=>report.hashes[f]))break;await new Promise(r=>setTimeout(r,4000));}while(Date.now()<deadline);assert.equal(Object.keys(report.hashes).length,names.length,'Public revision does not match');
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 const mobile=mode==='mobile',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});page=await ctx.newPage();page.setDefaultTimeout(60000);
 page.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE_ERROR',e.message);});page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))report.shaderErrors.push(m.text());});
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let fn;window.requestAnimationFrame=cb=>cb.name==='animate'?(fn=cb,0):raf(cb);window.__SITES_FRAME=()=>fn?.(performance.now());});
 await page.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.continue();const res=await route.fetch();let text=await res.text();text=text.replace('window.__BAIKONUR_QA={','window.__SITES_DEBUG={objects,scene,camera,ctl,renderer,portalVoids,steppeSurface,satelliteGround};window.__BAIKONUR_QA={');await route.fulfill({response:res,body:text});});
 await page.goto(new URL((mode==='workshop'?'workshop.html':'museum.html')+'?share=site%3Apad-82&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__SITES_DEBUG,null,{timeout:150000,polling:200});await page.evaluate(()=>__SITES_FRAME());
 report.sites=await page.evaluate(()=>{const d=__SITES_DEBUG,q=__BAIKONUR_QA;return {p82:q.siteState('pad-82'),p92:q.siteState('pad-92'),p95:q.siteState('pad-95'),model82:d.objects.find(o=>o.record.id==='pad-82').g.userData.site82Model,model92:d.objects.find(o=>o.record.id==='pad-92').g.userData.site92Model,evening:q.evening.evening,shaders:q.stats().shadersValid};});
 assert(report.sites.model82.buried&&report.sites.model82.sharedGroundTexture);assert.equal(report.sites.model92.version,'20261111-site92-detail-v2');assert(Math.abs(report.sites.p92.map[0]-148.95377040780807)<1e-8);assert(report.sites.evening&&report.sites.shaders);assert.equal(report.sites.p95.map[0],167.60756141902908);
 report.checks.push('Buried82 replaces placeholder, uses shared soil and true cutout; 92 moved away, 95 unchanged');
 async function view(id,offset,target=[0,0,0],label=id){
  await page.evaluate(({id,offset,target})=>{const d=__SITES_DEBUG,q=__BAIKONUR_QA;q.openObject(id);q.arrival.stopFollowing();q.traffic.stopFollowing();d.ctl.enableDamping=false;const root=d.objects.find(o=>o.record.id===id).g;const p=root.position.clone();d.ctl.target.copy(p).add({x:target[0],y:target[1],z:target[2]});d.camera.position.copy(p).add({x:offset[0],y:offset[1],z:offset[2]});d.ctl.update();d.camera.updateMatrixWorld(true);d.renderer.render(d.scene,d.camera);},{id,offset,target});
  await page.screenshot({path:out+'/'+label+'.png',timeout:60000});
 }
 await view('pad-82',[mobile?24:18,20,30],[0,0,3],'82-entry');
 if(mode==='desktop')await view('pad-82',[.1,33,17],[0,0,1],'82-top');
 await view('pad-92',[52,70,82],[13,0,7],'92-and95');
 if(mode==='desktop')await view('pad-92',[14,25,35],[0,1,0],'92-detail');
 await page.waitForFunction(()=>__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:120000,polling:250});await page.evaluate(()=>__SITES_FRAME());report.transport=await page.evaluate(()=>__BAIKONUR_QA.stats().transportBake);assert.equal(report.transport.attempts,1);
 report.checks.push('Matching detailed transport completed once without replacing approved road edits');
 if(mode==='workshop'){
  assert(await page.locator('#cameraAltitude').isVisible());await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-82'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);report.checks.push('Altimeter, object height and undo retained');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;
}catch(e){report.error=e.stack;process.exitCode=1;await page?.screenshot({path:out+'/failure.png',timeout:15000}).catch(()=>{});}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}console.log('SITE92_82_BROWSER',JSON.stringify(report));
