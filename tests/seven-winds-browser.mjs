import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-hotel',prefix=process.env.QA_PREFIX||'local';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('HOTEL_PAGE_ERROR',e.message);});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__HOTEL_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};});
try{
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8795/?view=hotel',{waitUntil:'domcontentloaded',timeout:90000});
 console.log('HOTEL_DOM_READY');
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.hotel?.stats(),null,{timeout:180000});
 console.log('HOTEL_SCENE_READY');
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.focusSite('pad-75');q.evening.setEvening(false);window.__HOTEL_FRAME();});
 assert((await page.locator('#title').textContent()).includes('7 ветров'));
 await page.locator('#showLabels').uncheck();await page.locator('#close').click();
 const stats=await page.evaluate(()=>window.__BAIKONUR_QA.hotel.stats());assert.equal(stats.floors,4);assert.equal(stats.gazebos,2);
 async function shot(view){console.log('HOTEL_VIEW',view);await page.evaluate(view=>{window.__BAIKONUR_QA.hotel.inspect(view);window.__HOTEL_FRAME();},view);await page.screenshot({path:`${out}/${prefix}-${view}.png`,timeout:120000});}
 await shot('all');await shot('front');await shot('garden');
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(true);window.__BAIKONUR_QA.hotel.inspect('all');window.__HOTEL_FRAME();});
 await page.screenshot({path:`${out}/${prefix}-evening.png`,timeout:120000});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.__BAIKONUR_QA.hotel.inspect('front');window.__HOTEL_FRAME();});
 await page.screenshot({path:`${out}/${prefix}-mobile.png`,timeout:120000});
 assert(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,stats,errors},null,2));console.log('SEVEN_WINDS_BROWSER_PASS',JSON.stringify({prefix,floors:stats.floors,gazebos:stats.gazebos,errors}));
}catch(e){console.error('HOTEL_QA_ERROR',e.message,errors);throw e;}finally{await browser.close();}
