import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const mode=process.env.QA_MODE||'desktop',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const out='qa-delivery/security-'+mode;
await mkdir(out,{recursive:true});
const report={passed:false,mode,base,errors:[],coverage:'Real viewer input rejection, existing model rendering and controls; desktop/mobile viewport emulation, not physical-device performance.'};
let browser,page;
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  report.hashes={};
  for(const path of ['src/model-catalog.js','src/model-viewer.js','src/model-inspector.js','src/inspection-models.js','workshop/model.html']){
   const expected=createHash('sha256').update(await readFile(path)).digest('hex');
   const response=await fetch(new URL(path+'?security-proof='+expected.slice(0,16),base),{signal:AbortSignal.timeout(15000)});
   assert(response.ok,path);
   const actual=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
   assert.equal(actual,expected,'Published security fix differs: '+path);report.hashes[path]=actual;
  }
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1280,height:900},isMobile:mode==='mobile',hasTouch:mode==='mobile',reducedMotion:'reduce',serviceWorkers:'block'});
 page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));
 const stats=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());
 const ready=()=>page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready,null,{timeout:45000});
 const url=new URL('workshop/model.html',base);
 url.searchParams.set('model','soyuz5');url.searchParams.set('models','constructor,soyuz5,__proto__,toString,../../data/catalog.json');
 await page.goto(url.href,{waitUntil:'domcontentloaded'});await ready();
 assert.equal((await stats()).modelId,'soyuz5');assert.deepEqual((await stats()).choices,['soyuz5']);
 assert((await stats()).drawCalls>0);assert((await stats()).triangles>0);
 assert((await page.locator('#modelTitle').innerText()).includes('Союз-5'));
 report.validModel=await stats();
 for(const id of ['constructor','__proto__','toString','../../data/catalog.json']){
  await page.evaluate(id=>window.__MODEL_VIEWER_QA.load(id),id);
  assert.equal((await stats()).modelId,'soyuz5');assert.equal((await stats()).ready,true);
 }
 const rejected=await page.evaluate(async()=>{
  const {installModelInspector}=await import('../src/model-inspector.js?v=20261114-security1');
  const inspector=installModelInspector();
  return {accepted:inspector.open(['constructor','__proto__','toString']),state:inspector.stats()};
 });
 assert.equal(rejected.accepted,false);assert.equal(rejected.state.open,false);assert.equal(rejected.state.frames,0);report.inspectorRejected=rejected;
 await page.locator('[data-view="front"]').click();assert.equal((await stats()).view,'front');assert.equal((await stats()).autoRotate,false);
 await page.locator('#rotate').click();assert.equal((await stats()).autoRotate,true);
 const before=(await stats()).camera;
 await page.waitForFunction(before=>window.__MODEL_VIEWER_QA.stats().camera.some((x,i)=>Math.abs(x-before[i])>.001),before);
 await page.locator('#rotate').click();assert.equal((await stats()).autoRotate,false);report.rotationMoved=true;
 const dark=(await stats()).dark;await page.locator('#light').click();assert.equal((await stats()).dark,!dark);await page.locator('#light').click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/soyuz5-controls.png',fullPage:true});
 url.searchParams.set('model','constructor');url.searchParams.set('models','constructor,__proto__,toString');
 await page.goto(url.href,{waitUntil:'domcontentloaded'});await ready();
 assert.equal((await stats()).modelId,'soyuz');assert.deepEqual((await stats()).choices,['soyuz']);
 assert((await stats()).triangles>0);assert.equal(await page.locator('#modelStatus').isVisible(),false);
 assert(!(await page.title()).includes('undefined'));assert((await page.locator('#modelTitle').innerText()).includes('Союз'));
 report.fallback=await stats();await page.screenshot({path:out+'/invalid-id-fallback.png',fullPage:true});
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=error.stack;await page?.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('SECURITY_VIEWER_BROWSER',JSON.stringify(report));
