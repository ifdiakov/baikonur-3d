import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out=process.env.QA_OUT||'qa-mik-collapse/local';await mkdir(out,{recursive:true});
const report={passed:false,base,environment:'Chromium/software WebGL, staged frames for reproducible images; mobile viewport emulation, not a physical device.',checks:[]};let browser,page;
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  const sha=b=>createHash('sha256').update(b).digest('hex');report.hashes={};
  for(const f of ['index.html','museum.html','workshop.html','src/mik112.js','src/mik112-collapse.js','src/mik112-collapse-sequence.js']){
   const expected=sha(await readFile(f));let actual;const r=await fetch(new URL(f+'?verify='+Date.now(),base),{signal:AbortSignal.timeout(20000)});assert(r.ok,'HTTP '+r.status+' '+f);actual=sha(Buffer.from(await r.arrayBuffer()));assert.equal(actual,expected,'Published revision mismatch: '+f);report.hashes[f]=actual;
  }
 }
 for(const mode of (process.env.QA_MODES||'desktop,mobile,workshop').split(',')){
  const errors=[],shaderErrors=[],requests=[],consoleErrors=[];
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  page=await browser.newPage({viewport:mode==='mobile'?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:1,isMobile:mode==='mobile',hasTouch:mode==='mobile',reducedMotion:'reduce'});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});page.on('request',r=>requests.push(r.url()));page.on('console',m=>{if(m.type()==='error'){consoleErrors.push(m.text());if(/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());}});
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let cb;window.requestAnimationFrame=fn=>fn.name==='animate'?(cb=fn,0):raf(fn);window.__COLLAPSE_FRAME=()=>cb?.();});
  const path=mode==='workshop'?'workshop.html':'museum.html';
  await page.goto(new URL(path+'?view=buran-loss&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA?.mik112Collapse||document.querySelector('#museumLoadingMessage')?.textContent.startsWith('Не удалось'),null,{timeout:180000});
  assert(await page.evaluate(()=>!!window.__BAIKONUR_QA?.mik112Collapse),'Startup failed: '+consoleErrors.join('\n'));
  await page.evaluate(()=>__COLLAPSE_FRAME());
  const before=await page.evaluate(()=>({rockets:__BAIKONUR_QA.rockets.stats().placements,roof:__BAIKONUR_QA.stats().mik112.roofState,camera:__BAIKONUR_QA.cameraState(),evening:__BAIKONUR_QA.evening.evening}));
  assert(!before.rockets.some(e=>e.key==='mik112-hall'));assert(before.evening);assert(!requests.some(u=>u.includes('mik112-collapse.js')),'Animation must load on demand');
  await page.locator('#mik112Collapse').click();await page.waitForFunction(()=>__BAIKONUR_QA.mik112Collapse.stats().active,null,{timeout:120000});
  for(const t of mode==='desktop'?[0,11,18,32]:[0,32]){
   await page.evaluate(t=>{__BAIKONUR_QA.mik112Collapse.seek(t);__COLLAPSE_FRAME();},t);
   await page.screenshot({path:out+'/'+mode+'-'+t+'.png',timeout:90000});
  }
  let states=await page.evaluate(()=>__BAIKONUR_QA.mik112Collapse.stats());assert.equal(states.time,32);assert.equal(states.roofSections,36);assert.equal(states.modelVisible,false);
  await page.locator('#mikCollapseProgress').fill('0');await page.locator('#mikCollapseProgress').dispatchEvent('input');await page.locator('#mikCollapseCutaway').click();await page.evaluate(()=>__COLLAPSE_FRAME());
  assert((await page.evaluate(()=>__BAIKONUR_QA.mik112Collapse.stats())).modelVisible);assert((await page.evaluate(()=>__BAIKONUR_QA.mik112Collapse.stats())).cutaway);
  await page.screenshot({path:out+'/'+mode+'-cutaway.png',timeout:90000});
  await page.evaluate(()=>{const q=__BAIKONUR_QA.mik112Collapse;q.play();q.update(1000);for(let t=1020;t<=2000;t+=20)q.update(t);q.pause();});assert((await page.evaluate(()=>__BAIKONUR_QA.mik112Collapse.stats())).time>.9);
  const panelBounds=await page.locator('#mikCollapsePanel').boundingBox();const viewport=page.viewportSize();assert(panelBounds.x>=0&&panelBounds.x+panelBounds.width<=viewport.width+.5);
  for(const id of ['mikCollapseClose','mikCollapsePlay','mikCollapseProgress','mikCollapseCutaway'])assert(await page.locator('#'+id).isVisible());
  await page.locator('#mikCollapseClose').click();await page.evaluate(()=>__COLLAPSE_FRAME());
  const after=await page.evaluate(()=>({state:__BAIKONUR_QA.mik112Collapse.stats(),roof:__BAIKONUR_QA.stats().mik112.roofState,camera:__BAIKONUR_QA.cameraState(),evening:__BAIKONUR_QA.evening.evening,shaders:__BAIKONUR_QA.stats().shadersValid}));
  assert.equal(after.state.active,false);assert.equal(after.state.modelVisible,false);assert.equal(after.roof,before.roof);assert(after.evening&&after.shaders);assert.deepEqual(after.camera,before.camera,'Map camera restored on exit');
  await page.locator('#mik112Collapse').click();await page.waitForFunction(()=>__BAIKONUR_QA.mik112Collapse.stats().active);assert.equal((await page.evaluate(()=>__BAIKONUR_QA.mik112Collapse.stats())).groupCount,1);await page.keyboard.press('Escape');assert(!(await page.evaluate(()=>__BAIKONUR_QA.mik112Collapse.stats())).active);
  assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.checks.push({mode,passed:true,sourceHashVerified:process.env.VERIFY_PUBLIC==='1',defaultHallExhibitRemoved:true,tuaCount:before.rockets.filter(r=>r.key.startsWith('tua-')).length,cameraRestored:true,states:after.state,errors,shaderErrors});
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();browser=null;
 }
 report.passed=true;
}catch(e){report.error=e.stack;report.pageState=await page?.evaluate(()=>({startup:window.__MUSEUM_STARTUP?.stats(),body:document.body.className})).catch(()=>null);await page?.screenshot({path:out+'/failure.png',timeout:15000}).catch(()=>{});throw e;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('MIK112_COLLAPSE_BROWSER_PASS',JSON.stringify(report.checks.map(c=>({mode:c.mode,passed:c.passed}))));
