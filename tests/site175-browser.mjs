import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const mode=process.env.QA_MODE||'desktop',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-site175/'+mode;
await mkdir(out,{recursive:true});
const report={passed:false,mode,base,checks:[],hashes:{},environment:'Full evening museum; Chromium software WebGL, test-only frame stepping. Mobile viewport emulation, not physical-device/FPS testing.'};
let browser,page;const errors=[],shaderErrors=[],failed=[];
const files=['index.html','museum.html','workshop.html','src/silo-sites.js','src/facility-ports.js','src/archive-manifest.js','src/archive-models.js','src/model-catalog.js','data/catalog.json'];
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 if(process.env.VERIFY_PUBLIC==='1'){
  const expected=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(f))])));let pending=[...files];const deadline=Date.now()+150000;
  do{await Promise.all(pending.map(async f=>{try{const r=await fetch(new URL(f+'?site175='+expected[f].slice(0,16),base),{signal:AbortSignal.timeout(12000)});if(r.ok&&hash(Buffer.from(await r.arrayBuffer()))===expected[f])report.hashes[f]=expected[f];}catch{}}));pending=files.filter(f=>!report.hashes[f]);if(pending.length)await new Promise(r=>setTimeout(r,4000));}while(pending.length&&Date.now()<deadline);
  assert.deepEqual(pending,[],'Published files differ from tested revision');
 }
 const entry=mode==='workshop'?'workshop.html':'museum.html';
 // Follow the real public redirect before browser navigation; never rewrite origins.
 const resolved=await fetch(new URL(entry,base),{signal:AbortSignal.timeout(15000)});assert(resolved.ok);const url=new URL(resolved.url);url.search='share=site%3Apad-175&tour=0';
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
 const mobile=mode==='mobile',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let step;window.requestAnimationFrame=f=>f.name==='animate'?(step=f,0):raf(f);window.__SITE175_FRAME=()=>step?.(performance.now());});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__BAIKONUR_QA&&window.__MUSEUM_SHARE,null,{timeout:150000,polling:200});assert(await page.evaluate(()=>__MUSEUM_SHARE.ready));
 async function advance(){return page.evaluate(()=>{__SITE175_FRAME();const start=performance.now();for(let i=0;i<=250;i++)__BAIKONUR_QA.silo.update(start+i*1000/60);__SITE175_FRAME();return __BAIKONUR_QA.silo.stats().find(s=>s.siteId==='pad-175');});}
 report.initial=await advance();assert.equal(report.initial.state,'closed');
 report.site=await page.evaluate(()=>__BAIKONUR_QA.siteState('pad-175'));assert.deepEqual(report.site.map,[196,121]);
 assert.match(await page.locator('#title').innerText(),/175.*Шахтная пусковая установка/);assert(await page.locator('#infoShare').isVisible());assert(await page.getByRole('button',{name:'К шахте',exact:true}).isVisible());assert.equal(await page.evaluate(()=>__BAIKONUR_QA.silo.stats().length),32);
 assert(await page.evaluate(()=>__BAIKONUR_QA.evening.evening));report.checks.push('Direct site175 link, silo model/controller, correct card, preserved anchor, evening scene and sharing');
 if(mode==='desktop')await page.screenshot({path:out+'/site175-closed.png',timeout:60000});
 await page.getByRole('button',{name:'К шахте',exact:true}).click();await page.locator('#close').click();report.opened=await advance();
 assert.equal(report.opened.state,'open');assert(report.opened.lidAngleDeg>100);assert(report.opened.noseTipY<report.opened.rimY);assert.equal(report.opened.steamVisible,true);
 assert.deepEqual(await page.evaluate(()=>__BAIKONUR_QA.silo.stats().filter(s=>s.open).map(s=>s.siteId)),['pad-175']);
 await page.evaluate(()=>__BAIKONUR_QA.setLabelsVisible(false));await page.evaluate(()=>__SITE175_FRAME());await page.screenshot({path:out+'/site175-open.png',timeout:60000});
 report.checks.push('Real close-up button opens only175; lid, recessed shaft and nose rendered, other silos remain closed');
 await page.evaluate(()=>__BAIKONUR_QA.silo.inspect('all','pad-175'));report.closed=await advance();assert.equal(report.closed.state,'closed');assert.equal(report.closed.steamVisible,false);report.checks.push('Retreat closes the lid and stops steam');
 if(mode==='workshop'){
  assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());
  await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-175'));const h=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(h+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),h);report.checks.push('Altimeter and editor retained; height edit and undo');
 }
 assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.deepEqual(failed,[]);report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:15000}).catch(()=>{});process.exitCode=1;}finally{report.errors=errors;report.shaderErrors=shaderErrors;report.failedRequests=failed;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
console.log('SITE175_BROWSER',mode,report.passed);
