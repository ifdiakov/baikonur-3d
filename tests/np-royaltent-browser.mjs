import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-np-royaltent/local';await mkdir(out,{recursive:true});
const report={passed:false,base,environment:'Chromium/Linux/software WebGL. Render frame stepping only in tests, not an FPS or physical smartphone benchmark.',checks:[]};let browser,page;
const launch=()=>chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  report.hashes={};
  for(const f of ['index.html','museum.html','workshop.html','src/site31-observation-platform.js','src/np-royaltent.js']){
   const hash=b=>createHash('sha256').update(b).digest('hex'),expected=hash(await readFile(f));let actual;
   for(let i=0;i<24;i++){const r=await fetch(new URL(f+'?verify='+Date.now(),base));if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,5000));}
   assert.equal(actual,expected,'Published file mismatch '+f);report.hashes[f]=actual;
  }
 }
 if(process.env.FIXTURE!=='0'){
  browser=await launch();page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/fixtures/np-photo.html',base).href);await page.waitForFunction(()=>window.npReady);
  for(const v of ['open','door','corner','inside','roof']){await page.evaluate(v=>npInspect(v),v);await page.screenshot({path:out+'/construction-'+v+'.png'});}
  for(const v of ['front','night']){await page.evaluate(v=>npRender(v),v);await page.screenshot({path:out+'/construction-'+v+'.png'});}
  assert.deepEqual(errors,[]);await browser.close();browser=null;
 }
 for(const mode of (process.env.QA_MODES||'desktop,mobile,workshop').split(',').filter(Boolean)){
  browser=await launch();const mobile=mode==='mobile';const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  page=await ctx.newPage();page.setDefaultTimeout(180000);const errors=[],shaderErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(e.text()))shaderErrors.push(e.text());});
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let step;window.requestAnimationFrame=fn=>fn.name==='animate'?(step=fn,0):raf(fn);window.__NP_FRAME=()=>step?.();});
  await page.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.continue();const res=await r.fetch();let html=await res.text();html=html.replace('window.__BAIKONUR_QA={','window.__NP_DEBUG={g:site31Observation?.g,scene,camera,ctl,renderer};window.__BAIKONUR_QA={');await r.fulfill({response:res,body:html});});
  await page.goto(new URL((mode==='workshop'?'workshop.html':'museum.html')+'?view=np&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.np31().present,null,{timeout:240000,polling:200});
  await page.evaluate(()=>__NP_FRAME());
  const state=await page.evaluate(()=>({np:__BAIKONUR_QA.np31(),evening:__BAIKONUR_QA.evening.evening,admin:!!window.__MUSEUM_WORKSHOP,grid:__MUSEUM_COORD_GRID.isEnabled(),shaders:__BAIKONUR_QA.stats().shadersValid,elapsedMs:Math.round(performance.now())}));
  assert.equal(state.np.model.version,'rockettrip-np-royaltent-20261109-v3');assert.equal(state.np.instanceCount,1);assert(state.np.visible);assert(state.evening);assert(state.shaders);assert.equal(state.admin,mode==='workshop');assert.equal(state.grid,mode==='workshop');
  assert.deepEqual(state.np.model.mapCoordinates,{x:912.9,y:304.9});assert.equal(state.np.model.tentSpecs[0].chords,12);assert.equal(state.np.model.tentSpecs[1].doorLeaves,2);
  await page.screenshot({path:out+'/'+mode+'-np-evening.png',timeout:120000});
  if(mobile){const b=state.np.screenBounds;assert(b.minX>=0&&b.maxX<=390,'NP horizontally clipped');assert(b.minY>=65&&b.maxY<=650,'NP vertically clipped');}
  if(mode==='desktop'){
   // Capture actual production geometry and lighting, not a substitute model.
   for(const view of ['open','door','corner']){
    await page.evaluate(view=>{const d=__NP_DEBUG;__BAIKONUR_QA.arrival.stopFollowing();__BAIKONUR_QA.traffic.stopFollowing();d.ctl.enableDamping=false;const target=d.g.position.clone(),eye=d.g.position.clone();
     const poses={open:[[-11.65,2,-5.5],[-2,9,-22]],door:[[11.65,2,-5.5],[21,9,-22]],corner:[[-6.7,1,-10.45],[-2.4,4.4,-15.7]]},[t,p]=poses[view];target.set(...t);eye.set(...p);d.g.localToWorld(target);d.g.localToWorld(eye);d.ctl.target.copy(target);d.camera.position.copy(eye);d.ctl.update();d.camera.updateMatrixWorld(true);d.renderer.render(d.scene,d.camera);
    },view);
    await page.screenshot({path:out+'/museum-'+view+'-evening.png',timeout:120000});
   }
  }
  if(mode==='workshop'){
   await page.evaluate(()=>__MUSEUM_WORKSHOP.select('np-31-1'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);state.editingPreserved=true;
  }
  assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.checks.push({mode,...state,errors,shaderErrors});await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();browser=null;
 }
 report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:20000}).catch(()=>{});throw e;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('NP_ROYALTENT_BROWSER_PASS',JSON.stringify(report.checks.map(({mode,np})=>({mode,geometry:np.model.geometry}))));
