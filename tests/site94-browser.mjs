import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{chromium}from'playwright';
const mode=process.env.QA_MODE||'desktop',base=process.env.BAIKONUR_URL||'http://127.0.0.1:8765/',out='qa-site94/'+mode;
await mkdir(out,{recursive:true});const report={passed:false,mode,base,checks:[],hashes:{},environment:'Complete evening museum, Chromium software WebGL; mobile viewport emulation, not physical device. Frame stepping is test-only.'};let browser,page;const errors=[],failed=[],shaderErrors=[];
try{
 const entry=mode==='workshop'?'workshop.html':'museum.html';
 if(process.env.VERIFY_PUBLIC==='1'){
  const names=[entry,'src/site94.js','src/site94-records.js','src/site94-streets.js','src/site94-road-grade.js','src/map-visible-sites.js','src/archive-models.js','src/archive-manifest.js'],hash=b=>createHash('sha256').update(b).digest('hex');
  const expected=Object.fromEntries(await Promise.all(names.map(async n=>[n,hash(await readFile(n))])));let pending=[...names];const until=Date.now()+120000;
  do{await Promise.all(pending.map(async n=>{try{const r=await fetch(new URL(n+'?s94='+expected[n].slice(0,12),base),{signal:AbortSignal.timeout(10000)});if(r.ok&&hash(Buffer.from(await r.arrayBuffer()))===expected[n])report.hashes[n]=expected[n];}catch{}}));pending=names.filter(n=>!report.hashes[n]);if(pending.length)await new Promise(r=>setTimeout(r,3000));}while(pending.length&&Date.now()<until);assert.deepEqual(pending,[]);
 }
 const initial=new URL(entry+'?share=site%3Apad-94%D0%B0&tour=0',base).href;
 const real=(await fetch(initial,{signal:AbortSignal.timeout(20000)})).url;report.navigation=real;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1440,height:960},isMobile:mode==='mobile',hasTouch:mode==='mobile',permissions:['clipboard-read','clipboard-write'],serviceWorkers:'block'});
 await ctx.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);let frame;window.requestAnimationFrame=f=>f.name==='animate'?(frame=f,0):raf(f);window.__S94_FRAME=()=>frame?.(performance.now());});
 page=await ctx.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID_OPERATION/.test(m.text()))shaderErrors.push(m.text());});
 await page.goto(real,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>document.body.classList.contains('museum-ready')&&window.__MUSEUM_SHARE,null,{timeout:150000,polling:250});
 assert(await page.evaluate(()=>__MUSEUM_SHARE.ready));assert.equal((await page.evaluate(()=>__MUSEUM_SHARE.current())).id,'pad-94');report.checks.push('Old Cyrillic94A link opens unified94/94A card');
 const targets=await page.evaluate(()=>__MUSEUM_SHARE.targets().filter(t=>/^pad-94[aа]?$/iu.test(t.id)));assert.equal(targets.length,1);assert((await page.locator('#title').innerText()).includes('94А'));report.targets=targets;
 const model=await page.evaluate(()=>__BAIKONUR_QA.site94.stats());assert(model?.merged&&model.members===2);assert.equal(model.footprints.length,10);assert.equal(model.serviceRoads.sourceWayCount,18);assert.equal(model.serviceRoads.sharedSoil,true);assert(model.serviceRoads.earthMeshCount>0);report.model=model;report.checks.push('Earth shoulders use the existing world-aligned steppe texture, not a grey apron');
 assert(await page.evaluate(()=>__BAIKONUR_QA.evening.evening));assert(await page.evaluate(()=>__BAIKONUR_QA.stats().shadersValid));
 for(const view of mode==='desktop'?['all','hall','gates']:['gates']){await page.locator('[data-site94-view="'+view+'"]').click();await page.evaluate(()=>__S94_FRAME());await page.screenshot({path:out+'/site94-'+view+'.png',timeout:60000});}
 await page.bringToFront();await page.locator('#infoShare').click();await page.waitForFunction(()=>document.querySelector('.museum-share-toast')?.textContent==='Ссылка скопирована в буфер обмена');assert.equal(new URL(await page.evaluate(()=>navigator.clipboard.readText())).searchParams.get('share'),'site:pad-94');report.checks.push('Canonical clipboard link, merged label and working view controls');
 for(const id of ['pad-94a','pad-94А','pad-94A']){assert(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id));assert.equal((await page.evaluate(()=>__MUSEUM_SHARE.current())).id,'pad-94');}
 if(mode==='workshop'){
  assert(await page.locator('#cameraAltitude').isVisible());assert(await page.locator('#workshopPanel').isVisible());await page.evaluate(()=>__MUSEUM_WORKSHOP.select('pad-94'));assert.equal(await page.locator('#wsObject option[value="pad-94а"]').count(),0);const height=Number(await page.locator('#wsHeight').inputValue());await page.locator('#wsHeight').fill(String(height+.1));await page.locator('#wsApply').click();await page.locator('#wsUndo').click();assert.equal(Number(await page.locator('#wsHeight').inputValue()),height);report.checks.push('Single admin selection; height editor, altimeter and undo retained');
 }
 for(const id of ['pad-82','pad-83','pad-92','pad-95','pad-175'])assert(await page.evaluate(id=>__MUSEUM_SHARE.open({kind:'site',id}),id));
 assert.deepEqual(errors,[]);assert.deepEqual(shaderErrors,[]);assert.deepEqual(failed,[]);report.passed=true;
}catch(e){report.error=e.stack;await page?.screenshot({path:out+'/failure.png',timeout:20000}).catch(()=>{});process.exitCode=1;}finally{report.errors=errors;report.shaderErrors=shaderErrors;report.failedRequests=failed;await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}console.log('SITE94_BROWSER',mode,report.passed);
