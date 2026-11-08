import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-rd180';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(90000);const errors=[],report={};page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
try{
 await page.goto(new URL('workshop/model.html?model=rd180',base).href);await ready();
 report.initial=await page.evaluate(()=>__MODEL_VIEWER_QA.stats());assert.equal(report.initial.triangles,26398);assert(report.initial.drawCalls<=5);assert(report.initial.autoRotate);
 const a=report.initial.camera;await page.waitForTimeout(700);assert.notDeepEqual(await page.evaluate(()=>__MODEL_VIEWER_QA.stats().camera),a);
 for(const view of ['full','front','side','top']){await page.locator(`[data-view="${view}"]`).click();await page.screenshot({path:`${out}/${view}.png`});assert.equal(await page.evaluate(()=>__MODEL_VIEWER_QA.stats().autoRotate),false);}
 await page.locator('[data-view="full"]').click();await page.screenshot({path:`${out}/desktop.png`});
 assert.equal(await page.locator('#modelFacts [data-related-id]').count(),11);
 for(const id of ['atlas5','katorgin','energomash','slc41','site45']){
  await page.locator(`[data-related-id="${id}"]`).click();await page.waitForFunction(id=>location.hash==='#'+id&&document.querySelector('#detail h2')?.textContent.length>0,id);report[id]=await page.locator('#detail h2').innerText();
  await page.goto(new URL('workshop/model.html?model=rd180',base).href);await ready();
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/mobile.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(new URL('encyclopedia.html#rd180',base).href);await page.waitForFunction(()=>document.querySelector('.detail-model-stage')?.dataset.modelStatus==='museum-asset');
 assert.equal(await page.locator('#detail [data-related-id]').count(),11);await page.locator('#detail [data-related-id="slc3e"]').click();assert.match(await page.locator('#detail h2').innerText(),/SLC-3E/);
 await page.setViewportSize({width:1440,height:1000});await page.goto(new URL('?view=rd180',base).href,{timeout:240000});await page.waitForFunction(()=>window.__BAIKONUR_QA?.modelInspector.stats().ready,undefined,{timeout:240000});
 const child=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(child);await child.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);assert.equal(await child.evaluate(()=>__MODEL_VIEWER_QA.stats().modelId),'rd180');
 await page.screenshot({path:`${out}/museum-dialog.png`});await child.locator('[data-related-id="energomash"]').click();await page.waitForURL('**/encyclopedia.html#energomash');assert.equal(page.frames().length,1,'Related link must escape the model iframe');
 assert.deepEqual(errors,[]);report.passed=true;console.log('RD180_BROWSER_OK',JSON.stringify(report));
}finally{await writeFile(`${out}/report.json`,JSON.stringify({...report,errors},null,2));await browser.close();}
