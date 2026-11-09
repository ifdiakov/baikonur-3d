import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.ATMOSPHERE_QA_OUT||'qa-public-atmosphere';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const report={base,measuredAt:new Date().toISOString(),conditions:'Chromium/Linux/SwiftShader software WebGL; cold browser context; unthrottled network; mobile VIEWPORT, not a physical smartphone',measurements:[],checks:[]};let page;
async function state(){return page.evaluate(()=>window.__MUSEUM_PUBLIC.metrics());}
try{
 for(const device of ['desktop','desktop-repeat','mobile']){
  const mobile=device==='mobile',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});page=await ctx.newPage();const errors=[],gpuErrors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/.test(m.text()))gpuErrors.push(m.text());});page.on('request',r=>requests.push(r.url()));
  await page.goto(base+'museum.html?tour=0',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__MUSEUM_PUBLIC?.metrics().ready,null,{timeout:120000});
  const first=await state();report.measurements.push({device,...first,resources:await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,transfer:r.transferSize,encoded:r.encodedBodySize}))),errors});
  assert.equal(first.atmosphere.version,'visitor-atmosphere-20261109-v1');assert(first.atmosphere.skyVisible);assert(first.atmosphere.horizonMatched);assert.equal(first.atmosphere.lightPixelRatio,first.pixelRatio);assert(first.atmosphere.lightsOn);assert.equal(first.atmosphere.fog.density,.000115);assert.equal(first.atmosphere.regions,4);assert(first.atmosphere.warmRoadLights>0&&first.atmosphere.coldRoadLights>0);assert(first.shadersValid);assert.equal(first.roadMeshes,0);assert(first.drawCalls<300);assert(first.triangles<600000);assert.equal(first.loadedDetails.length,0);
  assert(!requests.some(r=>/road-editor|osm-transport|roads\.geojson|archive-models|workshop-panel|coordinate-grid|camera-altitude\.js/.test(r)),'Visitor must not load authoring tools or the heavy road builder');
  assert.equal(await page.locator('#cameraAltitude,#coordinateGridInfo,#workshopPanel').count(),0);
  if(device!=='desktop-repeat'){
   await page.screenshot({path:out+'/'+device+'-night-overview.png'});
   await page.locator('#nightButton').click();assert.equal((await state()).atmosphere.lightsOn,false);assert.equal((await state()).atmosphere.skyVisible,false);assert.equal((await state()).atmosphere.fog.density,.00013);await page.screenshot({path:out+'/'+device+'-day-overview.png'});
   await page.locator('#nightButton').click();await page.evaluate(()=>window.__MUSEUM_PUBLIC.showFlanks());await page.waitForTimeout(500);
   const plan=await state();assert(plan.atmosphere.flankAlpha>.95);const fit=plan.atmosphere.planFraming;assert(fit.left>=(mobile?0:300)&&fit.right<=(mobile?390:1365)&&fit.top>=85&&fit.bottom<=(mobile?640:690),'All four territories fit the useful screen without hiding behind the menu/cards');assert.equal(plan.atmosphere.overlayLift,.16);assert.equal(await page.locator('.public-flank-card:visible').count(),3);assert.equal(await page.evaluate(()=>window.__MUSEUM_PUBLIC.scene.getObjectByName('ГОРОД БАЙКОНУР · заливка').visible),true);
   const rects=await page.locator('.public-flank-card').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,window:[innerWidth,innerHeight]}}));for(const r of rects){assert(r.x>=0&&r.y>=0&&r.x+r.w<=r.window[0]+1&&r.y+r.h<=r.window[1],'Cards fit viewport');}for(let i=1;i<rects.length;i++)assert(rects[i-1].x+rects[i-1].w<=rects[i].x+1,'Cards do not overlap');
   await page.screenshot({path:out+'/'+device+'-flanks.png'});
   await page.locator('[data-flank=center]').click();await page.waitForTimeout(350);assert((await state()).atmosphere.flankAlpha<.01);assert.equal(await page.locator('.public-flank-card:visible').count(),0);
   await page.evaluate(()=>{const q=window.__MUSEUM_PUBLIC;q.camera.zoom=1;q.camera.updateProjectionMatrix();q.controls.target.set(0,0,-100);q.camera.position.set(0,760*3.4/1.45,1700);q.controls.update();});await page.waitForTimeout(300);assert((await state()).atmosphere.flankAlpha>.95);
   if(!mobile){await page.evaluate(()=>window.__MUSEUM_PUBLIC.focusSite('pad-31'));await page.waitForFunction(()=>window.__MUSEUM_PUBLIC.metrics().loadedDetails.includes('pad-31'),null,{timeout:120000});await page.waitForTimeout(600);await page.screenshot({path:out+'/desktop-site31-night.png'});assert((await state()).atmosphere.dynamicLights<=2);await page.locator('#nightButton').click();await page.screenshot({path:out+'/desktop-site31-day.png'});await page.locator('#nightButton').click();}
   await page.evaluate(()=>window.__MUSEUM_PUBLIC.overview());await page.waitForTimeout(1500);assert((await state()).atmosphere.flankAlpha<.01);const before=(await state()).frames;await page.waitForTimeout(1200);const idle=(await state()).frames-before;assert(idle<5,'Atmosphere does not require continuous repainting');report.checks.push({device,plan:plan.atmosphere,idleFrames:idle,rects});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(gpuErrors,[]);assert((await state()).shadersValid);await ctx.close();
 }
 report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});report.body=await page?.locator('body').innerText().catch(()=>null);throw error;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log('PUBLIC_ATMOSPHERE_BROWSER_PASS',JSON.stringify(report.measurements.map(r=>({device:r.device,readyMs:r.navigationToReadyMs,drawCalls:r.drawCalls,triangles:r.triangles,lights:r.atmosphere.lightRecords}))));
