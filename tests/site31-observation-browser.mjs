import {mobileEnabled,mobileCoverage} from './helpers/qa-scope.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-site31-np';await mkdir(out,{recursive:true});
const errors=[],browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 // Test-only frame gate lets SwiftShader finish screenshots of the heavy map.
 // The production render loop and animation code remain unchanged.
 await page.addInitScript(()=>{
  const raf=requestAnimationFrame.bind(window);let paused=false,pending=[];
  window.requestAnimationFrame=fn=>raf(t=>{if(paused&&fn.name==='animate')pending.push(fn);else fn(t)});
  window.__qaPauseFrames=()=>{paused=true};
  window.__qaResumeFrames=()=>{paused=false;const jobs=pending;pending=[];for(const fn of jobs)window.requestAnimationFrame(fn)};
 });
 await page.goto(new URL('tests/fixtures/np-photo.html',base).href);await page.waitForFunction(()=>window.npReady);
 for(const view of ['front','top','detail','night']){
  await page.evaluate(v=>window.npRender(v),view);await page.screenshot({path:out+'/np-'+view+'.png',timeout:20000});
 }
 await page.goto(new URL('?view=np&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.np31?.().present&&document.body.classList.contains('museum-ready'),null,{timeout:240000});
 const state=await page.evaluate(()=>({np:__BAIKONUR_QA.np31(),site:__BAIKONUR_QA.siteState('np-31-1'),camera:__BAIKONUR_QA.cameraState(),transport:__BAIKONUR_QA.stats().transportBake}));
 assert(state.np.visible);assert.equal(state.np.instanceCount,1);assert.deepEqual(state.site.map,[912.9,304.9]);
 assert.equal(state.np.model.version,'rockettrip-np-royaltent-20261109-v3');assert.equal(state.np.model.shelters,2);
 assert(Math.hypot(state.camera.target[0]-state.np.position[0],state.camera.target[2]-state.np.position[2])<2);
 // Let the deferred detailed transport finish and ensure it never adds the old canopy.
 await page.waitForFunction(()=>!__BAIKONUR_QA.stats().transportBake.detailLoading,null,{timeout:180000});
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.np31().instanceCount),1);
 await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(false));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-map-desktop.png',timeout:90000});
 await page.evaluate(()=>window.__qaResumeFrames());
 let mobile=null;
 if(mobileEnabled){
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>__BAIKONUR_QA.focusSite('np-31-1'));
 mobile=await page.evaluate(()=>({camera:__BAIKONUR_QA.cameraState(),np:__BAIKONUR_QA.np31(),overflow:document.documentElement.scrollWidth>innerWidth}));
 assert(!mobile.overflow);assert(mobile.np.visible);assert.equal(mobile.np.instanceCount,1);
 assert(mobile.np.screenBounds.minX>=12&&mobile.np.screenBounds.maxX<=378,'The whole NP must fit the mobile screen');
 assert(mobile.np.screenBounds.minY>=90&&mobile.np.screenBounds.maxY<=590,'Keep the NP above the mobile card');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-map-mobile.png',timeout:90000});
 }
 const mapScreenshot=true;
 assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({pass:true,mobileCoverage,state,mobile,mapScreenshot,errors},null,2));console.log('NP_PHOTO_BROWSER_PASS');
}catch(e){await writeFile(out+'/failure.json',JSON.stringify({message:e.message,errors},null,2));throw e}finally{await browser.close()}
