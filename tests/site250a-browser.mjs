import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-site250a';await mkdir(out,{recursive:true});
let phase='start';const errors=[],consoleErrors=[],failedRequests=[];
const checkpoint=async name=>{phase=name;console.log('SITE250A_PHASE',name);await writeFile(`${out}/${prefix}-progress.json`,JSON.stringify({phase,errors,consoleErrors,failedRequests}));};
const watchdog=setTimeout(()=>{console.error('SITE250A_WATCHDOG',phase);process.exit(1);},360000);watchdog.unref();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(90000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SITE250A_FRAME=()=>pending?.(performance.now());});
const frame=()=>page.evaluate(()=>window.__SITE250A_FRAME());
try{
 await checkpoint('navigate');await page.goto(base+'?view=site250a&v=20261103-site250a-photo-v1',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:180000});
 await checkpoint('overview');const model=await page.evaluate(()=>window.__BAIKONUR_QA.site250a.stats());assert.equal(model.version,'20261103-site250a-photo-v1');
 assert.equal(await page.locator('#site250aViews button').count(),5);assert.match(await page.locator('#title').innerText(),/250А/);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.setLabelsVisible(false);q.evening.setEvening(false);});await frame();await page.screenshot({path:`${out}/${prefix}-overview.png`});
 for(const [view,label]of [['bunker','Бункер · 60'],['entrance','Вход в командный пункт'],['cryo','Криогенное хозяйство'],['top','Сверху']]){
  await checkpoint(view);await page.locator('#site250aViews button').filter({hasText:label}).click();await frame();await page.screenshot({path:`${out}/${prefix}-${view}.png`});
 }
 await checkpoint('night');await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.site250a.inspect('bunker');q.evening.setEvening(true);});await frame();await page.screenshot({path:`${out}/${prefix}-night.png`});
 await checkpoint('mobile');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.site250a.inspect('all');});await frame();await page.screenshot({path:`${out}/${prefix}-mobile.png`});
 assert(await page.locator('#site250aViews').isVisible());
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(stats.portalArchive.models.filter(s=>s.id==='pad-250a').length,1);assert(stats.catalogAliases.some(s=>s.id==='pad-250а'&&s.aliasOf==='pad-250a'));
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,model,errors,consoleErrors,failedRequests,roads:stats.transport.facilityPorts.filter(s=>s.id.startsWith('pad-250a'))},null,2));console.log('SITE250A_BROWSER_PASS');
}catch(error){await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({phase,error:error.message,errors,consoleErrors,failedRequests}));await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:10000}).catch(()=>{});throw error;}
finally{clearTimeout(watchdog);await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);}
