import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',prefix=process.env.QA_PREFIX||'local',out=process.env.QA_OUT||'qa-buran-loss';await mkdir(out,{recursive:true});
const report={passed:false,base,environment:'Chromium/Linux/software WebGL. Mobile viewport emulation; animation frame stepping only in tests, not a physical device or FPS benchmark.',checks:[]};let browser,page;
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  report.publicHashes={};for(const file of ['index.html','museum.html','workshop.html','src/buran-loss.js','src/buran-loss-scene.js','src/buran-loss.css']){const expected=hash(await readFile(file));let actual;for(let i=0;i<16;i++){const r=await fetch(new URL(file+'?verify=buran-loss-'+Date.now(),base),{signal:AbortSignal.timeout(12000)});if(r.ok)actual=hash(Buffer.from(await r.arrayBuffer()));if(actual===expected)break;await new Promise(r=>setTimeout(r,4000));}assert.equal(actual,expected,'Published file mismatch: '+file);report.publicHashes[file]=actual;}
 }
 for(const mode of (process.env.QA_MODES||'desktop,mobile,workshop').split(',')){
  browser=await chromium.launch({headless:process.env.HEADLESS!=='0',executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle='+(process.env.BROWSER_ANGLE||'swiftshader'),'--ignore-gpu-blocklist','--enable-webgl','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  const mobile=mode==='mobile',ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});page=await ctx.newPage();page.setDefaultTimeout(60000);
  const errors=[],shaderErrors=[],requested=[],failed=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});page.on('request',r=>requested.push(r.url()));page.on('requestfailed',r=>failed.push({url:r.url(),message:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let frame;window.requestAnimationFrame=fn=>fn.name==='animate'?(frame=fn,0):raf(fn);window.__LOSS_FRAME=()=>frame?.();});
  await page.goto(new URL((mode==='workshop'?'workshop.html':'museum.html')+'?view=buran-loss&tour=0',base).href,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.body.classList.contains('museum-ready')||document.getElementById('error')?.textContent,null,{timeout:150000});assert.equal(await page.locator('#error').textContent(),'');assert(await page.evaluate(()=>!!window.__BAIKONUR_QA?.buranLoss));
  await page.evaluate(()=>{__BAIKONUR_QA.setLabelsVisible(false);__LOSS_FRAME();});
  const initial=await page.evaluate(()=>({rockets:__BAIKONUR_QA.stats().rockets,scene:__BAIKONUR_QA.stats().mik112,camera:__BAIKONUR_QA.cameraState(),evening:__BAIKONUR_QA.evening.evening,admin:!!window.__MUSEUM_WORKSHOP}));
  assert(!initial.rockets.placements.some(r=>r.key==='mik112-hall'));assert(initial.rockets.placements.some(r=>r.key==='tua-0'));assert(initial.rockets.placements.some(r=>r.key==='tua-1'));assert(initial.evening);assert.equal(initial.admin,mode==='workshop');assert(!requested.some(u=>u.includes('/src/buran-loss.js?')),'Animation must load only on demand');assert(await page.locator('#buranLossStart').isVisible());
  await page.screenshot({path:out+'/'+prefix+'-'+mode+'-normal.png'});
  await page.locator('#buranLossStart').click();await page.waitForFunction(()=>window.__BAIKONUR_QA.buranLoss.stats().active,null,{timeout:120000});
  await page.waitForTimeout(90);await page.evaluate(()=>__LOSS_FRAME());assert(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().time>0),'Production animation loop must advance the reconstruction');
  await page.evaluate(()=>{__BAIKONUR_QA.buranLoss.pause();__BAIKONUR_QA.buranLoss.seek(0);__LOSS_FRAME();});
  assert(await page.locator('#buranLossPanel').isVisible());
  const phases=[];
  for(const t of (mode==='desktop'?[0,8.5,10.5,18,28]:[0,28])){
   await page.evaluate(t=>{__BAIKONUR_QA.buranLoss.seek(t);__BAIKONUR_QA.buranLoss.view(t===0?'inside':'overview');__LOSS_FRAME();},t);
   const state=await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats());assert(state.active);assert.equal(state.time,t);assert.equal(state.structure.flames,0);if(t===28){assert(!state.payload.intactVisible);assert(state.payload.fragmentsVisible);assert(!state.structure.dustVisible);}
   phases.push(state);await page.screenshot({path:out+'/'+prefix+'-'+mode+'-t'+String(t).replace('.','_')+'.png',timeout:90000});
  }
  // Exercise actual buttons, pointer scrubber and keyboard, not just QA API.
  await page.locator('#buranLossRestart').click();assert(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().playing));await page.locator('#buranLossPlay').click();assert(!(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().playing)));
  await page.locator('#buranLossSeek').fill('12');await page.locator('#buranLossSeek').dispatchEvent('input');assert.equal(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().time),12);
  await page.locator('#buranLossTop').click();assert.equal(await page.evaluate(()=>__BAIKONUR_QA.buranLoss.stats().view),'top');
  if(mobile){const bounds=await page.locator('#buranLossPanel').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert(bounds.y>=0&&bounds.y+bounds.height<=845);}
  await page.locator('#buranLossClose').click();await page.evaluate(()=>__LOSS_FRAME());assert(await page.locator('#buranLossPanel').isHidden());
  const restored=await page.evaluate(()=>({stats:__BAIKONUR_QA.buranLoss.stats(),camera:__BAIKONUR_QA.cameraState(),scene:__BAIKONUR_QA.stats().mik112,evening:__BAIKONUR_QA.evening.evening,shaders:__BAIKONUR_QA.stats().shadersValid}));
  assert(!restored.stats.active);assert.equal(restored.stats.structure,null);assert(restored.evening&&restored.shaders);assert.equal(restored.scene.roofState,initial.scene.roofState);assert.equal(restored.scene.transporterCount,2);
  if(mode==='desktop'){
   await page.locator('#buranLossStart').click();await page.waitForFunction(()=>__BAIKONUR_QA.buranLoss.stats().active);await page.evaluate(()=>__BAIKONUR_QA.buranLoss.seek(28));await page.locator('#buranLossClose').click();assert.equal(await page.locator('#buranLossPanel').count(),1);
   await page.evaluate(()=>__BAIKONUR_QA.openObject('pad-95'));assert(await page.locator('#buranLossStart').isHidden());
  }
  if(mode==='workshop'){await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-112'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);}
  assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);report.checks.push({mode,initial,phases,restored,errors,shaderErrors,failedRequests:failed});await writeFile(out+'/'+prefix+'-report.json',JSON.stringify(report,null,2));console.log('MODE_OK',mode);await browser.close();browser=null;
 }
 report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/'+prefix+'-failure.png',timeout:10000}).catch(()=>{});throw e;}finally{await writeFile(out+'/'+prefix+'-report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('BURAN_LOSS_BROWSER_PASS',report.checks.map(c=>c.mode).join(','));
