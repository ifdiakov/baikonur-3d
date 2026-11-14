import {mobileEnabled,mobileCoverage} from './helpers/qa-scope.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-checkpoint7';await mkdir(out,{recursive:true});
let phase='start';const errors=[],consoleErrors=[],failedRequests=[];
const checkpoint=async name=>{phase=name;console.log('CHECKPOINT7_PHASE',name);await writeFile(`${out}/${prefix}-progress.json`,JSON.stringify({phase,errors,consoleErrors,failedRequests}));};
const watchdog=setTimeout(()=>{console.error('CHECKPOINT7_WATCHDOG',phase);process.exit(1);},360000);watchdog.unref();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(90000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__CHECKPOINT7_FRAME=()=>pending?.(performance.now());});
const frame=()=>page.evaluate(()=>window.__CHECKPOINT7_FRAME());
try{
 await checkpoint('navigate');await page.goto(base+'?view=kpp7&v=20261103-checkpoint7-flat-v2',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:180000});
 const model=await page.evaluate(()=>window.__BAIKONUR_QA.checkpoint7.stats());assert.equal(model.version,'20261103-checkpoint7-flat-v2');assert(model.ground.flatGround);assert.equal(model.ground.addedTerrainMeshes,0);assert(Math.abs(model.placement.position[1]+2.73)<.001);
 assert.equal(await page.locator('#checkpoint7Views button').count(),4);assert.equal(await page.locator('#title').innerText(),'КПП №7');
 assert(model.placement.station>model.placement.bridgeStation&&model.placement.station<model.placement.turnoffStation);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.setLabelsVisible(false);q.evening.setEvening(false);});
 for(const [view,label]of [['all','КПП целиком'],['front','Фасад'],['lanes','Проезды'],['road','На дороге']]){
  await checkpoint(view);await page.locator('#checkpoint7Views button').filter({hasText:label}).click();await frame();await page.screenshot({path:`${out}/${prefix}-${view}.png`});
 }
 await checkpoint('oblique');await page.evaluate(()=>window.__BAIKONUR_QA.checkpoint7.inspect('front'));
 await page.mouse.move(850,460);await page.mouse.down({button:'right'});await page.mouse.move(1000,480,{steps:12});await page.mouse.up({button:'right'});await page.mouse.wheel(0,-120);await frame();await page.screenshot({path:`${out}/${prefix}-oblique.png`});
 await checkpoint('night');await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.checkpoint7.inspect('all');q.evening.setEvening(true);});await frame();await page.screenshot({path:`${out}/${prefix}-night.png`});
 if(mobileEnabled){
 await checkpoint('mobile');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.checkpoint7.inspect('all');});await frame();await page.screenshot({path:`${out}/${prefix}-mobile.png`});
 assert(await page.locator('#checkpoint7Views').isVisible());
 assert.equal(await page.locator('#description').isVisible(),false,'Mobile card initially leaves the model visible');
 const panel=await page.locator('#info').boundingBox(),header=await page.locator('#ui').boundingBox();
 assert(panel.y-header.y-header.height>180,'Mobile controls leave at least 180 pixels for the scene');
 await page.locator('#detailMore').click();assert(await page.locator('#description').isVisible());await page.locator('#detailMore').click();
 for(const button of await page.locator('#checkpoint7Views button').all()){const r=await button.boundingBox();assert(r.x>=0&&r.x+r.width<=390);}
 }
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);
 assert(!consoleErrors.some(e=>/ReferenceError|TypeError|SyntaxError|shader error/i.test(e)),consoleErrors.join('\n'));
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(stats.portalArchive.models.filter(s=>s.id==='kpp-7').length,1);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,mobileCoverage,model,errors,consoleErrors,failedRequests,render:stats.render},null,2));console.log('CHECKPOINT7_BROWSER_PASS');
}catch(error){await writeFile(`${out}/${prefix}-failure.json`,JSON.stringify({phase,error:error.message,errors,consoleErrors,failedRequests}));await page.screenshot({path:`${out}/${prefix}-failure.png`,timeout:10000}).catch(()=>{});throw error;}
finally{clearTimeout(watchdog);await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);}
