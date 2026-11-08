import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-site31-np';await mkdir(out,{recursive:true});
const errors=[],fixtureViews=[];
const browser=await chromium.launch({headless:true,
 ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error'&&/WebGL|THREE\.WebGLProgram|GL_INVALID/i.test(message.text()))errors.push(message.text())});
 // Test-only frame gate lets SwiftShader finish screenshots of the heavy map.
 // The production render loop and animation code remain unchanged.
 await page.addInitScript(()=>{
  const raf=requestAnimationFrame.bind(window);let paused=false,pending=[];
  window.requestAnimationFrame=fn=>raf(t=>{if(paused)pending.push(fn);else fn(t)});
  window.__qaPauseFrames=()=>{paused=true};
  window.__qaResumeFrames=()=>{paused=false;const jobs=pending;pending=[];for(const fn of jobs)window.requestAnimationFrame(fn)};
 });
 await page.goto(new URL('tests/fixtures/np-photo.html',base).href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.npReady);
 for(const view of ['front','top','detail','tent-front','interior','joint','crown','doors','frame','frame-crown','night','tent-night']){
  const rendered=await page.evaluate(v=>{window.npRender(v);const {model,...image}=window.npInspect();return {...image,version:model.version,tents:model.tents.length}},view);
  assert.equal(rendered.version,'rockettrip-np-royaltent-20261109-v3');assert.equal(rendered.tents,2);
  assert(!rendered.contextLost,view+': WebGL context must survive');
  assert(rendered.calls>0&&rendered.triangles>100,view+': render actual geometry');
  assert(rendered.distinctColours>6&&rendered.channelRange>15,view+': image must contain visible geometry');
  fixtureViews.push(rendered);
  await page.screenshot({path:out+'/np-'+view+'.png',timeout:20000});
 }
 await page.goto(new URL('?view=np&tour=0&grid=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.np31?.().present&&document.body.classList.contains('museum-ready'),null,{timeout:240000});
 const state=await page.evaluate(()=>({np:__BAIKONUR_QA.np31(),site:__BAIKONUR_QA.siteState('np-31-1'),camera:__BAIKONUR_QA.cameraState(),transport:__BAIKONUR_QA.stats().transportBake}));
 assert(state.np.visible);assert.equal(state.np.instanceCount,1);assert.deepEqual(state.site.map,[912.9,304.9]);
 assert.equal(state.np.model.version,'rockettrip-np-royaltent-20261109-v3');assert.equal(state.np.model.shelters,2);
 assert.equal(state.np.model.tents.length,2);
 for(const tent of state.np.model.tents){assert.equal(tent.cornerFeet,4);assert.equal(tent.trussChords,3);assert.equal(tent.height,5.549)}
 assert(Math.hypot(state.camera.target[0]-state.np.position[0],state.camera.target[2]-state.np.position[2])<2);
 // Let the deferred detailed transport finish and ensure it never adds the old canopy.
 await page.waitForFunction(()=>!__BAIKONUR_QA.stats().transportBake.detailLoading,null,{timeout:180000});
 assert.equal(await page.evaluate(()=>__BAIKONUR_QA.np31().instanceCount),1);
 await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(false));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-map-desktop.png',timeout:30000});
 await page.evaluate(()=>window.__qaResumeFrames());
 await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(true));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-map-night.png',timeout:30000});
 await page.evaluate(()=>window.__qaResumeFrames());
 await page.evaluate(()=>__BAIKONUR_QA.evening.setEvening(false));
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>__BAIKONUR_QA.focusSite('np-31-1'));
 const mobile=await page.evaluate(()=>({camera:__BAIKONUR_QA.cameraState(),np:__BAIKONUR_QA.np31(),overflow:document.documentElement.scrollWidth>innerWidth}));
 assert(!mobile.overflow);assert(mobile.np.visible);assert.equal(mobile.np.instanceCount,1);
 assert(mobile.np.screenBounds.minX>=12&&mobile.np.screenBounds.maxX<=378,'The whole NP must fit the mobile screen');
 assert(mobile.np.screenBounds.minY>=90&&mobile.np.screenBounds.maxY<=590,'Keep the NP above the mobile card');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-map-mobile.png',timeout:30000});
 const mapScreenshot=true;
 // The public archive URL is an independent entry point. It must show the
 // canonical NP rather than its previous oversized cylindrical canopies.
 await page.setViewportSize({width:1440,height:960});
 await page.goto(new URL('archive.html?model=np-rockettrip',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__ARCHIVE_QA?.stats().some(m=>m.id==='np-rockettrip'&&m.visible),null,{timeout:120000});
 const archive=await page.evaluate(()=>__ARCHIVE_QA.stats().find(m=>m.id==='np-rockettrip'));
 assert.equal(archive.features.observationPlatform.version,'rockettrip-np-royaltent-20261109-v3');
 assert.equal(archive.features.observationPlatform.shelters,2);
 assert(Math.abs(archive.features.boundsSize[0]-50)<.75&&Math.abs(archive.features.boundsSize[2]-35)<.1,'Archive NP must be framed in physical metres, including the flag overhang');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-archive-desktop.png',timeout:30000});
 await page.evaluate(()=>window.__qaResumeFrames());
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.querySelector('#study').value),'np-rockettrip');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{window.__qaPauseFrames();resolve()})));
 await page.screenshot({path:out+'/np-archive-mobile.png',timeout:30000});
 assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({pass:true,fixtureViews,state,mobile,archive,mapScreenshot,errors},null,2));console.log('NP_ROYALTENT_BROWSER_PASS');
}catch(e){await writeFile(out+'/failure.json',JSON.stringify({message:e.message,fixtureViews,errors},null,2));throw e}finally{await browser.close()}
