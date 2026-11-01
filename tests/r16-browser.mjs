import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-r16';
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);options.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(180000);await mkdir(out,{recursive:true});
const evidence={base,errors:[],assetRequests:[]};page.on('pageerror',e=>evidence.errors.push(e.message));page.on('request',r=>{if(/r16\.(glb|json)/.test(r.url()))evidence.assetRequests.push(r.url());});
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))evidence.errors.push(m.text());});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=f=>['animate','animateModel'].includes(f.name)?(pending=f,0):native(f);window.__R16_FRAME=()=>{const f=pending;pending=null;f?.(performance.now());};});
const shot=async name=>{await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:120000});console.log('R16_VIEW',name);};
try{
 await page.goto(new URL('workshop/model.html?model=r16',base).href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);await page.evaluate(()=>__MODEL_VIEWER_QA.frame());
 evidence.viewer=await page.evaluate(()=>({version:__MODEL_VIEWER_QA.version,...__MODEL_VIEWER_QA.stats()}));assert.equal(evidence.viewer.modelId,'r16');assert.equal(evidence.viewer.version,'r16-reference-v2');assert(evidence.viewer.drawCalls<=40);
 for(const view of ['full','front','side','top']){await page.locator(`[data-view="${view}"]`).click();await page.evaluate(()=>__MODEL_VIEWER_QA.frame());await shot(view);}
 await page.locator('[data-view="full"]').click();await page.locator('#light').click();await page.evaluate(()=>__MODEL_VIEWER_QA.frame());await shot('light-background');
 const before=await page.evaluate(()=>__MODEL_VIEWER_QA.stats().camera);await page.mouse.move(900,400);await page.mouse.down();await page.mouse.move(1050,470,{steps:8});await page.mouse.up();await page.evaluate(()=>__MODEL_VIEWER_QA.frame());assert.notDeepEqual(await page.evaluate(()=>__MODEL_VIEWER_QA.stats().camera),before);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.locator('[data-view="full"]').click();await page.evaluate(()=>__MODEL_VIEWER_QA.frame());await shot('mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 if(!process.env.R16_VIEWER_ONLY){
  await page.setViewportSize({width:1440,height:1000});await page.goto(new URL('?view=site41&detail=rocket',base).href,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().rockets.placements.find(p=>p.key==='site41')?.status==='ready');
  evidence.placement=await page.evaluate(()=>__BAIKONUR_QA.stats().rockets.placements.find(p=>p.key==='site41'));assert.equal(evidence.placement.modelRevision,'r16-reference-v2');assert.equal(evidence.placement.assetStats.textures,2);assert.equal(evidence.placement.appearance.details.tailBells,4);assert(evidence.placement.effectiveVisible);
  await page.evaluate(()=>{const q=__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);q.site41.inspect('rocket');__R16_FRAME();});await page.locator('#close').click();await shot('site41-day');
  await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(true);__R16_FRAME();});await shot('site41-evening');
  await page.evaluate(()=>__BAIKONUR_QA.openObject('pad-41'));await page.locator('#modelCardButton').click();await page.waitForFunction(()=>__BAIKONUR_QA.modelInspector.stats().ready);
  const viewer=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(viewer);assert.equal(await viewer.evaluate(()=>__MODEL_VIEWER_QA.stats().modelId),'r16');await viewer.evaluate(()=>__MODEL_VIEWER_QA.frame());await shot('card-viewer');
  await page.locator('.model-inspector-close').click();assert.equal(await page.evaluate(()=>__BAIKONUR_QA.cameraState().controlsEnabled),true);assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));
 }
 assert(evidence.assetRequests.length>0);assert(evidence.assetRequests.every(url=>new URL(url).searchParams.get('v')==='r16-reference-v2'),'Every R-16 surface uses the new asset revision');assert.deepEqual(evidence.errors,[]);evidence.passed=true;
 console.log('R16_BROWSER_PASS',JSON.stringify({prefix,viewerOnly:!!process.env.R16_VIEWER_ONLY,errors:evidence.errors}));
}finally{await writeFile(`${out}/${prefix}-result.json`,JSON.stringify(evidence,null,2));await browser.close();}
