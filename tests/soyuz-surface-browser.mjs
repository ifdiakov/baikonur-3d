import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-soyuz-surface',revision='soyuz-surface-20261108-v1';
await mkdir(out,{recursive:true});const report={base,errors:[],requests:[],views:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(60000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('request',request=>{if(/\/rockets\/soyuz\.(glb|json)\?/.test(request.url()))report.requests.push(request.url());});
// Freeze only continuous render loops; loading and startup tasks still run.
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>['animate','animateModel'].includes(fn.name)?0:native(fn);});
try{
 await page.goto(new URL('tests/fixtures/soyuz-surface.html',base).href);
 await page.waitForFunction(()=>window.fixtureReady);
 const fixture=await page.evaluate(()=>window.fixtureState);assert.equal(fixture.revision,revision);assert.equal(fixture.triangles,fixture.asset.triangles);assert(fixture.drawCalls<=7);
 for(const [view,angle] of [['whole',.6],['fairing',.6],['fairing',2.2],['fairing',3.8],['fairing',5.4],['body',.6],['boosters',.6],['engines',.6]]){
  report.views.push(await page.evaluate(({view,angle})=>window.fixtureRender(view,angle),{view,angle}));
  await page.screenshot({path:`${out}/${view}-${angle}.png`});
 }
 await page.goto(new URL('workshop/model.html?model=soyuz',base).href);
 await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
 await page.evaluate(()=>__MODEL_VIEWER_QA.frame());report.viewer=await page.evaluate(()=>__MODEL_VIEWER_QA.stats());
 assert.equal(report.viewer.modelId,'soyuz');assert.equal(report.viewer.triangles,fixture.asset.triangles);
 await page.screenshot({path:`${out}/viewer-desktop.png`});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().viewport[0]<400);await page.evaluate(()=>__MODEL_VIEWER_QA.frame());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/viewer-mobile.png`});
 await page.setViewportSize({width:1280,height:1000});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:240000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA&&document.body.classList.contains('museum-ready'),undefined,{timeout:240000});
 await page.waitForFunction(()=>['gagarin','site31'].every(key=>__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key===key)?.status==='ready'),undefined,{timeout:180000});
 report.placements=await page.evaluate(()=>__BAIKONUR_QA.rockets.stats().placements.filter(p=>['gagarin','site31'].includes(p.key)));
 assert.equal(report.placements.length,2);
 for(const p of report.placements){assert.equal(p.modelRevision,revision);assert.equal(p.assetStats.triangles,fixture.asset.triangles);assert.equal(p.error,null);p.metresToWorld.forEach(s=>assert(Math.abs(s-.14)<1e-8));}
 assert(report.requests.length>=5);assert(report.requests.every(url=>new URL(url).searchParams.get('v')===revision),'Both loaders request the repaired revision');
 assert.deepEqual(report.errors,[]);report.passed=true;console.log('SOYUZ_SURFACE_BROWSER_OK',JSON.stringify({revision,views:report.views.length,triangles:fixture.asset.triangles,placements:report.placements.map(p=>p.siteId)}));
}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
