import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const mode=process.env.QA_MODE||'desktop',out='qa-pantsirs/'+mode;
let base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const report={passed:false,mode,checks:[],hashes:{},environment:'Full museum, Chromium/SwiftShader. Mobile viewport emulation; stepped rendering in test only, not an FPS test.'};
const errors=[],shaderErrors=[],failedRequests=[];let browser,page;
await mkdir(out,{recursive:true});
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  const response=await fetch(base,{signal:AbortSignal.timeout(15000)});assert(response.ok);base=new URL('.',response.url).href;
  const files=['index.html','museum.html','workshop.html','src/shelter-road-access.js','src/earth-covered-shelters.js','src/archive-models.js','src/archive-manifest.js','data/catalog.json'];
  const hash=b=>createHash('sha256').update(b).digest('hex'),expected=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(f))])));let pending=files;const deadline=Date.now()+150000;
  do{await Promise.all(pending.map(async f=>{try{const r=await fetch(new URL(f+'?access='+expected[f].slice(0,16),base),{signal:AbortSignal.timeout(12000)});if(r.ok&&hash(Buffer.from(await r.arrayBuffer()))===expected[f])report.hashes[f]=expected[f];}catch{}}));pending=files.filter(f=>!report.hashes[f]);if(pending.length)await new Promise(r=>setTimeout(r,5000));}while(pending.length&&Date.now()<deadline);
  assert.deepEqual(pending,[],'Published application mismatch');
 }
 report.base=base;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const mobile=mode==='mobile',admin=mode==='workshop';const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
 page=await ctx.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
 await ctx.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let step;window.requestAnimationFrame=f=>f.name==='animate'?(step=f,0):raf(f);window.__ACCESS_FRAME=()=>step?.(performance.now());});
 await page.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.continue();const response=await r.fetch(),html=(await response.text()).replace('window.__BAIKONUR_QA={','window.__ACCESS_QA={THREE,objects,scene,camera,ctl,renderer,portalVoids,layers,requestTransportDetail};window.__BAIKONUR_QA={');await r.fulfill({response,body:html});});
 await page.goto(new URL((admin?'workshop':'museum')+'.html?share=site%3Apad-82&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__ACCESS_QA&&window.__MUSEUM_SHARE,null,{timeout:150000,polling:250});assert(await page.evaluate(()=>__MUSEUM_SHARE.ready));
 await page.evaluate(()=>{__ACCESS_FRAME();__ACCESS_QA.requestTransportDetail();});
 await page.waitForFunction(()=>{const s=__BAIKONUR_QA.stats().transportBake;if(s.job?.error)throw Error(JSON.stringify(s));return s.detailReady;},null,{timeout:150000,polling:250});await page.evaluate(()=>__ACCESS_FRAME());
 report.models=await page.evaluate(()=>{const d=__ACCESS_QA;return Object.fromEntries(['pad-82','pad-83'].map(id=>{const root=d.objects.find(o=>o.record.id===id).g,a=root.userData.shelterAccess,p=root.userData.pantsirModel;
  const [v0,v1]=a.sourceSegment.map(v=>new d.THREE.Vector3(...v)),t=v1.clone().sub(v0);t.y=0;t.normalize();let n=new d.THREE.Vector3(-t.z,0,t.x);const at=new d.THREE.Vector3(...a.edge),q=new d.THREE.Vector3(...a.join);if(n.dot(at.clone().sub(q))<0)n.negate();
  const probe=at.clone().addScaledVector(n,-.12);probe.y=20;
  const hits=new d.THREE.Raycaster(probe,new d.THREE.Vector3(0,-1,0)).intersectObject(d.layers.roads,true).filter(h=>/полотно|асфальт/.test(h.object.name));
  const atGate=root.localToWorld(new d.THREE.Vector3(0,20,p.front+3)),gateHit=new d.THREE.Raycaster(atGate,new d.THREE.Vector3(0,-1,0)).intersectObject(root,true)[0];
  return [id,{...a,position:root.position.toArray(),actualRoadHit:hits[0]?{y:hits[0].point.y,name:hits[0].object.name}:null,landingY:gateHit?.point.y,cutouts:d.portalVoids.stats().items.filter(v=>v.shape.source?.includes(id)).length,buried:p.buried,sharedSoil:p.sharedSoil}];}));});
 for(const id of ['pad-82','pad-83']){
  const a=report.models[id];assert(a.buried&&a.sharedSoil);assert.equal(a.cutouts,1);assert(a.landingY<a.position[1]-.6);assert(a.maxGrade<.23);assert(a.actualRoadHit,'No actual road at '+id+' join');assert(Math.abs(a.actualRoadHit.y-a.end[1])<.12,'Vertical gap at '+id+' join');
  assert(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id));await page.evaluate(()=>__ACCESS_FRAME());assert(!/панцирь/i.test(await page.locator('#info').innerText()));assert((await page.locator('#title').innerText()).includes('Заглублённое сооружение'));assert(await page.locator('#infoShare').isVisible());
  if(mode==='desktop'||id==='pad-83')await page.screenshot({path:out+'/'+id+'-access.png',timeout:60000});
 }
 report.checks.push('Both road-facing entries and real road-height joins','Both rotated terrain cutouts remain open','Both public cards omit rejected name and retain sharing');
 assert(await page.evaluate(()=>__BAIKONUR_QA.evening.evening));assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));
 const retained=await page.evaluate(()=>({town:__ACCESS_QA.objects.find(o=>o.record.id==='pad-95').g.userData.site95Model.buildings.length,halls:__ACCESS_QA.objects.find(o=>o.record.id==='pad-92').g.userData.site92Model.buildings.length}));assert.equal(retained.town,51);assert.equal(retained.halls,10);
 if(admin){assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-82'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);report.checks.push('Editor, altimeter and undo retained');}
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:20000}).catch(()=>{});process.exitCode=1;}
finally{report.errors=errors;report.shaderErrors=shaderErrors;report.failedRequests=failedRequests;await writeFile(out+'/access-report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('SHELTER_ACCESS_BROWSER',mode,report.passed);
