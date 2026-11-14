import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',mode=process.env.QA_MODE||'desktop',out='qa-publication/'+mode;
await mkdir(out,{recursive:true});const report={passed:false,mode,base,errors:[],missing:[],coverage:'Visitor-only distribution: real museum overview, 3D viewer and forbidden HTTP paths; mobile is emulated.'};let browser,page;
try{
 for(const path of ['workshop.html','docs/CURRENT_WORK.md','AGENTS.md','PROJECT_CONTEXT.md','scripts/ci/fast-check.mjs','src/workshop-panel.js','assets/preloader/_source-04.webp','assets/preloader/preloader-images.zip','data/osm/source-overpass.json.gz']){
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000)});assert.equal(response.status,404,'Private file accessible: '+path);
 }
 report.privatePathsBlocked=true;
 if(process.env.VERIFY_PUBLIC==='1'){
  report.hashes={};for(const path of ['museum.html','model-sources.html','src/model-catalog.js','src/model-facts.js','workshop/model.html','src/transport-detail-worker.bundle.js']){
   const r=await fetch(new URL(path+'?publication='+Date.now(),base),{signal:AbortSignal.timeout(20000)});assert(r.ok,path);const actual=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),expected=createHash('sha256').update(await readFile(path)).digest('hex');assert.equal(actual,expected,path);report.hashes[path]=actual;
  }
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1000,height:750},isMobile:mode==='mobile',hasTouch:mode==='mobile',reducedMotion:'reduce',serviceWorkers:'block'});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===new URL(base).origin&&r.status()>=400)report.missing.push({url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let frame;window.requestAnimationFrame=fn=>fn.name==='animate'?(frame=fn,0):native(fn);window.__PUBLICATION_FRAME=()=>frame?.();});
 await page.goto(new URL('museum.html?tour=0',base).href,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:120000});
 await page.evaluate(()=>window.__PUBLICATION_FRAME());
 report.scene=await page.evaluate(()=>{const q=__BAIKONUR_QA,s=q.stats();return {sites:s.sites,shadersValid:s.shadersValid,evening:q.evening.evening,admin:!!window.__MUSEUM_WORKSHOP,canvas:!!document.querySelector('#view canvas'),drawCalls:q.renderStats().drawCalls};});
 assert.equal(report.scene.sites,71);assert(report.scene.shadersValid);assert(report.scene.evening);assert(report.scene.canvas);assert(report.scene.drawCalls>0);assert.equal(report.scene.admin,false);
 for(const id of ['sitesAccordion','equipmentAccordion','reconstructionsAccordion','mythsAccordion','graveyardAccordion'])assert.equal(await page.locator('#'+id).count(),1,id);
 await page.screenshot({path:out+'/museum.png',timeout:45000});
 await page.evaluate(()=>__BAIKONUR_QA.modelInspector.open(['soyuz5'],'soyuz5'));
 await page.waitForFunction(()=>document.querySelector('#modelInspector iframe')?.contentWindow?.__MODEL_VIEWER_QA?.stats().ready,null,{timeout:60000});
 report.viewer=await page.evaluate(()=>document.querySelector('#modelInspector iframe').contentWindow.__MODEL_VIEWER_QA.stats());assert.equal(report.viewer.modelId,'soyuz5');assert(report.viewer.triangles>0);
 await page.screenshot({path:out+'/viewer.png',timeout:45000});
 const sourceLink=await page.frameLocator('#modelInspector iframe').locator('#modelSource').getAttribute('href');assert(sourceLink.endsWith('/model-sources.html#soyuz5'));assert((await fetch(new URL('model-sources.html',base))).ok);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!__BAIKONUR_QA.modelInspector.isOpen());
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);report.passed=true;
}catch(e){report.error=e.stack;process.exitCode=1;await page?.screenshot({path:out+'/failure.png',timeout:15000}).catch(()=>{});}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('PUBLICATION_BROWSER',JSON.stringify(report));
