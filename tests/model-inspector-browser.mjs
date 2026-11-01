import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-inspector';
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);options.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});
page.setDefaultTimeout(90000);await mkdir(out,{recursive:true});const evidence={base,errors:[],models:{}};
page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|WebGL/.test(m.text()))evidence.errors.push(m.text());});
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=fn=>['animate','animateModel'].includes(fn.name)?(window.__INSPECTOR_FRAME=fn,0):native(fn);});
const stats=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());
const frame=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());
const load=async id=>{await page.evaluate(id=>window.__MODEL_VIEWER_QA.load(id),id);await page.waitForFunction(id=>window.__MODEL_VIEWER_QA.stats().ready&&window.__MODEL_VIEWER_QA.stats().modelId===id,id);await frame();};
try{
 await page.goto(new URL('workshop/model.html?model=zenit-land',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);
 const choices=(await stats()).choices;assert.equal(choices.length,19);assert(!choices.includes('mig'));assert(choices.includes('mig25'));
 for(const id of choices){await load(id);const s=await stats();assert(s.drawCalls>0&&s.triangles>0);assert(s.size.every(n=>Number.isFinite(n)&&n>0));assert(s.camera.every(Number.isFinite));evidence.models[id]=s;if(id==='buran')await page.screenshot({path:`${out}/${prefix}-${id}.png`});}
 await load('proton');const proton=await stats();await page.locator('#explode').click();await frame();assert((await stats()).size[0]>proton.size[0]+10);await page.locator('#explode').click();await frame();assert.deepEqual((await stats()).size,proton.size);
 await load('train');assert((await stats()).size[2]<20,'Hidden headlight pool must not shrink the vehicle framing');await page.screenshot({path:`${out}/${prefix}-train.png`});
 await load('zenit-land');const assembled=await stats();
 for(const view of ['front','side','top','full']){await page.locator(`[data-view="${view}"]`).click();await frame();assert.equal((await stats()).view,view);}
 const c=await page.locator('#modelView canvas').boundingBox();await page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await page.mouse.down();await page.mouse.move(c.x+c.width*.65,c.y+c.height*.6,{steps:5});await page.mouse.up();await frame();assert.notDeepEqual((await stats()).camera,assembled.camera);
 await page.locator('#explode').click();assert.equal((await stats()).exploded,true);assert((await stats()).size[0]>assembled.size[0]+10);await page.locator('#explode').click();assert.deepEqual((await stats()).size,assembled.size);
 await page.locator('#rotate').click();const before=(await stats()).camera;await frame();await frame();assert.notDeepEqual((await stats()).camera,before);await page.locator('#rotate').click();
 assert.equal((await stats()).dark,true);await page.locator('#light').click();assert.equal((await stats()).dark,false);await page.locator('#light').click();assert.equal((await stats()).dark,true);await frame();await page.screenshot({path:`${out}/${prefix}-zenit-land.png`});
 // A failed asset is recoverable in-place; switching while loading cannot
 // replace the latest requested model with an earlier result.
 await page.route('**/assets/models/rockets/soyuz.glb*',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.evaluate(()=>window.__MODEL_VIEWER_QA.load('soyuz'));assert.equal(await page.locator('#retry').isVisible(),true);assert.equal((await stats()).ready,false);
 await page.unroute('**/assets/models/rockets/soyuz.glb*');await page.locator('#retry').click();await page.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().ready);
 await page.evaluate(async()=>{const q=window.__MODEL_VIEWER_QA;await Promise.all([q.load('mriya'),q.load('zenit-land')]);});assert.equal((await stats()).modelId,'zenit-land');assert.equal((await stats()).ready,true);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().viewport[0]<400);await frame();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${prefix}-mobile.png`,fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.goto(new URL('?view=site45',base).href,{timeout:180000});await page.waitForFunction(()=>window.__BAIKONUR_QA,undefined,{timeout:180000});
 await page.evaluate(()=>{const q=window.__BAIKONUR_QA;q.evening.setEvening(false);q.setLabelsVisible(false);window.__INSPECTOR_FRAME();});
 assert.equal(await page.locator('#modelCardButton').isVisible(),true);assert.equal(await page.locator('#site45Views').isVisible(),true);
 evidence.site45=await page.evaluate(()=>window.__BAIKONUR_QA.site45.stats());assert.equal(evidence.site45.referenceImageCount,10);
 for(const view of ['all','trench','rocket']){await page.evaluate(view=>{window.__BAIKONUR_QA.site45.inspect(view);window.__INSPECTOR_FRAME();},view);await page.screenshot({path:`${out}/${prefix}-site45-${view}.png`});}
 const camera=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());await page.locator('#modelCardButton').click();
 let child=page.frames().find(f=>f.url().includes('/workshop/model.html'));if(!child){await page.waitForFunction(()=>window.__BAIKONUR_QA.modelInspector.stats().ready);child=page.frames().find(f=>f.url().includes('/workshop/model.html'));}
 await child.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);await child.evaluate(()=>window.__MODEL_VIEWER_QA.frame());
 assert.equal((await page.evaluate(()=>window.__BAIKONUR_QA.cameraState())).controlsEnabled,false);assert.equal(await page.locator('#modelInspector iframe').count(),1);
 await child.selectOption('#modelSelect','site45');await child.waitForFunction(()=>window.__MODEL_VIEWER_QA.stats().ready&&window.__MODEL_VIEWER_QA.stats().modelId==='site45');await child.evaluate(()=>window.__MODEL_VIEWER_QA.frame());await page.screenshot({path:`${out}/${prefix}-dialog.png`});
 await child.locator('#modelView canvas').focus();await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__BAIKONUR_QA.modelInspector.isOpen());assert.equal(await page.locator('#modelInspector iframe').count(),0);
 const restored=await page.evaluate(()=>window.__BAIKONUR_QA.cameraState());for(const key of ['position','target'])assert(Math.hypot(...restored[key].map((n,i)=>n-camera[key][i]))<1e-8,'Closing returns the exact map pose');assert.equal(restored.controlsEnabled,true);assert.equal(await page.evaluate(()=>document.activeElement.id),'modelCardButton');
 for(const [id,model]of [['pad-81','proton'],['pad-200','proton'],['pad-110','n1'],['pad-31','soyuz'],['pad-112','tua'],['pad-251','mriya'],['airfield','aircraft'],['city','train']]){await page.evaluate(id=>window.__BAIKONUR_QA.openObject(id),id);assert.equal(await page.locator('#modelCardButton').isVisible(),true);assert((await page.locator('#modelCardButton').getAttribute('data-models')).includes(model));}
 const station=await page.locator('[data-station-id]').first().getAttribute('data-station-id');assert(station);await page.evaluate(id=>window.__BAIKONUR_QA.focusStation(id),station);assert.equal(await page.locator('#modelCardButton').getAttribute('data-models'),'train,coach');
 await page.evaluate(()=>window.__BAIKONUR_QA.openObject('pad-45'));await page.setViewportSize({width:390,height:844});await page.locator('#modelCardButton').click();await page.waitForFunction(()=>window.__BAIKONUR_QA.modelInspector.stats().ready);child=page.frames().find(f=>f.url().includes('/workshop/model.html'));await child.evaluate(()=>window.__MODEL_VIEWER_QA.frame());assert(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${prefix}-dialog-mobile.png`});await page.locator('.model-inspector-close').click();assert.equal(await page.locator('#modelInspector iframe').count(),0);
 // The removed LL22 must never be constructed, including during the landing event.
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.__BAIKONUR_QA.openObject('pad-251'));
 const models=(await page.locator('#modelCardButton').getAttribute('data-models')).split(',');assert(!models.includes('mig'));assert(models.includes('mig25'));
 await page.locator('#buranLandingStart').click();await page.evaluate(()=>window.__BAIKONUR_QA.buranLanding.pause());
 const times=await page.evaluate(()=>window.__BAIKONUR_QA.buranLanding.stats().times);
 for(const t of [0,200,times.touchdown,times.stop,times.end]){
  const b=await page.evaluate(t=>{const q=window.__BAIKONUR_QA;q.buranLanding.seek(t);window.__INSPECTOR_FRAME();return q.buranLanding.stats();},t);
  assert.equal(b.escort.count,0);assert.equal(b.escort.visible,false);assert.equal(b.aircraft.escort.count,0);assert.equal(b.aircraft.budget.mig,undefined);assert(b.position.every(Number.isFinite));assert.equal(b.aircraft.source.retainedTriangles,33853);
 }
 await page.screenshot({path:`${out}/${prefix}-buran-without-ll22.png`});await page.locator('#buranLandingClose').click();assert.equal(await page.evaluate(()=>window.__BAIKONUR_QA.buranLanding.stats().active),false);
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('MODEL_INSPECTOR_BROWSER_OK',JSON.stringify({models:choices.length,orbit:true,retry:true,switchRace:true,cardIntegration:true,cameraRestored:true,mobile:true,removedLL22:true,buranLanding:true,base}));
}finally{await writeFile(`${out}/${prefix}-report.json`,JSON.stringify(evidence,null,2)+'\n');await browser.close();}
