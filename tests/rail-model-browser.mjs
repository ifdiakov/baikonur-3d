import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local';await mkdir('qa-m62',{recursive:true});
const opts={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);opts.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(opts),page=await browser.newPage({viewport:{width:1500,height:950},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(90000);
const report={base,errors:[],models:[],requests:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/(m62-kosmotrans|soviet-coach)\/model-v1.glb/.test(r.url()))report.requests.push(r.url());});
await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animateModel'?0:raf(fn);});
try{
 await page.goto(new URL('workshop/model.html?model=train',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
 for(const id of ['train','coach','train']){
  await page.evaluate(id=>window.__MODEL_VIEWER_QA.load(id),id);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().ready);await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());const stats=await page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());
  assert.equal(stats.modelId,id);assert(stats.triangles>30000);assert(stats.size[2]>(id==='train'?17:20));assert(stats.size[1]<5);report.models.push(stats);
  const text=await page.locator('#modelFacts').innerText();assert(!/окраск|ливрея|бирюзов|жёлт/.test(text));if(id==='train'){assert(text.includes('2 000 л. с.'));assert(text.includes('1964'));assert((await page.locator('#modelTitle').innerText()).includes('М62'));}
  await page.locator('#modelSources summary').click();assert((await page.locator('#modelSource').innerText()).includes('CC BY 4.0'));await page.locator('#modelSources summary').click();
  for(const view of ['full','side','front']){await page.locator(`[data-view="${view}"]`).click();await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());await page.screenshot({path:`qa-m62/${prefix}-${id}-${view}.png`});}
 }
 assert.equal(report.requests.length,2,'Cached decoded templates survive disposal/reload without new fetches');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());await page.screenshot({path:`qa-m62/${prefix}-mobile.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(report.errors,[]);
 // A failed request leaves a visible retry button; retry must evict the failed
 // cached promise and load the real GLB, not report a fallback as a success.
 const fail=await browser.newPage();await fail.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animateModel'?0:raf(fn);});let blocked=true;await fail.route('**/m62-kosmotrans/model-v1.glb',r=>blocked?r.fulfill({status:503,body:'unavailable'}):r.continue());await fail.goto(new URL('workshop/model.html?model=train',base).href);await fail.locator('#retry').waitFor({state:'visible',timeout:45000});blocked=false;await fail.locator('#retry').click();await fail.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);assert.equal(await fail.locator('#retry').isVisible(),false);await fail.close();
 report.passed=true;console.log('RAIL_MODEL_BROWSER_PASS',JSON.stringify({models:report.models.map(m=>({id:m.modelId,triangles:m.triangles,drawCalls:m.drawCalls})),requests:report.requests.length,retry:true,mobile:true}));
}finally{await writeFile(`qa-m62/${prefix}-viewer-report.json`,JSON.stringify(report,null,2));await browser.close();}
