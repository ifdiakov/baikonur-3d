import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-inspector';
const options={headless:true,...(process.env.BAIKONUR_CHROMIUM?{executablePath:process.env.BAIKONUR_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']};
if(process.env.ZENIT_PROXY){const u=new URL(process.env.ZENIT_PROXY);options.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1500,height:1000},ignoreHTTPSErrors:!!process.env.ZENIT_PROXY});page.setDefaultTimeout(90000);
const evidence={base,errors:[],positions:{},views:{}};await mkdir(out,{recursive:true});
page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|WebGL/.test(m.text()))evidence.errors.push(m.text());});
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=fn=>['animate','animateModel'].includes(fn.name)?(window.__PROTON_FRAME=fn,0):native(fn);});
const frame=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.frame());const stats=()=>page.evaluate(()=>window.__MODEL_VIEWER_QA.stats());
try{
 await page.goto(new URL('workshop/model.html?model=proton-pad',base).href);await page.waitForFunction(()=>window.__MODEL_VIEWER_QA?.stats().ready);assert.equal(await page.evaluate(()=>__MODEL_VIEWER_QA.version),'without-ll22-v1');
 assert.equal((await stats()).view,'front');assert.equal((await stats()).dark,true);assert.equal((await stats()).choices.length,19);
 for(const view of ['full','front','side','top','interface']){await page.locator(`[data-view="${view}"]`).click();await frame();const s=await stats();assert.equal(s.view,view);assert(s.drawCalls<=50&&s.triangles<120000);assert(s.camera.every(Number.isFinite));evidence.views[view]=s;await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-proton-${view}.png`});}
 const withRocket=(await stats()).triangles;await page.locator('#siteRocket').click();await frame();assert.equal((await stats()).vehicleVisible,false);assert((await stats()).triangles<withRocket-15000);await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-proton-open-aperture.png`});
 const before=(await stats()).camera,c=await page.locator('#modelView canvas').boundingBox();await page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await page.mouse.down();await page.mouse.move(c.x+c.width*.65,c.y+c.height*.59,{steps:5});await page.mouse.up();await frame();assert.notDeepEqual((await stats()).camera,before);
 await page.selectOption('#modelSelect','proton');await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().ready&&__MODEL_VIEWER_QA.stats().modelId==='proton');assert.equal(await page.locator('#siteRocket').isVisible(),false);assert.equal(await page.locator('[data-view="interface"]').isVisible(),false);
 await page.selectOption('#modelSelect','proton-pad');await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().ready&&__MODEL_VIEWER_QA.stats().modelId==='proton-pad');assert.equal((await stats()).vehicleVisible,true);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>__MODEL_VIEWER_QA.stats().viewport[0]<400);await frame();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-proton-mobile.png`,fullPage:true});
 await page.setViewportSize({width:1500,height:1000});await page.goto(new URL('?view=proton&site=pad-200',base).href,{timeout:180000});await page.waitForFunction(()=>window.__BAIKONUR_QA,undefined,{timeout:180000});
 await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(false);__BAIKONUR_QA.setLabelsVisible(false);});
 for(const id of ['pad-200','pad-81']){
  await page.evaluate(id=>__BAIKONUR_QA.openObject(id),id);assert.equal(await page.locator('#protonViews').isVisible(),true);assert((await page.locator('#modelCardButton').getAttribute('data-models')).includes('proton-pad'));
  const positions=await page.evaluate(id=>__BAIKONUR_QA.proton.stats(id),id);assert.equal(positions.length,2);for(const p of positions){assert.equal(p.version,'proton-launch-v1');assert.equal(p.dimensions.depth,8);assert.equal(p.dimensions.outlets,2);}evidence.positions[id]=positions;
  const camera=await page.evaluate(()=>__BAIKONUR_QA.cameraState());await page.locator('[data-proton-position="1"]').click();const second=await page.evaluate(()=>__BAIKONUR_QA.cameraState());assert.notDeepEqual(second.target,camera.target);
  await page.locator('#protonRocketToggle').click();assert((await page.evaluate(id=>__BAIKONUR_QA.proton.stats(id),id)).every(p=>!p.rocketVisible));
  for(const v of ['interface','duct','tower']){await page.locator(`[data-proton-view="${v}"]`).click();await page.evaluate(()=>window.__PROTON_FRAME());await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-${id}-${v}.png`});}
  await page.locator('#protonRocketToggle').click();assert((await page.evaluate(id=>__BAIKONUR_QA.proton.stats(id),id)).every(p=>p.rocketVisible));
 }
 const pose=await page.evaluate(()=>__BAIKONUR_QA.cameraState());await page.locator('#modelCardButton').click();await page.waitForFunction(()=>__BAIKONUR_QA.modelInspector.stats().ready);const child=page.frames().find(f=>f.url().includes('/workshop/model.html'));assert(child);assert.equal(await child.evaluate(()=>__MODEL_VIEWER_QA.stats().modelId),'proton-pad');await child.evaluate(()=>__MODEL_VIEWER_QA.frame());await page.locator('.model-inspector-close').click();
 const restored=await page.evaluate(()=>__BAIKONUR_QA.cameraState());for(const key of ['position','target'])assert(Math.hypot(...restored[key].map((x,i)=>x-pose[key][i]))<1e-8);assert.equal(restored.controlsEnabled,true);
 const state=await page.evaluate(()=>__BAIKONUR_QA.stats());assert.equal(state.shadersValid,true);evidence.voids=state.terrainVoids.items.filter(v=>v.shape.source==='Proton paired lateral ducts and launch aperture');assert.equal(evidence.voids.length,4);assert(evidence.voids.every(v=>v.enabled===1));
 await page.evaluate(()=>{__BAIKONUR_QA.evening.setEvening(true);__PROTON_FRAME();});await page.waitForTimeout(180);await page.screenshot({path:`${out}/${prefix}-proton-evening.png`});
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;console.log('PROTON_LAUNCH_BROWSER_OK',JSON.stringify({base,positions:4,views:5,openAperture:true,orbit:true,mobile:true,card:true,returnPose:true,terrainMasks:4}));
}finally{await writeFile(`${out}/${prefix}-proton-report.json`,JSON.stringify(evidence,null,2)+'\n');await browser.close();}
