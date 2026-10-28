import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const out='qa-mriya',prefix=process.env.QA_PREFIX||'local';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
const errors=[],assets=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader Error|compile shader|TypeError|ReferenceError|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
page.on('response',r=>{if(/mriya-buran\/.*\.glb/.test(r.url()))assets.push({url:r.url(),status:r.status()});});
if(process.env.BAIKONUR_THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.160.1/**',r=>r.fulfill({path:process.env.BAIKONUR_THREE_DIR+'/'+new URL(r.request().url()).pathname.split('/three@0.160.1/')[1],contentType:'text/javascript'}));
await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):native(fn);window.__MRIYA_FRAME=()=>{const fn=pending;pending=null;fn?.(performance.now());};});
try{
 await page.goto(process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BAIKONUR_QA?.stats().airports.find(a=>a.key==='yubileiny')?.mriya?.status==='ready',null,{timeout:180000});
 const state=await page.evaluate(()=>window.__BAIKONUR_QA.stats().airports.find(a=>a.key==='yubileiny'));
 assert.equal(state.mriya.version,'mriya-buran-glb-v1');assert.deepEqual(state.mriya.errors,[]);
 assert.deepEqual(state.mriya.loaded,['far','near']);assert.equal(state.mriya.wheels,32);
 assert.ok(Math.abs(state.mriya.dimensions[0]-82.15)<.1);assert.ok(Math.abs(state.mriya.dimensions[2]-88.31)<.1);
 assert.equal(state.mriya.drawCallsPerLevel,5);assert.equal(state.length,2250);
 assert.equal(assets.length,2);assert.ok(assets.every(a=>a.status===200));
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.arrival.stopFollowing();q.evening.setEvening(false);q.focusSite('pad-251');window.__MRIYA_FRAME();});
 await page.getByRole('button',{name:'Мрия и Буран',exact:true}).click();
 await page.locator('#close').click();
 await page.evaluate(()=>{window.__MRIYA_FRAME();});
 await page.screenshot({path:`${out}/${prefix}-apron.png`,timeout:90000});
 const pick=await page.evaluate(()=>{const q=window.__BAIKONUR_QA;return q.selection.pointForSite(q.siteState('pad-251').index);});
 assert.ok(pick,'Yubileiny remains selectable after asynchronous model replacement');
 await page.evaluate(()=>{window.__BAIKONUR_QA.evening.setEvening(true);window.__MRIYA_FRAME();});
 await page.screenshot({path:`${out}/${prefix}-evening.png`,timeout:90000});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{window.__MRIYA_FRAME();});
 assert.ok(await page.evaluate(()=>window.__BAIKONUR_QA.stats().shadersValid));
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/${prefix}-result.json`,JSON.stringify({passed:true,state,assets,pick,errors},null,2));
 console.log('MRIYA_BROWSER_PASS',JSON.stringify({prefix,loaded:state.mriya.loaded,dimensions:state.mriya.dimensions}));
}finally{await browser.close();}
