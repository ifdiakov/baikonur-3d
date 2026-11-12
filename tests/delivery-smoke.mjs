import {checkRemovedMapGroups} from './map-group-removal-browser-checks.mjs';
import {installCameraLabelProbe,checkCameraLabels} from './camera-labels-browser.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const mode=process.env.QA_MODE||'desktop',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-delivery/'+mode,cameraLabels=process.env.QA_CAMERA_LABELS==='1';
await mkdir(out,{recursive:true});const report={passed:false,mode,base,coverage:'Complete scene and retained controls; nine removed groups; optional exact camera/label profile. Software WebGL and mobile viewport emulation, not physical phone or FPS.'},errors=[],failed=[];let browser,page;
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 const entry=mode==='workshop'?'workshop.html':'museum.html';
 if(process.env.VERIFY_PUBLIC==='1'){
  report.hashes={};const names=[entry,'src/museum-startup.js','src/steppe-surface.js','src/workshop-panel.js','src/map-visible-sites.js',...(cameraLabels?['src/map-view-policy.js','src/camera-navigation.js','src/airport-views.js']:[])];
  for(const name of names){const expected=hash(await readFile(name)),deadline=Date.now()+120000;let actual;
   do{const r=await fetch(new URL(name+'?verify='+expected.slice(0,16),base),{signal:AbortSignal.timeout(12000)});if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,3000));}while(Date.now()<deadline);
   assert.equal(actual,expected,'Public bytes do not match '+name);report.hashes[name]=actual;
  }
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1200,height:800},deviceScaleFactor:1,isMobile:mode==='mobile',hasTouch:mode==='mobile',serviceWorkers:'block'});page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let frame;window.requestAnimationFrame=fn=>fn.name==='animate'?(frame=fn,0):raf(fn);window.__DELIVERY_FRAME=()=>frame?.();});
 const start=Date.now(),initial=new URL(entry+'?tour=0',base).href,real=(await fetch(initial,{signal:AbortSignal.timeout(20000)})).url;report.navigation=real;
 if(cameraLabels)await installCameraLabelProbe(page);
 await page.goto(real,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:120000,polling:200});report.readyMs=Date.now()-start;
 await page.evaluate(()=>window.__DELIVERY_FRAME());
 report.scene=await page.evaluate(()=>{const q=__BAIKONUR_QA,s=q.stats();return {sites:s.sites,shadersValid:s.shadersValid,evening:q.evening.evening,admin:!!window.__MUSEUM_WORKSHOP,menu:document.querySelectorAll('#ui .sites-accordion-title').length,canvas:!!document.querySelector('#view canvas')};});
 assert(report.scene.sites>80);assert(report.scene.shadersValid);assert(report.scene.evening);assert(report.scene.canvas);assert(report.scene.menu>=4);assert.equal(report.scene.admin,mode==='workshop');
 if(mode==='workshop'){assert(await page.locator('#workshopPanel').isVisible());assert(await page.locator('#cameraAltitude').isVisible());}
 await page.screenshot({path:out+'/overview.png',timeout:60000});
 report.groupRemoval=await checkRemovedMapGroups(page,mode);
 await page.screenshot({path:out+'/retained-site175.png',timeout:60000});
 if(cameraLabels)report.cameraLabels=await checkCameraLabels(page,mode,out);
 assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:20000}).catch(()=>{});process.exitCode=1;}finally{report.errors=errors;report.failedRequests=failed;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('DELIVERY_SMOKE',JSON.stringify(report));
