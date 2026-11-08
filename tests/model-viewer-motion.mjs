import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='previews/silo-v3',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
const errors=[],report={};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|WebGL/.test(m.text()))errors.push(m.text());});
await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animateModel'?0:raf(fn);});
const url=new URL('workshop/model.html?model=silo',base).href;
const ready=()=>page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
const stats=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());
const advance=(frames,hz=60)=>page.evaluate(({frames,hz})=>{const q=window.__MODEL_VIEWER_QA;window.__motionTime??=performance.now();for(let i=0;i<frames;i++)q.frame(window.__motionTime+=1000/hz);return q.stats();},{frames,hz});
const resetClock=()=>page.evaluate(()=>window.__motionTime=performance.now());
try{
 await page.goto(url);await ready();await resetClock();
 assert.equal((await stats()).autoRotate,true);
 assert.equal(await page.locator('#rotate').getAttribute('aria-pressed'),'true');
 await page.locator('#modelView').screenshot({path:out+'/closed.png'});
 report.initial=await stats();
 const first=(await stats()).camera;await advance(30);const early=await stats();assert.notDeepEqual(early.camera,first);assert(early.rotationSpeed>0&&early.rotationSpeed<.65);
 await advance(210);report.open=await stats();assert.equal(report.open.modelState.state,'open');assert(report.open.modelState.steamVisible);
 await page.locator('#rotate').click();assert.equal((await stats()).autoRotate,false);await advance(120);
 await page.locator('#modelView').screenshot({path:out+'/open.png'});
 const still=(await stats()).camera;await advance(60);assert(Math.hypot(...(await stats()).camera.map((v,i)=>v-still[i]))<1e-6);
 await page.locator('#rotate').click();await advance(60);assert((await stats()).autoRotate);
 const bounds=await page.locator('#modelView canvas').boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.58,bounds.y+bounds.height*.52,{steps:5});await page.mouse.up();assert.equal((await stats()).autoRotate,false);assert.equal(await page.locator('#rotate').getAttribute('aria-pressed'),'false');
 await page.locator('#rotate').click();await page.mouse.wheel(0,80);assert.equal((await stats()).autoRotate,false);
 await page.locator('#rotate').click();await page.locator('[data-view="side"]').click();assert.equal((await stats()).autoRotate,false);
 await advance(60);await page.locator('#modelView').screenshot({path:out+'/side.png'});
 // Switching models and reopening the viewer both start a fresh smooth orbit.
 await page.evaluate(()=>__MODEL_VIEWER_QA.load('zenit-land'));await ready();assert.equal((await stats()).autoRotate,true);await resetClock();await advance(120);report.rocket=await stats();assert(report.rocket.rotationSpeed>.6);
 await page.reload();await ready();assert((await stats()).autoRotate);await resetClock();
 // Frame-rate independence: same elapsed time, same initial view, different FPS.
 const angles=[];for(const hz of [30,120]){
  await page.evaluate(()=>__MODEL_VIEWER_QA.load('silo'));await ready();await resetClock();await advance(1,hz);const before=await stats();await advance(hz*4,hz);const after=await stats();
  const az=s=>Math.atan2(s.camera[0]-s.target[0],s.camera[2]-s.target[2]);angles.push(Math.abs(az(after)-az(before)));
 }
 assert(Math.abs(angles[0]-angles[1])<.01,'Orbit speed must not depend on refresh rate');report.angles=angles;
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await stats()).autoRotate,false);
 await page.evaluate(()=>__MODEL_VIEWER_QA.load('silo'));await ready();assert.equal((await stats()).autoRotate,false);
 await page.locator('#rotate').click();assert.equal((await stats()).autoRotate,true);await page.locator('#rotate').click();
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>__MODEL_VIEWER_QA.load('silo'));await ready();await resetClock();await advance(240);assert((await stats()).autoRotate);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);report.passed=true;report.errors=errors;console.log('SILO_PREVIEW_AND_AUTOROTATE_OK',JSON.stringify(report));
}finally{await writeFile(out+'/report.json',JSON.stringify({...report,errors},null,2)+'\n');await browser.close();}
