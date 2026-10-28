import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-silo',prefix=process.env.QA_PREFIX||'local';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|compile shader|TypeError|ReferenceError|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__SILO_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};});
async function advance(seconds=4){return page.evaluate(seconds=>{const q=window.__BAIKONUR_QA,start=performance.now();q.silo.update(start);for(let i=1;i<=seconds*60;i++)q.silo.update(start+i*1000/60);window.__SILO_FRAME();return q.silo.stats()[0];},seconds);}
async function screenshot(name){await page.screenshot({path:`${out}/${prefix}-${name}.png`,timeout:90000});}
try{
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8765/?view=silo',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.silo?.stats()[0],null,{timeout:180000});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.focusSite('pad-109');window.__SILO_FRAME();});
 assert((await page.locator('#title').textContent()).includes('109'));
 assert(await page.getByRole('button',{name:'К шахте',exact:true}).isVisible());
 assert.equal((await advance()).state,'closed');await screenshot('closed');
 await page.locator('#showLabels').uncheck();
 await page.getByRole('button',{name:'К шахте',exact:true}).click();
 await page.locator('#close').click();
 const moving=await advance(1);assert.equal(moving.state,'opening');assert(moving.lidAngleDeg>0&&moving.lidAngleDeg<108);
 await screenshot('opening');
 const opened=await advance(4);assert.equal(opened.state,'open');assert.equal(opened.steamParticles,36);assert(opened.noseTipY<opened.rimY);await screenshot('open-day');
 // OrbitControls wheel input must leave the automatic reveal open at maximum zoom.
 await page.mouse.move(820,510);await page.mouse.wheel(0,-900);await page.waitForTimeout(100);await page.evaluate(()=>window.__SILO_FRAME());
 const closest=await advance(1);assert.equal(closest.state,'open');assert(closest.cameraDistance<opened.cameraDistance);
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));await screenshot('maximum-zoom');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.silo.inspect('close');q.evening.setEvening(true);window.__SILO_FRAME();});await advance(1);await screenshot('open-evening');
 await page.locator('#all').click();const retreat=await advance(1);assert.equal(retreat.state,'closing');const closed=await advance(4);assert.equal(closed.state,'closed');assert.equal(closed.steamVisible,false);
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-109');q.silo.inspect('close');window.__SILO_FRAME();});await advance();
 await page.locator('[data-layer="sites"]').uncheck();const hidden=await advance(.2);assert.equal(hidden.visible,false);assert.equal(hidden.steamVisible,false);assert.equal(hidden.progress,0);
 await page.locator('[data-layer="sites"]').check();await advance();
 await page.setViewportSize({width:390,height:844});await page.locator('#close').click();await page.evaluate(()=>{window.__BAIKONUR_QA.silo.inspect('close');window.__SILO_FRAME();});await advance();await screenshot('mobile');
 assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.silo.stats()[0].state),'open');
 const state=await page.evaluate(()=>({silo:window.__BAIKONUR_QA.silo.stats()[0],site:window.__BAIKONUR_QA.siteState('pad-109'),shaders:window.__BAIKONUR_QA.stats().shadersValid,voids:window.__BAIKONUR_QA.stats().terrainVoids.count}));
 assert(state.shaders);assert.deepEqual(errors,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,opened,closest,state,errors},null,2));console.log('SILO_BROWSER_PASS',JSON.stringify({prefix,openAngle:opened.lidAngleDeg,closestDistance:closest.cameraDistance,errors}));
}catch(e){await screenshot('failure').catch(()=>{});console.error(JSON.stringify({error:e.message,errors}));throw e;}finally{await browser.close();}
