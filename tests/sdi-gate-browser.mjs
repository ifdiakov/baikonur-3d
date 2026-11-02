import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
const prefix=process.env.QA_PREFIX||'local',out='qa-sdi';await mkdir(out,{recursive:true});
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.SDI_USE_PROXY&&process.env.HTTPS_PROXY){const p=new URL(process.env.HTTPS_PROXY);options.proxy={server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1600,height:1000},ignoreHTTPSErrors:true});
page.setDefaultTimeout(90000);const errors=[],bad=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)bad.push([r.status(),r.url()]);});
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SDI_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};});
const frame=()=>page.evaluate(()=>window.__SDI_FRAME());
const url=new URL(base);url.searchParams.set('view','mzk');url.searchParams.set('detail','sdi');
try{
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA,null,{timeout:300000});
 console.log('SDI_READY');
 await page.evaluate(()=>{window.__SDI_TIME=performance.now();performance.now=()=>window.__SDI_TIME;});
 await page.waitForFunction(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='sdi-energia-m')?.status==='ready',null,{timeout:120000});
 const rocket=await page.evaluate(()=>window.__BAIKONUR_QA.rockets.stats().placements.find(p=>p.key==='sdi-energia-m'));
 assert.equal(rocket.modelId,'energia-m');assert.equal(rocket.siteId,'pad-112a');rocket.metresToWorld.forEach(n=>assert(Math.abs(n-.14)<1e-8));assert(rocket.effectiveVisible);
 assert.equal(await page.locator('#sdiGateToggle').getAttribute('aria-expanded'),'false');
 assert((await page.locator('#modelCardButton').getAttribute('data-models')).includes('energia-m'));
 await frame();await page.screenshot({path:`${out}/${prefix}-closed.png`});
 await page.locator('#sdiGateToggle').click();const clock=await page.evaluate(()=>performance.now());
 await page.evaluate(t=>{window.__SDI_TIME=t+4000;window.__BAIKONUR_QA.mzkSdi.update(performance.now());},clock);const half=await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.gateStats());assert(half.progress>.48&&half.progress<.6);
 await frame();await page.screenshot({path:`${out}/${prefix}-half.png`});
 await page.evaluate(t=>{window.__SDI_TIME=t+9000;window.__BAIKONUR_QA.mzkSdi.update(performance.now());},clock);await frame();
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.gateStats())).state,'open');
 await page.screenshot({path:`${out}/${prefix}-open.png`});
 await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.inspect('sdi-rocket'));await frame();await page.screenshot({path:`${out}/${prefix}-rocket.png`});
 await page.locator('#sdiGateToggle').click();await page.evaluate(t=>{window.__SDI_TIME=t+18000;window.__BAIKONUR_QA.mzkSdi.update(performance.now());},clock);assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.gateStats())).state,'closed');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.inspect('sdi'));await frame();
 await page.locator('#sdiGateToggle').click();await page.evaluate(t=>{window.__SDI_TIME=t+27000;window.__BAIKONUR_QA.mzkSdi.update(performance.now());},clock);await frame();
 assert.equal(await page.locator('#sdiGateToggle').getAttribute('aria-expanded'),'true');await page.screenshot({path:`${out}/${prefix}-mobile.png`});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 await writeFile(`${out}/${prefix}-evidence.json`,JSON.stringify({rocket,half,gate:await page.evaluate(()=>window.__BAIKONUR_QA.mzkSdi.gateStats()),errors,bad},null,2));
 console.log('SDI_GATE_BROWSER_PASS',JSON.stringify({base,model:rocket.modelId,bytes:rocket.assetStats.bytes}));
}finally{if(errors.length||bad.length)console.log(JSON.stringify({errors,bad}));await browser.close();}
