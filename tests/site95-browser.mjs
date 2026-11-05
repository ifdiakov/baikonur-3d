import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-site95';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SITE95_FRAME=()=>pending?.(performance.now());});
const frame=()=>page.evaluate(()=>window.__SITE95_FRAME());
try{
 await page.goto(base+'?view=site95',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.site95?.stats(),null,{timeout:180000});
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.site95.stats());assert.equal(stats.version,'20261106-site95-town-v1');assert.equal(stats.buildings.length,51);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);});
 assert.equal(await page.locator('#site95Views button').count(),5);
 await frame();await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:240000});
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.site95.groundStats())).roadY,-2.73);
 for(const view of ['all','barracks','square','utilities','top']){
  await page.locator(`[data-site95-view="${view}"]`).click();await frame();
  await page.screenshot({path:out+'/'+prefix+'-'+view+'.png'});
  const camera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());assert(camera.terrainClearance>=.13);await writeFile(out+'/'+prefix+'-'+view+'-camera.json',JSON.stringify(camera,null,2));
 }
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.site95.inspect('all');q.evening.setEvening(true);});await frame();await page.screenshot({path:out+'/'+prefix+'-night.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.site95.inspect('all');q.evening.setEvening(false);});await frame();await page.screenshot({path:out+'/'+prefix+'-mobile.png'});
 const mobile=await page.evaluate(()=>{const q=window.__BAIKONUR_QA,c=q.stats().portalArchive.models.find(m=>m.id==='pad-95').centre;return {centre:q.projectWorld(...c),cardTop:document.getElementById('info').getBoundingClientRect().top};});assert(mobile.centre.y>110&&mobile.centre.y<mobile.cardTop-25,'Town centre stays above the mobile details card');
 assert.deepEqual(errors,[]);assert(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 await page.evaluate(()=>window.__BAIKONUR_QA.openObject('pad-254'));assert(await page.locator('#site95Views').isHidden(),'Site-specific views disappear on another object');
 await writeFile(out+'/'+prefix+'-result.json',JSON.stringify({passed:true,stats,errors},null,2));console.log('SITE95_BROWSER_PASS');
}catch(error){await writeFile(out+'/'+prefix+'-failure.json',JSON.stringify({error:error.message,errors},null,2));await page.screenshot({path:out+'/'+prefix+'-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
