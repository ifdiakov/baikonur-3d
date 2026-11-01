import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-mig25';
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);options.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1500,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(90000);
const evidence={base,errors:[],views:{},requests:[]};await mkdir(out,{recursive:true});
page.on('pageerror',e=>evidence.errors.push(e.message));page.on('request',r=>{if(/\.glb(?:\?|$)/.test(r.url()))evidence.requests.push(r.url());});
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=fn=>['animate','animateModel'].includes(fn.name)?(window.__MIG_FRAME=fn,0):native(fn);});
const stats=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());
const frame=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());
try{
 await page.goto(new URL('workshop/model.html?model=mig25ru&v=20261101-source-exhibits-v1',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
 assert.equal((await stats()).modelId,'mig25');assert.equal((await stats()).gear,true);assert.equal(evidence.requests.length,1);assert(evidence.requests[0].includes('mig25/model-v1.glb'),'Load the source MiG only');assert.equal(await page.locator('#modelTitle').innerText(),'МиГ-25');
 for(const view of ['full','front','side','top','bottom','cockpit','exhaust']){await page.locator(`[data-view="${view}"]`).click();await frame();const s=await stats();assert.equal(s.view,view);assert(s.drawCalls<=48&&s.triangles<32000);evidence.views[view]=s;await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-${view}.png`});}
 assert.equal(await page.locator('#gear').isVisible(),false,'The source model has a fixed parked pose');
 const c=await page.locator('#modelView canvas').boundingBox(),before=(await stats()).camera;await page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await page.mouse.down();await page.mouse.move(c.x+c.width*.67,c.y+c.height*.57,{steps:6});await page.mouse.up();await frame();assert.notDeepEqual((await stats()).camera,before);
 assert.equal((await stats()).dark,true);await page.locator('#light').click();assert.equal((await stats()).dark,false);await page.locator('#light').click();assert.equal((await stats()).dark,true);await page.locator('[data-view="full"]').click();await frame();await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-dark.png`});
 await page.selectOption('#modelSelect','zenit-land');await page.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().ready&&window.__MODEL_VIEWER_QA.stats().modelId==='zenit-land');assert.equal(await page.locator('#gear').isVisible(),false);assert.equal(await page.locator('[data-view="cockpit"]').isVisible(),false);
 await page.selectOption('#modelSelect','mig25');await page.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().ready&&window.__MODEL_VIEWER_QA.stats().modelId==='mig25');assert.equal((await stats()).gear,true);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().viewport[0]<400);await frame();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-mobile.png`,fullPage:true});
 // Actual equipment menu -> modal -> back to the museum, then the site card.
 await page.setViewportSize({width:1440,height:1000});await page.goto(new URL('?view=mriya',base).href,{timeout:180000});await page.waitForFunction(()=>window.__BAIKONUR_QA,undefined,{timeout:180000});
 await page.locator('#equipmentAccordion summary').click();await page.locator('[data-museum-action="mig25"]').click();await page.waitForFunction(()=>window.__BAIKONUR_QA.modelInspector.stats().ready);
 const child=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(child);await child.evaluate(()=>window.__MODEL_VIEWER_QA.frame());assert.equal((await child.evaluate(()=>window.__MODEL_VIEWER_QA.stats())).modelId,'mig25');await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-museum.png`});
 await page.locator('.model-inspector-close').click();assert.equal(await page.locator('#modelInspector iframe').count(),0);assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.cameraState())).controlsEnabled,true);
 await page.evaluate(()=>window.__BAIKONUR_QA.openObject('pad-251'));assert((await page.locator('#modelCardButton').getAttribute('data-models')).split(',').includes('mig25'));
 for(const id of ['proton','n1']){await page.evaluate(()=>{const menu=document.getElementById('equipmentAccordion');menu.open=true;});await page.locator(`[data-museum-action="${id}"]`).click();await page.waitForFunction(()=>window.__BAIKONUR_QA.modelInspector.stats().ready);const child=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert.equal(await child.evaluate(()=>window.__MODEL_VIEWER_QA.stats().modelId),id);await page.locator('.model-inspector-close').click();}
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('MIG25_BROWSER_OK',JSON.stringify({base,views:7,sourcePose:true,orbit:true,mobile:true,menu:true,siteCard:true}));
}finally{await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(evidence,null,2)+'\n');await browser.close();}
