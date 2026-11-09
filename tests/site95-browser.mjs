import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out='qa-site95';await mkdir(out,{recursive:true});
const report={passed:false,base,environment:'Chromium/software WebGL; mobile viewport emulation, not physical hardware. Animation stepping is test-only.',checks:[]};let browser,page;
try{
 for(const mode of ['desktop','mobile','workshop']){
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  const mobile=mode==='mobile',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1500,height:950},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});page=await ctx.newPage();page.setDefaultTimeout(90000);const errors=[],shaderErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS/.test(m.text()))shaderErrors.push(m.text());});
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let pending;window.requestAnimationFrame=fn=>fn.name==='animate'?(pending=fn,0):raf(fn);window.__SITE95_FRAME=()=>pending?.();});
  await page.goto(new URL((mode==='workshop'?'workshop.html':'museum.html')+'?view=site95&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.site95?.stats(),null,{timeout:180000});
  await page.evaluate(()=>{__BAIKONUR_QA.setLabelsVisible(false);__SITE95_FRAME();});
  await page.waitForFunction(()=>window.__BAIKONUR_QA.stats().transportBake.detailReady,null,{timeout:180000});
  const state=await page.evaluate(()=>({model:__BAIKONUR_QA.site95.stats(),ground:__BAIKONUR_QA.site95.groundStats(),evening:__BAIKONUR_QA.evening.evening,shaders:__BAIKONUR_QA.stats().shadersValid,admin:!!window.__MUSEUM_WORKSHOP}));
  assert.equal(state.model.version,'20261109-site95-courtyards-v2');assert.equal(state.model.buildings.length,51);assert.equal(state.model.landscape.litLamps,60);assert.equal(state.model.landscape.newRealtimeLights,0);assert.equal(state.model.landscape.benches,23);assert.equal(state.model.landscape.walkways,231);assert(state.model.windowLights);assert(state.evening);assert(state.shaders);assert.equal(state.ground.roadY,-2.73);assert.equal(state.admin,mode==='workshop');
  assert.equal(await page.locator('#site95Views button').count(),5);
  for(const view of (mode==='desktop'?['all','barracks','square','utilities','top']:['all'])){
   await page.evaluate(view=>{__BAIKONUR_QA.site95.inspect(view);__SITE95_FRAME();},view);await page.screenshot({path:out+'/'+prefix+'-'+mode+'-'+view+'.png'});
  }
  if(mobile){const check=await page.evaluate(()=>{const q=__BAIKONUR_QA,c=q.stats().portalArchive.models.find(m=>m.id==='pad-95').centre;return {centre:q.projectWorld(...c),cardTop:document.getElementById('info').getBoundingClientRect().top};});assert(check.centre.y>100&&check.centre.y<check.cardTop-15,'Town obscured on mobile');state.mobile=check;}
  if(mode==='workshop'){await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-95'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);state.editingPreserved=true;}
  await page.evaluate(()=>__BAIKONUR_QA.openObject('pad-254'));assert(await page.locator('#site95Views').isHidden());assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.checks.push({mode,...state,errors,shaderErrors});await writeFile(out+'/'+prefix+'-report.json',JSON.stringify(report,null,2));await browser.close();browser=null;
 }
 report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/'+prefix+'-failure.png',timeout:15000}).catch(()=>{});throw e;}finally{await writeFile(out+'/'+prefix+'-report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('SITE95_BROWSER_PASS',JSON.stringify(report.checks.map(c=>({mode:c.mode,lamps:c.model.landscape.litLamps,buildings:c.model.buildings.length}))));
