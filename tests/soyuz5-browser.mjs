import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-soyuz5';
await mkdir(out,{recursive:true});const report={base,errors:[],views:{}};
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(90000);
page.on('pageerror',e=>report.errors.push(e.message));
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=fn=>['animate','animateModel'].includes(fn.name)?(window.__TEST_FRAME=fn,0):native(fn);});
const stats=()=>page.evaluate(()=>__MODEL_VIEWER_QA.stats());const frame=()=>page.evaluate(()=>__MODEL_VIEWER_QA.frame());
try{
 await page.goto(new URL('workshop/model.html?model=soyuz5',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);await frame();
 assert.equal((await stats()).modelId,'soyuz5');assert.equal((await stats()).triangles,62034);assert((await stats()).drawCalls<=15);
 assert((await page.locator('#modelFacts').innerText()).includes('РД-171МВ'));assert.equal(await page.locator('#modelFactSources a').count(),3);
 for(const view of ['full','front','side','top']){await page.locator(`[data-view="${view}"]`).click();await frame();report.views[view]=await stats();assert(report.views[view].camera.every(Number.isFinite));await page.screenshot({path:`${out}/${prefix}-${view}.png`});}
 await page.locator('[data-view="full"]').click();await frame();const before=(await stats()).camera;const box=await page.locator('#modelView canvas').boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.65,{steps:5});await page.mouse.up();await frame();assert.notDeepEqual((await stats()).camera,before);
 await page.selectOption('#modelSelect','zenit-land');await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().ready&&__MODEL_VIEWER_QA.stats().modelId==='zenit-land');
 await page.selectOption('#modelSelect','soyuz5');await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().ready&&__MODEL_VIEWER_QA.stats().modelId==='soyuz5');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().viewport[0]<400);await frame();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${prefix}-mobile.png`,fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 let sourceRequests=0;page.on('request',r=>{if(r.url().includes('/soyuz5.glb'))sourceRequests++;});
 await page.goto(new URL('?view=site45',base).href,{timeout:240000});await page.waitForFunction(()=>window.__BAIKONUR_QA,undefined,{timeout:240000});
 assert.equal(sourceRequests,0,'Model is lazy and must not increase map startup downloads');
 for(const id of ['pad-42','pad-45']){await page.evaluate(id=>__BAIKONUR_QA.openObject(id),id);assert((await page.locator('#modelCardButton').getAttribute('data-models')).includes('soyuz5'));}
 assert.equal(await page.locator('[data-site45-model]').count(),2);
 for(const id of ['zenit-land','soyuz5']){
  await page.locator(`[data-site45-model="${id}"]`).click();
  await page.waitForFunction(()=>__BAIKONUR_QA.modelInspector.stats().ready);
  const modelFrame=page.frames().find(f=>f.url().includes('/workshop/model.html'));await modelFrame.waitForFunction(()=>__MODEL_VIEWER_QA.stats().ready);
  const state=await modelFrame.evaluate(()=>__MODEL_VIEWER_QA.stats());assert.equal(state.modelId,id);assert.deepEqual(state.choices,['zenit-land','soyuz5']);
  await modelFrame.evaluate(()=>__MODEL_VIEWER_QA.frame());await page.screenshot({path:`${out}/${prefix}-site45-${id}.png`});await page.locator('.model-inspector-close').click();
 }
 await page.evaluate(()=>__BAIKONUR_QA.openObject('pad-42'));assert.equal(await page.locator('[data-site45-model="soyuz5"]').isVisible(),false);
 await page.evaluate(()=>__BAIKONUR_QA.openObject('pad-45'));await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${out}/${prefix}-site45-choice-mobile.png`});await page.locator('[data-site45-model="soyuz5"]').click();await page.waitForFunction(()=>__BAIKONUR_QA.modelInspector.stats().ready);assert.equal(await page.evaluate(()=>__BAIKONUR_QA.modelInspector.stats().modelId),'soyuz5');await page.locator('.model-inspector-close').click();await page.setViewportSize({width:1440,height:1000});
 const requestsBeforeMenu=sourceRequests;
 await page.locator('#equipmentAccordion summary').click();await page.locator('[data-museum-action="soyuz5"]').click();
 await page.waitForFunction(()=>__BAIKONUR_QA.modelInspector.stats().ready,undefined,{timeout:180000});const child=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(child);await child.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);await child.evaluate(()=>__MODEL_VIEWER_QA.frame());assert.equal(await child.evaluate(()=>__MODEL_VIEWER_QA.stats().modelId),'soyuz5');assert.equal(sourceRequests,requestsBeforeMenu+1);
 await page.screenshot({path:`${out}/${prefix}-menu-dialog.png`});assert.equal(await page.evaluate(()=>__BAIKONUR_QA.cameraState().controlsEnabled),false);
 await page.locator('.model-inspector-close').click();assert.equal(await page.locator('#modelInspector iframe').count(),0);assert.equal(await page.evaluate(()=>__BAIKONUR_QA.cameraState().controlsEnabled),true);
 for(const id of ['zenit-land','soyuz5']){
  await page.goto(new URL('encyclopedia.html#site45',base).href);await page.locator(`[data-model-choice="${id}"]`).click();await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
  assert.equal((await stats()).modelId,id);assert.deepEqual((await stats()).choices,['zenit-land','soyuz5']);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;console.log('SOYUZ5_BROWSER_OK',JSON.stringify({base,views:4,mobile:true,menu:true,lazy:true,returnToMap:true}));
}finally{await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(report,null,2));await browser.close();}
