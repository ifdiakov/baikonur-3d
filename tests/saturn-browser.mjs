import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local';
const opts={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);opts.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(opts),page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(180000);
await mkdir('qa-saturn-photo',{recursive:true});const evidence={base,errors:[],views:[]};
page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|compile shader|GL_INVALID_OPERATION/.test(m.text()))evidence.errors.push(m.text());});
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=f=>['animate','animateModel'].includes(f.name)?(window.__SATURN_FRAME=f,0):native(f);});
try{
 await page.goto(new URL('workshop/saturn.html',base).href);await page.waitForFunction(()=>window.__SATURN_PREVIEW__?.rendererReady);await page.evaluate(()=>window.__SATURN_PREVIEW__.frame());
 evidence.model=await page.evaluate(()=>window.__SATURN_PREVIEW__.model);assert.equal(evidence.model.version,'saturn-photo-20261101-v2');assert.equal(evidence.model.photosUsed.length,10);
 for(const view of ['full','antenna','lattice','auxiliary','plan']){
  if(view==='full')await page.locator('#reset').click();else await page.locator(`[data-view="${view}"]`).click();
  await page.evaluate(()=>window.__SATURN_PREVIEW__.frame());const s=await page.evaluate(()=>window.__SATURN_PREVIEW__.stats());assert(s.shadersValid);assert(s.drawCalls<160);evidence.views.push({view,...s});await page.screenshot({path:`qa-saturn-photo/${prefix}-${view}.png`});
 }
 await page.locator('#reset').click();const before=await page.evaluate(()=>window.__SATURN_PREVIEW__.stats().camera);await page.mouse.move(900,480);await page.mouse.down();await page.mouse.move(1000,530,{steps:6});await page.mouse.up();await page.evaluate(()=>window.__SATURN_FRAME());assert.notDeepEqual(await page.evaluate(()=>window.__SATURN_PREVIEW__.stats().camera),before);
 await page.setViewportSize({width:430,height:932});await page.locator('#reset').click();await page.evaluate(()=>window.__SATURN_PREVIEW__.frame());await page.screenshot({path:`qa-saturn-photo/${prefix}-mobile.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),430);
 if(!process.env.SATURN_VIEWER_ONLY){
  await page.setViewportSize({width:1440,height:1000});await page.goto(new URL('?site=23',base).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().saturn);
  await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.focusSite('pad-23');q.evening.setEvening(false);window.__SATURN_FRAME();});
  evidence.map=await page.evaluate(()=>window.__BAIKONUR_QA.stats());assert.equal(evidence.map.saturn.version,'saturn-photo-20261101-v2');assert.equal(evidence.map.saturnScale,.525);assert.equal(evidence.map.saturn.access.preservedVerticalRaise,20);assert.equal(evidence.map.transport.saturnAccess,null);assert(evidence.map.shadersValid);assert.equal(evidence.map.evening.saturnLights.length,4);assert.equal(evidence.map.evening.saturnRoadLights.length,0);for(const light of evidence.map.evening.saturnLights)assert(light.y>21&&light.y-light.terrainY<.06);await page.locator('#detailMore').click();assert.equal(await page.locator('#infoExtra a[href*="workshop/saturn.html"]').count(),1);assert((await page.locator('#infoExtra').innerText()).includes('ИП-5 «Сатурн-МС»'));await page.locator('#detailMore').click();await page.screenshot({path:`qa-saturn-photo/${prefix}-map-day.png`});
  await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(true);window.__SATURN_FRAME();});await page.screenshot({path:`qa-saturn-photo/${prefix}-map-night.png`});
  await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.inspectSaturnHill();window.__SATURN_FRAME();});await page.screenshot({path:`qa-saturn-photo/${prefix}-hill.png`});
 }
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('SATURN_BROWSER_PASS',JSON.stringify({base,views:evidence.views.map(v=>({view:v.view,drawCalls:v.drawCalls,triangles:v.triangles})),map:!!evidence.map}));
}finally{await writeFile(`qa-saturn-photo/${prefix}-report.json`,JSON.stringify(evidence,null,2));await browser.close();}
