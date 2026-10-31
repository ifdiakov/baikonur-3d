import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const revision='20261031-facilities-rails-lighting-v1',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-site41';
const evidence={revision,base,prefix,views:[],errors:[],shaderErrors:[],resources:[],requests:[]};await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);
page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/i.test(m.text()))evidence.shaderErrors.push(m.text());});
page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)evidence.resources.push({url:r.url(),status:r.status()});});
page.on('requestfailed',r=>{if(new URL(r.url()).origin===new URL(base).origin)evidence.requests.push({url:r.url(),error:r.failure()?.errorText});});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SITE41_FRAME=()=>{const f=pending;pending=null;f?.(performance.now());};});
const step=()=>page.evaluate(()=>window.__SITE41_FRAME());
const state=()=>page.evaluate(()=>{const q=window.__BAIKONUR_QA,s=q.stats();return{site:q.site41.stats(),record:q.siteState('pad-41'),camera:q.cameraState(),revision:s.museumRevision,render:s.render,shadersValid:s.shadersValid,evening:s.evening.evening,power:s.evening.powerFilter};});
const elevation=c=>Math.atan2(c.position[1]-c.target[1],Math.hypot(c.position[0]-c.target[0],c.position[2]-c.target[2]))*180/Math.PI;
try{
 const url=new URL(base);url.searchParams.set('view','site41');url.searchParams.set('detail','all');
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(v=>window.__BAIKONUR_QA?.stats().museumRevision===v&&document.getElementById('museumLoading')?.dataset.state==='ready',revision,{timeout:180000});
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));await step();
 assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.locator('#site41Views button').count(),6);
 await page.locator('#site41Views button[data-site41-view="memorial"]').click();await step();
 const initial=await state();evidence.initial=initial;assert.equal(initial.site.version,'site41-photo-plan-v2');
 assert.equal(initial.site.reference.photographs.length,7);assert.equal(initial.site.reference.satellite,'1zGG6SWGEht9G7_PzKEl1qqRxX2cwdNY8');
 assert.equal(initial.site.launchAreas,2);assert.equal(initial.site.memorials,1);assert.equal(initial.site.commandPosts,1);
 assert(initial.site.panels>100);assert.equal(initial.record.geoSource.refs[0].id,169401013);
 assert(Math.abs(Math.hypot(...initial.record.geoSource.displayOffset)-30)<1e-8);
 assert(Math.hypot(initial.site.root[0]-1254.3056211164912,initial.site.root[2]+819.9510045093915)<1e-5,'The actual model follows the requested30-unit road displacement');
 assert(Math.abs(initial.site.roadWidthWorld-.84)<1e-8);assert(!initial.power.litSiteIds.includes('pad-41'));
 await page.screenshot({path:`${out}/${prefix}-memorial-card-day.png`,timeout:90000});
 await page.evaluate(()=>{document.getElementById('close')?.click();window.__BAIKONUR_QA.setLabelsVisible(false);});
 for(const view of ['all','top','memorial','command','ruins','access']){
  const ok=await page.evaluate(view=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);return q.site41.inspect(view);},view);assert(ok);await step();
  const s=await state();assert.equal(s.revision,revision);assert(s.render.drawCalls>0&&s.render.triangles>0);assert.equal(s.shadersValid,true);assert(elevation(s.camera)>=29.99);
  if(view==='top')assert(elevation(s.camera)>89);
  const projection=await page.evaluate(()=>{const q=window.__BAIKONUR_QA,c=q.cameraState();return q.projectWorld(...c.target);});
  assert(projection.x>350&&projection.x<1530&&projection.y>120&&projection.y<800,'The chosen detail is unobstructed');
  await page.screenshot({path:`${out}/${prefix}-${view}-day.png`,timeout:90000});evidence.views.push({view,camera:s.camera,projection,render:s.render});
 }
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.site41.inspect('all');q.evening.setEvening(true);});await step();
 const night=await state();assert.equal(night.evening,true);assert(!night.power.litSiteIds.includes('pad-41'));await page.screenshot({path:`${out}/${prefix}-all-evening.png`,timeout:90000});
 await page.evaluate(()=>window.__BAIKONUR_QA.evening.setEvening(false));await step();
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.shaderErrors,[]);assert.deepEqual(evidence.resources,[]);assert.deepEqual(evidence.requests,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({...evidence,passed:true,checkedAt:new Date().toISOString()},null,2));
 console.log('SITE41_BROWSER_PASS',JSON.stringify({prefix,views:evidence.views.length,photos:7,launchAreas:2,mapShift:30,errors:[]}));
}catch(error){
 await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:30000}).catch(()=>{});
 await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({...evidence,passed:false,message:error.message,stack:error.stack},null,2));throw error;
}finally{await browser.close();}
